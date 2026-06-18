import EventEmitter from 'events';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { createPostgresAuthState } from './postgresAuthState.js';
import db from '../db.js';

// Reconexão com backoff exponencial: 3s, 6s, 12s, ... até o teto.
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 5 * 60 * 1000; // 5 min
const RECONNECT_MAX_ATTEMPTS = 12;
// Cache de onWhatsApp para não consultar o servidor em todo envio.
const JID_CACHE_TTL_MS = 5 * 60 * 1000;
// Anti-ban: intervalo mínimo entre envios da mesma sessão.
const SEND_MIN_INTERVAL_MS = Number(process.env.WA_SEND_MIN_INTERVAL_MS || 350);
// Healthcheck: verifica periodicamente se sockets "conectados" continuam vivos.
const HEALTHCHECK_INTERVAL_MS = 60 * 1000;
// Logs verbosos por mensagem só quando WA_DEBUG=1.
const WA_DEBUG = process.env.WA_DEBUG === '1' || process.env.WA_DEBUG === 'true';

export class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });
    // Locks de inicialização para evitar duas instâncias Baileys no mesmo tenant.
    this._initPromises = new Map();
    // Timers de reconexão pendentes, por tenant (para cancelar no logout/start).
    this._reconnectTimers = new Map();
    // Contador de tentativas de reconexão, por tenant.
    this._reconnectAttempts = new Map();
    // Cache de resolução de JID (número -> jid), por tenant.
    this._jidCache = new Map();
    // Fila/throttle de envio, por tenant.
    this._sendQueues = new Map();
    this._lastSendTs = new Map();
    this._cachedVersion = null;
    this._startHealthcheck();
  }

  async restaurarSessoes() {
    const sessoes = await db.manyOrNone(
      `SELECT tenant_id FROM whatsapp_sessoes WHERE creds IS NOT NULL AND status != 'desconectado'`
    );
    // Restaura com concorrência limitada: paraleliza (não serializa 50 tenants),
    // mas sem estourar o pool do Postgres recém-iniciado.
    const LOTE = Number(process.env.WA_RESTORE_CONCURRENCY || 4);
    for (let i = 0; i < sessoes.length; i += LOTE) {
      const fatia = sessoes.slice(i, i + LOTE);
      const resultados = await Promise.allSettled(fatia.map((s) => this.start(s.tenant_id)));
      resultados.forEach((r, j) => {
        const tid = fatia[j].tenant_id;
        if (r.status === 'fulfilled') {
          console.log(`[WA] Restored session for tenant ${tid}`);
        } else {
          console.error(`[WA] Failed to restore session for tenant ${tid}:`, r.reason?.message || r.reason);
        }
      });
    }
  }

  async start(tenantId) {
    // Lock: se já há uma inicialização em curso, devolve a mesma promise.
    if (this._initPromises.has(tenantId)) {
      return this._initPromises.get(tenantId);
    }

    if (this.sessions.has(tenantId)) {
      const existing = this.sessions.get(tenantId);
      if (existing.status === 'conectado' || existing.status === 'conectando') {
        return;
      }
      await this._cleanupSession(tenantId);
    }

    // Cancela qualquer reconexão agendada: vamos iniciar agora.
    this._cancelReconnect(tenantId);

    const p = this._initSession(tenantId).finally(() => {
      this._initPromises.delete(tenantId);
    });
    this._initPromises.set(tenantId, p);
    return p;
  }

  async _getVersion() {
    if (this._cachedVersion) return this._cachedVersion;
    try {
      const { version } = await fetchLatestBaileysVersion();
      this._cachedVersion = version;
    } catch (err) {
      console.error('[WA] fetchLatestBaileysVersion falhou, usando versão em cache/padrão:', err.message);
    }
    return this._cachedVersion || undefined;
  }

  async _initSession(tenantId) {
    this.sessions.set(tenantId, { sock: null, status: 'conectando' });

    try {
      const { state, saveCreds } = await createPostgresAuthState(db, tenantId);
      const version = await this._getVersion();

      const sock = makeWASocket({
        version,
        logger: this.logger,
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        await this._handleConnectionUpdate(tenantId, update, sock);
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (WA_DEBUG) {
          console.log(`[WA] messages.upsert tenant=${tenantId} type=${type} count=${messages.length}`);
        }
        for (const msg of messages) {
          const hasContent = !!msg.message;
          const jid = msg.key.remoteJid || '';
          if (WA_DEBUG) {
            console.log(`[WA] msg from=${jid} fromMe=${msg.key.fromMe} hasContent=${hasContent} stub=${msg.messageStubType ?? '-'}`);
          }
          if (
            hasContent &&
            !jid.includes('@broadcast') &&
            !jid.includes('@status') &&
            !jid.endsWith('@g.us') &&        // ignora mensagens de grupo
            !jid.endsWith('@newsletter')     // ignora canais/newsletter
          ) {
            this.emit('message', { tenantId, msg, sock, upsertType: type });
          }
        }
      });

      sock.ev.on('messages.update', (updates) => {
        if (WA_DEBUG) console.log(`[WA] messages.update tenant=${tenantId} count=${updates.length}`, JSON.stringify(updates).slice(0, 500));
        this.emit('message-status', { tenantId, updates });
      });

      // Presença do cidadão (digitando / online) — repassada ao gateway.
      sock.ev.on('presence.update', ({ id, presences }) => {
        this.emit('presence', { tenantId, id, presences });
      });

      this.sessions.set(tenantId, { sock, status: 'conectando' });
    } catch (err) {
      console.error(`[WA] Error starting session for tenant ${tenantId}:`, err.message);
      this.sessions.delete(tenantId);
      throw err;
    }
  }

  async _handleConnectionUpdate(tenantId, update, sock) {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        this.emit('qr', { tenantId, qr: qrDataUrl, qrRaw: qr });
        await db.none(
          `INSERT INTO whatsapp_sessoes (tenant_id, status) VALUES ($1, 'qr')
           ON CONFLICT (tenant_id) DO UPDATE SET status = 'qr', atualizado_em = now()`,
          [tenantId]
        );
        this.sessions.set(tenantId, { ...this.sessions.get(tenantId), status: 'qr' });
      } catch (err) {
        console.error(`[WA] QR generation error for tenant ${tenantId}:`, err.message);
      }
    }

    if (connection === 'open') {
      console.log(`[WA] Connected for tenant ${tenantId}`);
      this._reconnectAttempts.delete(tenantId); // zera backoff em conexão bem-sucedida
      const number = this._extractNumber(sock);
      await db.none(
        `UPDATE whatsapp_sessoes SET status = 'conectado', numero = $2, conectado_em = now(), atualizado_em = now()
         WHERE tenant_id = $1`,
        [tenantId, number]
      );
      this.sessions.set(tenantId, { sock, status: 'conectado', number });
      this.emit('connected', { tenantId, numero: number });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[WA] Logged out for tenant ${tenantId}`);
        await db.none(
          `UPDATE whatsapp_sessoes SET status = 'desconectado', creds = NULL, keys = NULL, numero = NULL, atualizado_em = now()
           WHERE tenant_id = $1`,
          [tenantId]
        );
        this._cancelReconnect(tenantId);
        this._reconnectAttempts.delete(tenantId);
        this.sessions.delete(tenantId);
        this.emit('logout', { tenantId });
      } else if (shouldReconnect) {
        this._agendarReconexao(tenantId);
      } else {
        this.sessions.delete(tenantId);
      }
    }
  }

  // Agenda reconexão com backoff exponencial e teto de tentativas.
  async _agendarReconexao(tenantId) {
    const attempts = (this._reconnectAttempts.get(tenantId) || 0) + 1;
    this._reconnectAttempts.set(tenantId, attempts);

    if (attempts > RECONNECT_MAX_ATTEMPTS) {
      console.error(`[WA] Tenant ${tenantId}: limite de ${RECONNECT_MAX_ATTEMPTS} reconexões atingido, desistindo.`);
      await db.none(
        `UPDATE whatsapp_sessoes SET status = 'desconectado', atualizado_em = now() WHERE tenant_id = $1`,
        [tenantId]
      ).catch(() => {});
      this._reconnectAttempts.delete(tenantId);
      this.sessions.delete(tenantId);
      this.emit('falha-conexao', { tenantId, tentativas: attempts - 1 });
      return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempts - 1), RECONNECT_MAX_MS);
    console.log(`[WA] Connection closed for tenant ${tenantId}, reconnecting in ${Math.round(delay / 1000)}s (tentativa ${attempts}/${RECONNECT_MAX_ATTEMPTS})...`);
    await db.none(
      `UPDATE whatsapp_sessoes SET status = 'conectando', atualizado_em = now() WHERE tenant_id = $1`,
      [tenantId]
    ).catch(() => {});
    this.sessions.set(tenantId, { sock: null, status: 'reconnecting' });

    this._cancelReconnect(tenantId);
    const timer = setTimeout(() => {
      this._reconnectTimers.delete(tenantId);
      this._initSession(tenantId).catch((e) =>
        console.error(`[WA] Reconnect init error for tenant ${tenantId}:`, e.message)
      );
    }, delay);
    this._reconnectTimers.set(tenantId, timer);
  }

  _cancelReconnect(tenantId) {
    const timer = this._reconnectTimers.get(tenantId);
    if (timer) {
      clearTimeout(timer);
      this._reconnectTimers.delete(tenantId);
    }
  }

  _startHealthcheck() {
    if (this._healthTimer) return;
    this._healthTimer = setInterval(() => {
      for (const [tenantId, session] of this.sessions.entries()) {
        if (session.status === 'conectado') {
          const ws = session.sock?.ws;
          // ws.readyState: 1 = OPEN. Qualquer outro estado indica sessão morta.
          const aberto = ws && (ws.readyState === undefined || ws.readyState === 1);
          if (!aberto) {
            console.warn(`[WA] Healthcheck: sessão do tenant ${tenantId} parece morta, reconectando.`);
            this.sessions.set(tenantId, { sock: null, status: 'reconnecting' });
            this._agendarReconexao(tenantId);
          }
        }
      }
    }, HEALTHCHECK_INTERVAL_MS);
    if (this._healthTimer.unref) this._healthTimer.unref();
  }

  _extractNumber(sock) {
    try {
      if (sock.user?.id) {
        return sock.user.id.split(':')[0];
      }
      return null;
    } catch {
      return null;
    }
  }

  _getSession(tenantId) {
    const session = this.sessions.get(tenantId);
    if (!session || !session.sock) {
      throw new Error(`WhatsApp session not connected for tenant ${tenantId}`);
    }
    if (session.status !== 'conectado') {
      throw new Error(`WhatsApp session not connected (status: ${session.status}) for tenant ${tenantId}`);
    }
    return session;
  }

  // Serializa os envios de um tenant respeitando um intervalo mínimo (anti-ban).
  _enqueueSend(tenantId, task) {
    const prev = this._sendQueues.get(tenantId) || Promise.resolve();
    const run = prev.then(async () => {
      const last = this._lastSendTs.get(tenantId) || 0;
      const espera = SEND_MIN_INTERVAL_MS - (Date.now() - last);
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      try {
        return await task();
      } finally {
        this._lastSendTs.set(tenantId, Date.now());
      }
    });
    // A cadeia continua mesmo se este envio falhar (catch só para manter o encadeamento).
    this._sendQueues.set(tenantId, run.catch(() => {}));
    return run;
  }

  async sendText(tenantId, jid, texto) {
    const { sock } = this._getSession(tenantId);
    return this._enqueueSend(tenantId, async () => {
      try {
        const destino = await this._resolveRecipientJid(tenantId, sock, jid);
        const result = await this._comRetry(() => sock.sendMessage(destino, { text: texto }));
        return result;
      } catch (err) {
        if (err.message?.includes('not connected')) {
          this.sessions.set(tenantId, { ...this.sessions.get(tenantId), status: 'disconnected' });
        }
        throw err;
      }
    });
  }

  async sendMedia(tenantId, jid, { tipo, buffer, mimetype, fileName, caption }) {
    const { sock } = this._getSession(tenantId);
    return this._enqueueSend(tenantId, async () => {
      const destino = await this._resolveRecipientJid(tenantId, sock, jid);
      const payload = this._buildMediaPayload(tipo, buffer, mimetype, fileName, caption);
      return this._comRetry(() => sock.sendMessage(destino, payload));
    });
  }

  // Retry simples para falhas transitórias de envio.
  async _comRetry(fn, tentativas = 2) {
    let ultimoErro;
    for (let i = 0; i <= tentativas; i++) {
      try {
        return await fn();
      } catch (err) {
        ultimoErro = err;
        // Erros definitivos não devem ser repetidos.
        if (err.message?.includes('not connected') || err.message?.includes('não encontrado')) {
          throw err;
        }
        if (i < tentativas) {
          await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
      }
    }
    throw ultimoErro;
  }

  async _resolveRecipientJid(tenantId, sock, jid) {
    const raw = String(jid || '').trim();

    if (raw.endsWith('@s.whatsapp.net') || raw.endsWith('@lid') || raw.endsWith('@g.us') || raw.endsWith('@broadcast')) {
      return raw;
    }

    const number = raw.split('@')[0]?.replace(/\D/g, '');
    if (!number) {
      throw new Error('Destinatário WhatsApp inválido');
    }

    // Cache por tenant+número (TTL).
    const cacheKey = `${tenantId}:${number}`;
    const cached = this._jidCache.get(cacheKey);
    if (cached && cached.expira > Date.now()) {
      return cached.jid;
    }

    const lookupTarget = `${number}@s.whatsapp.net`;
    if (typeof sock.onWhatsApp !== 'function') {
      return lookupTarget;
    }

    const [match] = await sock.onWhatsApp(lookupTarget);
    if (WA_DEBUG) {
      console.log(`[WA] onWhatsApp target=${lookupTarget} exists=${match?.exists === true} jid=${match?.jid || '-'}`);
    }
    if (!match?.exists) {
      throw new Error(`Número ${number} não encontrado no WhatsApp`);
    }
    const resolvido = match.jid || lookupTarget;
    this._jidCache.set(cacheKey, { jid: resolvido, expira: Date.now() + JID_CACHE_TTL_MS });
    return resolvido;
  }

  _buildMediaPayload(tipo, buffer, mimetype, fileName, caption) {
    const base = { caption };
    // Normaliza rótulos PT (usados no app/DB) para os do payload Baileys.
    const mapaTipo = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' };
    tipo = mapaTipo[tipo] || tipo;
    switch (tipo) {
      case 'image':
        return { image: buffer, mimetype, ...base };
      case 'video':
        return { video: buffer, mimetype, ...base };
      case 'audio':
        return { audio: buffer, mimetype, ptt: true };
      case 'document':
        return { document: buffer, mimetype, fileName, ...base };
      default:
        return { document: buffer, mimetype, fileName, ...base };
    }
  }

  async setTyping(tenantId, jid, ligado) {
    try {
      const { sock } = this._getSession(tenantId);
      return sock.sendPresenceUpdate(ligado ? 'composing' : 'paused', jid);
    } catch {
    }
  }

  // Revoga (apaga para todos) uma mensagem já enviada, se ainda for possível.
  // Best-effort: requer a key completa do WhatsApp.
  async revokeMessage(tenantId, jid, waMessageId, fromMe = true) {
    try {
      const { sock } = this._getSession(tenantId);
      const destino = await this._resolveRecipientJid(tenantId, sock, jid);
      return await sock.sendMessage(destino, {
        delete: { remoteJid: destino, id: waMessageId, fromMe },
      });
    } catch (err) {
      console.error(`[WA] revokeMessage error tenant=${tenantId}:`, err.message);
      return null;
    }
  }

  // Busca a foto de perfil do WhatsApp de um contato.
  // Retorna a URL da imagem ou null se não houver foto.
  async fetchProfilePicture(tenantId, jid) {
    try {
      const { sock } = this._getSession(tenantId);
      const ppUrl = await sock.profilePictureUrl(jid, 'image');
      return ppUrl || null;
    } catch {
      return null;
    }
  }

  // Assina a presença de um contato para receber updates de "digitando"/online.
  async subscribePresence(tenantId, jid) {
    try {
      const { sock } = this._getSession(tenantId);
      return sock.presenceSubscribe(jid);
    } catch {
    }
  }

  async logout(tenantId) {
    this._cancelReconnect(tenantId);
    this._reconnectAttempts.delete(tenantId);
    try {
      const session = this.sessions.get(tenantId);
      if (session?.sock) {
        await session.sock.logout();
      }
    } catch (err) {
      console.error(`[WA] Logout error for tenant ${tenantId}:`, err.message);
    }
    await db.none(
      `UPDATE whatsapp_sessoes SET status = 'desconectado', creds = NULL, keys = NULL, numero = NULL, atualizado_em = now()
       WHERE tenant_id = $1`,
      [tenantId]
    );
    this.sessions.delete(tenantId);
    this.emit('logout', { tenantId });
  }

  async _cleanupSession(tenantId) {
    this._cancelReconnect(tenantId);
    const session = this.sessions.get(tenantId);
    if (session?.sock) {
      try {
        session.sock.ws?.close();
      } catch {}
    }
    this.sessions.delete(tenantId);
  }

  isConnected(tenantId) {
    const session = this.sessions.get(tenantId);
    return session?.status === 'conectado' && session?.sock !== null;
  }

  getStatus(tenantId) {
    const session = this.sessions.get(tenantId);
    const status = session?.status || 'desconectado';
    // 'reconnecting'/'disconnected' são estados internos; o cliente só conhece
    // conectado/conectando/qr/desconectado.
    if (status === 'reconnecting') return 'conectando';
    if (status === 'disconnected') return 'desconectado';
    return status;
  }

  getNumber(tenantId) {
    const session = this.sessions.get(tenantId);
    return session?.number || null;
  }
}
