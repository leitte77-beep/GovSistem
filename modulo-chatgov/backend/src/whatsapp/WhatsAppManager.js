import EventEmitter from 'events';
import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { createPostgresAuthState } from './postgresAuthState.js';
import db from '../db.js';

export class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.logger = pino({ level: process.env.WA_LOG_LEVEL || 'silent' });
  }

  async restaurarSessoes() {
    const sessoes = await db.manyOrNone(
      `SELECT tenant_id FROM whatsapp_sessoes WHERE creds IS NOT NULL AND status != 'desconectado'`
    );
    for (const sessao of sessoes) {
      try {
        await this.start(sessao.tenant_id);
        console.log(`[WA] Restored session for tenant ${sessao.tenant_id}`);
      } catch (err) {
        console.error(`[WA] Failed to restore session for tenant ${sessao.tenant_id}:`, err.message);
      }
    }
  }

  async start(tenantId) {
    if (this.sessions.has(tenantId)) {
      const existing = this.sessions.get(tenantId);
      if (existing.status === 'conectado' || existing.status === 'conectando') {
        return;
      }
      await this._cleanupSession(tenantId);
    }

    await this._initSession(tenantId);
  }

  async _initSession(tenantId) {
    this.sessions.set(tenantId, { sock: null, status: 'conectando' });

    try {
      const { state, saveCreds } = await createPostgresAuthState(db, tenantId);
      const { version } = await fetchLatestBaileysVersion();

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
        console.log(`[WA] messages.upsert tenant=${tenantId} type=${type} count=${messages.length}`);
        for (const msg of messages) {
          const hasContent = !!msg.message;
          console.log(`[WA] msg from=${msg.key.remoteJid} senderPn=${msg.key.senderPn || '-'} participantPn=${msg.key.participantPn || '-'} fromMe=${msg.key.fromMe} hasContent=${hasContent} stub=${msg.messageStubType ?? '-'}`);
          if (
            hasContent &&
            !msg.key.remoteJid?.includes('@broadcast') &&
            !msg.key.remoteJid?.includes('@status')
          ) {
            this.emit('message', { tenantId, msg, sock, upsertType: type });
          }
        }
      });

      sock.ev.on('messages.update', (updates) => {
        this.emit('message-status', { tenantId, updates });
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
        this.sessions.delete(tenantId);
        this.emit('logout', { tenantId });
      } else if (shouldReconnect) {
        console.log(`[WA] Connection closed for tenant ${tenantId}, reconnecting in 3s...`);
        await db.none(
          `UPDATE whatsapp_sessoes SET status = 'conectando', atualizado_em = now()
           WHERE tenant_id = $1`,
          [tenantId]
        );
        this.sessions.set(tenantId, { sock: null, status: 'reconnecting' });
        setTimeout(() => this._initSession(tenantId), 3000);
      } else {
        this.sessions.delete(tenantId);
      }
    }
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

  async sendText(tenantId, jid, texto) {
    const { sock } = this._getSession(tenantId);
    try {
      const destino = await this._resolveRecipientJid(sock, jid);
      console.log(`[WA] sendText tenant=${tenantId} requested=${jid} resolved=${destino}`);
      const result = await sock.sendMessage(destino, { text: texto });
      console.log(`[WA] sendText result id=${result?.key?.id || '-'} remoteJid=${result?.key?.remoteJid || '-'}`);
      return result;
    } catch (err) {
      if (err.message?.includes('not connected')) {
        this.sessions.set(tenantId, { ...this.sessions.get(tenantId), status: 'disconnected' });
      }
      throw err;
    }
  }

  async sendMedia(tenantId, jid, { tipo, buffer, mimetype, fileName, caption }) {
    const { sock } = this._getSession(tenantId);
    const destino = await this._resolveRecipientJid(sock, jid);
    const payload = this._buildMediaPayload(tipo, buffer, mimetype, fileName, caption);
    return sock.sendMessage(destino, payload);
  }

  async _resolveRecipientJid(sock, jid) {
    const raw = String(jid || '').trim();

    if (raw.endsWith('@s.whatsapp.net') || raw.endsWith('@lid') || raw.endsWith('@g.us') || raw.endsWith('@broadcast')) {
      return raw;
    }

    const number = raw.split('@')[0]?.replace(/\D/g, '');
    if (!number) {
      throw new Error('Destinatário WhatsApp inválido');
    }

    const lookupTarget = `${number}@s.whatsapp.net`;
    if (typeof sock.onWhatsApp !== 'function') {
      return lookupTarget;
    }

    const [match] = await sock.onWhatsApp(lookupTarget);
    console.log(`[WA] onWhatsApp target=${lookupTarget} exists=${match?.exists === true} jid=${match?.jid || '-'}`);
    if (!match?.exists) {
      throw new Error(`Número ${number} não encontrado no WhatsApp`);
    }
    return match.jid || lookupTarget;
  }

  _buildMediaPayload(tipo, buffer, mimetype, fileName, caption) {
    const base = { caption };
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

  async logout(tenantId) {
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
    return session?.status || 'desconectado';
  }

  getNumber(tenantId) {
    const session = this.sessions.get(tenantId);
    return session?.number || null;
  }
}
