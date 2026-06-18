import { Server } from 'socket.io';
import { verifyToken } from '../auth/jwt.js';
import { operadorFromToken } from '../auth/middleware.js';
import { setTenantContext } from '../db.js';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { processarMensagem } from '../services/chatbot.js';
import { processarComIris } from '../services/iris.js';
import { getOuGerarProtocolo, encerrarProtocolo } from '../services/protocolo.js';
import { criarPesquisaNPS } from '../services/nps.js';
import { atualizarPresenca } from '../services/presenca.js';
import {
  editarMensagem, excluirMensagem, encaminharMensagem,
  fixarMensagem, desafixarMensagem, adicionarReacao, removerReacao,
  marcarLido, assertMembroCanal
} from '../services/mensagens.js';
import { criarNotificacao } from '../services/notificacoes.js';
import { createStorage } from '../storage/index.js';

const salas = {
  tenant: (id) => `tenant:${id}`,
  conversa: (id) => `conversa:${id}`,
  operador: (id) => `operador:${id}`,
  canal: (id) => `canal:${id}`,
};

// Mapeia `${tenantId}:${jid}` -> convId para repassar presença ("digitando...")
// do cidadão para a sala da conversa correta.
const convPorJid = new Map();

// Logs verbosos de persistência só quando WA_DEBUG=1.
const WA_DEBUG_GATEWAY = process.env.WA_DEBUG === '1' || process.env.WA_DEBUG === 'true';

// Prefixa o texto enviado ao WhatsApp com o nome do atendente, para que
// o destinatário saiba qual operador respondeu (linha única compartilhada).
// Controlado por tenant_config.assinatura_ativa / assinatura_modo.
function assinarTexto(op, texto, cfg, departamentos = []) {
  if (!texto || !op?.nome) return texto;
  if (cfg && cfg.assinatura_ativa === false) return texto;
  const nome = cfg?.assinatura_modo === 'primeiro' ? op.nome.trim().split(/\s+/)[0] : op.nome;
  const deps = departamentos.map((d) => d.nome).filter(Boolean);
  const assinatura = deps.length > 0 ? `${nome} (${deps.slice(0, 2).join(', ')})` : nome;
  return `*${assinatura}*\n${texto}`;
}

async function obterConfigAssinatura(tenantId) {
  return db.oneOrNone(
    'SELECT assinatura_ativa, assinatura_modo FROM tenant_config WHERE tenant_id = $1',
    [tenantId]
  );
}

async function obterOperadorPayload(tenantId, operadorId, fallbackNome = null) {
  const operador = operadorId
    ? await db.oneOrNone(
        'SELECT id, nome FROM operadores WHERE id = $1 AND tenant_id = $2',
        [operadorId, tenantId]
      )
    : await db.oneOrNone(
        `SELECT id, nome
         FROM operadores
         WHERE tenant_id = $1
         ORDER BY CASE WHEN papel = 'admin' THEN 0 WHEN papel = 'supervisor' THEN 1 ELSE 2 END,
                  criado_em ASC
         LIMIT 1`,
        [tenantId]
      );

  if (!operador) {
    return { id: null, nome: fallbackNome || null, departamentos: [] };
  }

  const departamentos = await db.manyOrNone(
    `SELECT d.nome, d.cor
     FROM operador_departamentos od
     JOIN departamentos d ON d.id = od.departamento_id
     WHERE od.operador_id = $1 AND od.tenant_id = $2
     ORDER BY d.nome`,
    [operador.id, tenantId]
  );

  return {
    id: operador.id,
    nome: operador.nome || fallbackNome || null,
    departamentos,
  };
}

function ehGestor(op) {
  return op.papel === 'admin' || op.papel === 'supervisor';
}

function normalizarTelefoneWhatsApp(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function variantesTelefoneBrasil(telefone) {
  const digits = normalizarTelefoneWhatsApp(telefone);
  const variantes = new Set();
  if (digits) variantes.add(digits);
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    variantes.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }
  if (digits.startsWith('55') && digits.length === 12) {
    variantes.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }
  return [...variantes];
}

function jidEhLid(jid) {
  return String(jid || '').endsWith('@lid');
}

async function obterJidDaConversa(tenantId, convId, jidInformado) {
  const contato = await db.oneOrNone(
    `SELECT co.id, co.telefone, co.wa_jid,
            (
              SELECT alias_jid
              FROM contato_aliases
              WHERE tenant_id = co.tenant_id
                AND contato_id = co.id
                AND alias_jid LIKE '%@lid'
              ORDER BY criado_em DESC
              LIMIT 1
            ) AS alias_lid
     FROM conversas c
     JOIN contatos co ON co.id = c.contato_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [convId, tenantId]
  );

  if (!contato) return jidInformado;

  // Envia no endereço da sessão Signal correta: se o cidadão usa @lid, é nele que
  // temos as chaves. Converter para PN cria sessão divergente -> "Aguardando mensagem".
  if (contato.wa_jid?.endsWith('@lid')) return contato.wa_jid;
  if (contato.alias_lid) return contato.alias_lid;
  if (jidInformado?.endsWith('@lid')) return jidInformado;

  // Contato legado sem @lid: usa o telefone real em formato @s.whatsapp.net.
  const base = String(contato.wa_jid || jidInformado || '').split('@')[0];
  const digits = normalizarTelefoneWhatsApp(contato.telefone || base);
  if (!digits) return jidInformado;
  return `${digits}@s.whatsapp.net`;
}

async function atualizarContatoDaConversaComJidResolvido(tenantId, convId, resolvedJid) {
  if (!resolvedJid || !resolvedJid.includes('@s.whatsapp.net')) return;
  const digits = resolvedJid.split('@')[0]?.replace(/\D/g, '');
  if (!digits) return;
  const contato = await db.oneOrNone(
    `SELECT co.id, co.wa_jid
     FROM conversas c
     JOIN contatos co ON co.id = c.contato_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [convId, tenantId]
  );
  if (!contato || contato.wa_jid === resolvedJid) return;

  const outro = await db.oneOrNone(
    'SELECT id FROM contatos WHERE tenant_id = $1 AND wa_jid = $2 AND id <> $3',
    [tenantId, resolvedJid, contato.id]
  );
  if (outro) return;

  await db.none(
    'UPDATE contatos SET wa_jid = $1, telefone = $2 WHERE id = $3 AND tenant_id = $4',
    [resolvedJid, digits, contato.id, tenantId]
  );
}

// Mesmo critério de visibilidade do index.js (privacidade de conversas).
async function podeVerConversa(op, convId) {
  if (ehGestor(op)) {
    const r = await db.oneOrNone('SELECT 1 FROM conversas WHERE id = $1 AND tenant_id = $2', [convId, op.tenantId]);
    return !!r;
  }
    const r = await db.oneOrNone(
    `SELECT 1 FROM conversas c WHERE c.id = $1 AND c.tenant_id = $2 AND (
       EXISTS (SELECT 1 FROM conversa_participantes p WHERE p.conversa_id = c.id AND p.operador_id = $3 AND p.tenant_id = $2)
       OR (c.status = 'fila' AND (
         EXISTS (
           SELECT 1 FROM operador_departamentos od
           WHERE od.operador_id = $3 AND od.departamento_id = c.departamento_id
         )
         OR (
           (c.departamento_id IS NULL OR EXISTS (
             SELECT 1 FROM departamentos dd WHERE dd.id = c.departamento_id AND LOWER(dd.nome) = 'recepção'
           ))
           AND EXISTS (
             SELECT 1 FROM operador_departamentos od
             JOIN departamentos d ON d.id = od.departamento_id
             WHERE od.operador_id = $3 AND LOWER(d.nome) = 'recepção'
           )
         )
       ))
     )`,
    [convId, op.tenantId, op.id]
  );
  return !!r;
}

export function iniciarGateway(httpServer, wa, storage) {

  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Token não fornecido'));
      const decoded = verifyToken(token);
      const operador = operadorFromToken(decoded);
      if (!operador.tenantId) return next(new Error('Token sem organização/tenant'));
      await setTenantContext(operador.tenantId);
      socket.data.operador = operador;
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', async (socket) => {
    const op = socket.data.operador;

    socket.join(salas.tenant(op.tenantId));
    socket.join(salas.operador(op.id));

    (async () => {
      try {
        await setTenantContext(op.tenantId);
        await _setOnline(op.tenantId, op.id, true);
        io.to(salas.tenant(op.tenantId)).emit('operador:presenca', {
          opId: op.id,
          online: true,
        });
      } catch (err) {
        console.error('[Socket] operador:presenca error:', err.message);
      }
    })();

    socket.on('conversa:abrir', async (convId) => {
      try {
        await setTenantContext(op.tenantId);
        if (!(await podeVerConversa(op, convId))) {
          socket.emit('conversa:negada', { convId });
          return;
        }
        socket.join(salas.conversa(convId));
        await db.none(
          'UPDATE conversas SET nao_lidas = 0 WHERE id = $1 AND tenant_id = $2',
          [convId, op.tenantId]
        );
        // Notifica o sidebar para atualizar o contador de não lidas
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        // Assina a presença do contato para receber "digitando..."/online dele.
        try {
          const jid = await obterJidDaConversa(op.tenantId, convId, null);
          if (jid) {
            await wa.subscribePresence(op.tenantId, jid);
            convPorJid.set(`${op.tenantId}:${jid}`, convId);
          }
        } catch {}
      } catch (err) {
        console.error('[Socket] conversa:abrir error:', err.message);
      }
    });

    socket.on('conversa:atribuir', async ({ convId, departamentoId, operadorId }) => {
      try {
        await setTenantContext(op.tenantId);
        const dono = operadorId || op.id;
        await db.none(
          `UPDATE conversas SET departamento_id = $1, operador_id = $2, status = 'aberta'
           WHERE id = $3 AND tenant_id = $4`,
          [departamentoId, dono, convId, op.tenantId]
        );
        // Quem assume vira participante 'dono'.
        await db.none(
          `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
           VALUES ($1, $2, 'dono', $3, $4) ON CONFLICT (conversa_id, operador_id) DO UPDATE SET papel = 'dono'`,
          [convId, dono, op.id, op.tenantId]
        );
        await _auditar(op.tenantId, op.id, 'conversa.atribuida', {
          conversaId: convId,
          departamentoId,
          operadorId: dono,
        });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
      } catch (err) {
        console.error('[Socket] conversa:atribuir error:', err.message);
      }
    });

    // Assumir uma conversa (vira dono). Trava anti-corrida: só assume se ainda não tem dono.
    socket.on('conversa:assumir', async (convId, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const r = await db.oneOrNone(
          `UPDATE conversas SET operador_id = $1, status = 'aberta'
           WHERE id = $2 AND tenant_id = $3 AND operador_id IS NULL
           RETURNING id`,
          [op.id, convId, op.tenantId]
        );
        if (!r) {
          const dono = await db.oneOrNone(
            `SELECT o.nome FROM conversas c LEFT JOIN operadores o ON o.id = c.operador_id
             WHERE c.id = $1 AND c.tenant_id = $2`,
            [convId, op.tenantId]
          );
          if (ack) ack({ ok: false, erro: dono?.nome ? `Conversa já assumida por ${dono.nome}.` : 'Conversa já foi assumida.' });
          return;
        }
        await db.none(
          `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
           VALUES ($1, $2, 'dono', $2, $3)
           ON CONFLICT (conversa_id, operador_id) DO UPDATE SET papel = 'dono'`,
          [convId, op.id, op.tenantId]
        );
        await _auditar(op.tenantId, op.id, 'conversa.assumida', { conversaId: convId });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:assumir error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // Devolver a conversa para a fila do setor (libera o dono).
    socket.on('conversa:devolver', async (convId, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const conv = await db.oneOrNone('SELECT operador_id FROM conversas WHERE id = $1 AND tenant_id = $2', [convId, op.tenantId]);
        if (!conv) { if (ack) ack({ ok: false, erro: 'Conversa não encontrada' }); return; }
        if (!ehGestor(op) && conv.operador_id !== op.id) {
          if (ack) ack({ ok: false, erro: 'Apenas o atendente responsável pode devolver a conversa.' });
          return;
        }
        await db.none(`UPDATE conversas SET operador_id = NULL, status = 'fila' WHERE id = $1 AND tenant_id = $2`, [convId, op.tenantId]);
        await db.none('DELETE FROM conversa_participantes WHERE conversa_id = $1 AND tenant_id = $2', [convId, op.tenantId]);
        await db.none(`UPDATE conversa_transferencias SET status = 'cancelada', resolvido_em = now() WHERE conversa_id = $1 AND tenant_id = $2 AND status = 'pendente'`, [convId, op.tenantId]);
        await _auditar(op.tenantId, op.id, 'conversa.devolvida', { conversaId: convId });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:devolver error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // Solicitar transferência para um colega específico (cria transferência pendente).
    socket.on('conversa:transferir', async ({ convId, paraOperadorId, motivo }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        if (!paraOperadorId || paraOperadorId === op.id) { if (ack) ack({ ok: false, erro: 'Selecione outro atendente.' }); return; }
        const conv = await db.oneOrNone('SELECT operador_id FROM conversas WHERE id = $1 AND tenant_id = $2', [convId, op.tenantId]);
        if (!conv) { if (ack) ack({ ok: false, erro: 'Conversa não encontrada' }); return; }
        if (!ehGestor(op) && conv.operador_id !== op.id) {
          if (ack) ack({ ok: false, erro: 'Apenas o responsável pode transferir a conversa.' });
          return;
        }
        const alvo = await db.oneOrNone('SELECT id, nome FROM operadores WHERE id = $1 AND tenant_id = $2', [paraOperadorId, op.tenantId]);
        if (!alvo) { if (ack) ack({ ok: false, erro: 'Atendente inválido.' }); return; }
        // Cancela qualquer pendência anterior e cria a nova.
        await db.none(`UPDATE conversa_transferencias SET status = 'cancelada', resolvido_em = now() WHERE conversa_id = $1 AND tenant_id = $2 AND status = 'pendente'`, [convId, op.tenantId]);
        const transf = await db.one(
          `INSERT INTO conversa_transferencias (tenant_id, conversa_id, de_operador_id, para_operador_id, motivo)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [op.tenantId, convId, op.id, paraOperadorId, motivo || null]
        );
        // Dá visibilidade ao alvo (anexado) para avaliar a conversa antes de aceitar.
        await db.none(
          `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
           VALUES ($1, $2, 'anexado', $3, $4) ON CONFLICT (conversa_id, operador_id) DO NOTHING`,
          [convId, paraOperadorId, op.id, op.tenantId]
        );
        await criarNotificacao(op.tenantId, paraOperadorId, 'transferencia', 'Transferência de conversa', `${op.nome} quer transferir uma conversa para você.`, `/atendimento?conversa=${convId}`).catch(() => {});
        io.to(salas.operador(paraOperadorId)).emit('transferencia:nova', { convId, transferenciaId: transf.id, de: op.nome, motivo: motivo || null });
        io.to(salas.operador(paraOperadorId)).emit('conversa:atualizada', { convId });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        await _auditar(op.tenantId, op.id, 'conversa.transferida.solicitada', { conversaId: convId, paraOperadorId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:transferir error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // Responder a uma transferência pendente (aceitar ou recusar).
    socket.on('conversa:transferencia-responder', async ({ transferenciaId, aceitar, motivo }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const t = await db.oneOrNone('SELECT * FROM conversa_transferencias WHERE id = $1 AND tenant_id = $2', [transferenciaId, op.tenantId]);
        if (!t || t.status !== 'pendente') { if (ack) ack({ ok: false, erro: 'Transferência não está mais pendente.' }); return; }
        if (t.para_operador_id !== op.id) { if (ack) ack({ ok: false, erro: 'Esta transferência não é para você.' }); return; }

        if (aceitar) {
          await db.none(`UPDATE conversas SET operador_id = $1, status = 'aberta' WHERE id = $2 AND tenant_id = $3`, [op.id, t.conversa_id, op.tenantId]);
          await db.none(
            `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
             VALUES ($1, $2, 'dono', $3, $4) ON CONFLICT (conversa_id, operador_id) DO UPDATE SET papel = 'dono'`,
            [t.conversa_id, op.id, t.de_operador_id, op.tenantId]
          );
          if (t.de_operador_id) {
            await db.none('DELETE FROM conversa_participantes WHERE conversa_id = $1 AND operador_id = $2 AND tenant_id = $3', [t.conversa_id, t.de_operador_id, op.tenantId]);
          }
          await db.none(`UPDATE conversa_transferencias SET status = 'aceita', resolvido_em = now() WHERE id = $1`, [transferenciaId]);
          if (t.de_operador_id) {
            await criarNotificacao(op.tenantId, t.de_operador_id, 'transferencia', 'Transferência aceita', `${op.nome} aceitou a conversa transferida.`, `/atendimento`).catch(() => {});
            io.to(salas.operador(t.de_operador_id)).emit('conversa:atualizada', { convId: t.conversa_id });
          }
          await _auditar(op.tenantId, op.id, 'conversa.transferida.aceita', { conversaId: t.conversa_id, transferenciaId });
        } else {
          // Recusa: o alvo perde a visibilidade (anexado) e o dono anterior permanece.
          await db.none('DELETE FROM conversa_participantes WHERE conversa_id = $1 AND operador_id = $2 AND tenant_id = $3', [t.conversa_id, op.id, op.tenantId]);
          await db.none(`UPDATE conversa_transferencias SET status = 'rejeitada', motivo = COALESCE($2, motivo), resolvido_em = now() WHERE id = $1`, [transferenciaId, motivo || null]);
          if (t.de_operador_id) {
            await criarNotificacao(op.tenantId, t.de_operador_id, 'transferencia', 'Transferência recusada', `${op.nome} recusou a transferência${motivo ? ': ' + motivo : ''}.`, `/atendimento?conversa=${t.conversa_id}`).catch(() => {});
            io.to(salas.operador(t.de_operador_id)).emit('conversa:atualizada', { convId: t.conversa_id });
          }
          await _auditar(op.tenantId, op.id, 'conversa.transferida.rejeitada', { conversaId: t.conversa_id, transferenciaId });
        }
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId: t.conversa_id });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:transferencia-responder error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // Anexar atendentes a uma conversa (gestor ou dono).
    socket.on('conversa:anexar', async ({ convId, operadorIds }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const ehDono = await db.oneOrNone(
          `SELECT 1 FROM conversa_participantes WHERE conversa_id = $1 AND operador_id = $2 AND papel = 'dono' AND tenant_id = $3`,
          [convId, op.id, op.tenantId]
        );
        if (!ehGestor(op) && !ehDono) {
          if (ack) ack({ ok: false, erro: 'Sem permissão para anexar' });
          return;
        }
        const ids = [...new Set(operadorIds || [])];
        for (const oid of ids) {
          const mesmoTenant = await db.oneOrNone(
            'SELECT 1 FROM operadores WHERE id = $1 AND tenant_id = $2',
            [oid, op.tenantId]
          );
          if (!mesmoTenant) continue;
          await db.none(
            `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
             VALUES ($1, $2, 'anexado', $3, $4) ON CONFLICT DO NOTHING`,
            [convId, oid, op.id, op.tenantId]
          );
          io.to(salas.operador(oid)).emit('conversa:atualizada', { convId });
        }
        await _auditar(op.tenantId, op.id, 'conversa.anexados', { conversaId: convId, operadorIds: ids });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:anexar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('conversa:resolver', async (convId, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await db.none(
          `UPDATE conversas SET status = 'resolvida' WHERE id = $1 AND tenant_id = $2`,
          [convId, op.tenantId]
        );
        await _auditar(op.tenantId, op.id, 'conversa.resolvida', { conversaId: convId });

        const conv = await db.oneOrNone('SELECT * FROM conversas WHERE id = $1', [convId]);

        if (conv?.protocolo_id) {
          try {
            await encerrarProtocolo(conv.protocolo_id, op.tenantId, 'Atendimento encerrado', op.id);
            await criarPesquisaNPS(op.tenantId, conv.protocolo_id, convId, conv.departamento_id, op.id);
          } catch (e) {
            console.error('[Socket] conversa:resolver protocolo/nps error:', e.message);
          }
        }

        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:resolver error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('mensagem:enviar', async ({ convId, jid, texto, tipo, mediaBase64, mediaMime, mediaNome }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const destinoJid = await obterJidDaConversa(op.tenantId, convId, jid);
        const cfgAssinatura = await obterConfigAssinatura(op.tenantId);
        const operadorPayload = await obterOperadorPayload(op.tenantId, op.id, op.nome);

        if (texto) {
          await wa.setTyping(op.tenantId, destinoJid, true);
        }

        let result;
        let mediaUrl = null;
        let msgTipo = tipo || 'texto';

        if (mediaBase64) {
          // Limite de tamanho (anti-abuso/OOM): ~16 MB após decodificar base64.
          if (mediaBase64.length * 0.75 > 16 * 1024 * 1024) {
            if (ack) ack({ ok: false, erro: 'Arquivo muito grande (máx. 16 MB).' });
            return;
          }
          const buffer = Buffer.from(mediaBase64, 'base64');
          result = await wa.sendMedia(op.tenantId, destinoJid, {
            tipo: msgTipo,
            buffer,
            mimetype: mediaMime || 'application/octet-stream',
            fileName: mediaNome,
            caption: texto ? assinarTexto({ nome: operadorPayload.nome }, texto, cfgAssinatura, operadorPayload.departamentos) : undefined,
          });
          mediaUrl = await storage.salvar(buffer, mediaMime || 'application/octet-stream', op.tenantId);
        } else if (texto) {
          result = await wa.sendText(op.tenantId, destinoJid, assinarTexto({ nome: operadorPayload.nome }, texto, cfgAssinatura, operadorPayload.departamentos));
        } else {
          if (ack) ack({ ok: false, erro: 'Texto ou mídia obrigatórios' });
          return;
        }

        await wa.setTyping(op.tenantId, destinoJid, false);

        const waMessageId = result?.key?.id;
        await atualizarContatoDaConversaComJidResolvido(op.tenantId, convId, result?.key?.remoteJid);
        const msgId = uuidv4();

        const msg = await db.one(
          `INSERT INTO mensagens (id, tenant_id, conversa_id, wa_message_id, direcao, operador_id, tipo, conteudo, media_url, media_mime, status, criado_em)
           VALUES ($1, $2, $3, $4, 'saida', $5, $6, $7, $8, $9, 'enviado', now())
           RETURNING *`,
          [msgId, op.tenantId, convId, waMessageId, op.id, msgTipo, texto || null, mediaUrl, mediaMime || null]
        );
        const msgComOperador = {
          ...msg,
          operador_nome: operadorPayload.nome,
          operador_departamentos: operadorPayload.departamentos,
        };

        await db.none(
          `UPDATE conversas SET ultima_mensagem = $1, ultima_mensagem_em = now()
           WHERE id = $2 AND tenant_id = $3`,
          [texto || `[${msgTipo}]` || '[mensagem]', convId, op.tenantId]
        );

        io.to(salas.conversa(convId)).emit('mensagem:nova', msgComOperador);
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });

        if (ack) ack({ ok: true, id: msgId, mensagem: msgComOperador });

        await _auditar(op.tenantId, op.id, 'mensagem.enviada', {
          conversaId: convId,
          mensagemId: msgId,
          waMessageId,
        });
      } catch (err) {
        console.error('[Socket] mensagem:enviar error:', err.message);
        try { await wa.setTyping(op.tenantId, jid, false); } catch {}
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('interno:abrir', async (canalId) => {
      socket.join(salas.canal(canalId));
    });

    socket.on('interno:enviar', async ({ canalId, conteudo, tipo, mediaUrl, mediaMime, mediaBase64, mediaNome, respondendoA }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await assertMembroCanal(op.tenantId, canalId, op.id);
        const conteudoNorm = conteudo == null ? null : String(conteudo).trim();
        if (conteudoNorm && conteudoNorm.length > 8000) {
          if (ack) ack({ ok: false, erro: 'Mensagem muito longa' });
          return;
        }

        // Se veio mídia em base64, decodifica e persiste via storage.
        let mediaUrlFinal = mediaUrl || null;
        let mediaMimeFinal = mediaMime || null;
        if (mediaBase64) {
          if (mediaBase64.length * 0.75 > 16 * 1024 * 1024) {
            if (ack) ack({ ok: false, erro: 'Arquivo muito grande (m\u00e1x. 16 MB).' });
            return;
          }
          const buffer = Buffer.from(mediaBase64, 'base64');
          const storage = createStorage();
          mediaUrlFinal = await storage.salvar(buffer, mediaMime || 'application/octet-stream', op.tenantId);
          mediaMimeFinal = mediaMime || 'application/octet-stream';
        }

        if (!conteudoNorm && !mediaUrlFinal) {
          if (ack) ack({ ok: false, erro: 'Mensagem vazia' });
          return;
        }

        const msgId = uuidv4();
        const msg = await db.one(
          `INSERT INTO mensagens_internas (id, tenant_id, canal_id, remetente_id, tipo, conteudo, media_url, media_mime, respondendo_a, criado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           RETURNING *`,
          [msgId, op.tenantId, canalId, op.id, tipo || 'texto', conteudoNorm || null, mediaUrlFinal, mediaMimeFinal, respondendoA || null]
        );

        io.to(salas.canal(canalId)).emit('interno:nova', {
          ...msg,
          remetente_nome: op.nome,
          respondendo_a: respondendoA || null,
        });
        if (ack) ack({ ok: true, mensagem: msg });
      } catch (err) {
        console.error('[Socket] interno:enviar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    const lastTypingAt = new Map();
    socket.on('interno:digitando', ({ canalId }) => {
      const key = `${op.id}:${canalId}`;
      const now = Date.now();
      const last = lastTypingAt.get(key) || 0;
      if (now - last < 1500) return;
      lastTypingAt.set(key, now);
      socket.to(salas.canal(canalId)).emit('interno:digitando', {
        opId: op.id,
        canalId,
        nome: op.nome,
      });
    });

    socket.on('interno:digitando:parou', ({ canalId }) => {
      socket.to(salas.canal(canalId)).emit('interno:digitando:parou', {
        opId: op.id,
        canalId,
      });
    });

    socket.on('whatsapp:solicitarQR', async () => {
      try {
        if (!op.tenantId) {
          socket.emit('whatsapp:erro', { msg: 'Token sem organização/tenant' });
          return;
        }
        if (op.papel !== 'admin') {
          socket.emit('whatsapp:erro', { msg: 'Apenas administradores podem conectar o WhatsApp' });
          return;
        }
        await wa.start(op.tenantId);
      } catch (err) {
        socket.emit('whatsapp:erro', { msg: 'Erro ao iniciar WhatsApp' });
      }
    });

    socket.on('whatsapp:logout', async () => {
      try {
        if (op.papel !== 'admin') {
          socket.emit('whatsapp:erro', { msg: 'Apenas administradores podem desconectar o WhatsApp' });
          return;
        }
        await wa.logout(op.tenantId);
      } catch (err) {
        socket.emit('whatsapp:erro', { msg: 'Erro ao desconectar WhatsApp' });
      }
    });

    // === NOVOS EVENTOS (imp.md) ===

    socket.on('nota:adicionar', async ({ convId, conteudo }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        if (!(await podeVerConversa(op, convId))) {
          if (ack) ack({ ok: false, erro: 'Sem permissão' });
          return;
        }
        const nota = await db.one(
          `INSERT INTO notas_internas (tenant_id, conversa_id, operador_id, conteudo, criado_em)
           VALUES ($1, $2, $3, $4, now()) RETURNING *`,
          [op.tenantId, convId, op.id, conteudo]
        );
        io.to(salas.conversa(convId)).emit('nota:nova', { ...nota, operador_nome: op.nome });
        if (ack) ack({ ok: true, id: nota.id });
      } catch (err) {
        console.error('[Socket] nota:adicionar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('etiqueta:adicionar', async ({ convId, etiquetaId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await db.none(
          `INSERT INTO conversa_etiquetas (conversa_id, etiqueta_id, tenant_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [convId, etiquetaId, op.tenantId]
        );
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] etiqueta:adicionar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('etiqueta:remover', async ({ convId, etiquetaId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await db.none(
          'DELETE FROM conversa_etiquetas WHERE conversa_id = $1 AND etiqueta_id = $2 AND tenant_id = $3',
          [convId, etiquetaId, op.tenantId]
        );
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] etiqueta:remover error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('atendente:status', async ({ status, capacidade }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const campos = ['status_atendente = $1'];
        const vals = [status];
        if (capacidade !== undefined) {
          campos.push('capacidade_maxima = $2');
          vals.push(capacidade);
        }
        vals.push(op.id, op.tenantId);
        await db.none(
          `UPDATE operadores SET ${campos.join(', ')} WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length}`,
          vals
        );
        io.to(salas.tenant(op.tenantId)).emit('atendente:status:atualizado', {
          opId: op.id,
          status,
          capacidade,
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] atendente:status error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Presença e Status (interno.md Prioridade 1) ===

    socket.on('presenca:atualizar', async ({ status, mensagem }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await atualizarPresenca(op.tenantId, op.id, status, mensagem || null);
        io.to(salas.tenant(op.tenantId)).emit('presenca:atualizada', {
          opId: op.id,
          status,
          mensagem: mensagem || null,
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] presenca:atualizar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Editar/Excluir mensagens internas ===

    socket.on('mensagem:editar', async ({ canalId, msgId, conteudo }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const msg = await editarMensagem(op.tenantId, msgId, op.id, conteudo);
        if (!msg) {
          if (ack) ack({ ok: false, erro: 'Mensagem não encontrada ou prazo de edição expirado (24h)' });
          return;
        }
        io.to(salas.canal(canalId)).emit('mensagem:editada', {
          ...msg,
          remetente_nome: op.nome,
        });
        if (ack) ack({ ok: true, mensagem: msg });
      } catch (err) {
        console.error('[Socket] mensagem:editar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // Map para undo de exclusão: msgId -> setTimeout
    const exclusaoTimers = new Map();

    socket.on('mensagem:excluir', async ({ canalId, msgId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        io.to(salas.canal(canalId)).emit('mensagem:excluida', {
          msgId,
          canalId,
          remetente_nome: op.nome,
        });
        if (ack) ack({ ok: true });

        // Delay de 5s antes de persistir o soft-delete
        const timer = setTimeout(async () => {
          exclusaoTimers.delete(msgId);
          try {
            await setTenantContext(op.tenantId);
            await excluirMensagem(op.tenantId, msgId, op.id);
          } catch (e) {
            console.error('[Socket] excluirMensagem delayed error:', e.message);
          }
        }, 5000);
        exclusaoTimers.set(msgId, timer);
      } catch (err) {
        console.error('[Socket] mensagem:excluir error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('mensagem:desfazerExclusao', async ({ canalId, msgId }, ack) => {
      try {
        const timer = exclusaoTimers.get(msgId);
        if (timer) {
          clearTimeout(timer);
          exclusaoTimers.delete(msgId);
          // Emite evento para restaurar a mensagem em todos os clientes
          io.to(salas.canal(canalId)).emit('mensagem:exclusaoDesfeita', { msgId, canalId });
          if (ack) ack({ ok: true });
        } else {
          if (ack) ack({ ok: false, erro: 'Prazo de desfazer expirado' });
        }
      } catch (err) {
        console.error('[Socket] mensagem:desfazerExclusao error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Reações ===

    socket.on('mensagem:reagir', async ({ canalId, msgId, emoji }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await assertMembroCanal(op.tenantId, canalId, op.id);
        await adicionarReacao(op.tenantId, msgId, op.id, emoji);
        io.to(salas.canal(canalId)).emit('mensagem:reacao', {
          msgId,
          canalId,
          operadorId: op.id,
          operadorNome: op.nome,
          emoji,
          acao: 'adicionar',
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] mensagem:reagir error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('mensagem:desreagir', async ({ canalId, msgId, emoji }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await assertMembroCanal(op.tenantId, canalId, op.id);
        await removerReacao(op.tenantId, msgId, op.id, emoji);
        io.to(salas.canal(canalId)).emit('mensagem:reacao', {
          msgId,
          canalId,
          operadorId: op.id,
          operadorNome: op.nome,
          emoji,
          acao: 'remover',
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] mensagem:desreagir error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Fixar/Desafixar mensagens ===

    socket.on('mensagem:fixar', async ({ canalId, msgId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const r = await fixarMensagem(op.tenantId, canalId, msgId, op.id);
        io.to(salas.canal(canalId)).emit('canais:fixada', { canalId, msgId });
        if (ack) ack({ ok: !!r });
      } catch (err) {
        console.error('[Socket] mensagem:fixar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('mensagem:desafixar', async ({ canalId, msgId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await assertMembroCanal(op.tenantId, canalId, op.id);
        await desafixarMensagem(op.tenantId, canalId, msgId);
        io.to(salas.canal(canalId)).emit('canais:desafixada', { canalId, msgId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] mensagem:desafixar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Encaminhar mensagem ===

    socket.on('mensagem:encaminhar', async ({ msgId, canalDestinoId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const msg = await encaminharMensagem(op.tenantId, msgId, canalDestinoId, op.id);
        if (!msg) {
          if (ack) ack({ ok: false, erro: 'Mensagem não encontrada' });
          return;
        }
        io.to(salas.canal(canalDestinoId)).emit('interno:nova', {
          ...msg,
          remetente_nome: op.nome,
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] mensagem:encaminhar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Confirmar leitura ===

    socket.on('mensagem:ler', async ({ canalId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await marcarLido(op.tenantId, canalId, op.id);
        io.to(salas.canal(canalId)).emit('mensagem:lida', {
          canalId,
          operadorId: op.id,
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] mensagem:ler error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Thread / Responder mensagem ===

    socket.on('interno:responder', async ({ canalId, conteudo, respondendoA, tipo, mediaUrl, mediaMime }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await assertMembroCanal(op.tenantId, canalId, op.id);
        const conteudoNorm = conteudo == null ? null : String(conteudo).trim();
        if (conteudoNorm && conteudoNorm.length > 8000) {
          if (ack) ack({ ok: false, erro: 'Mensagem muito longa' });
          return;
        }
        const msgId = uuidv4();
        const msg = await db.one(
          `INSERT INTO mensagens_internas (id, tenant_id, canal_id, remetente_id, tipo, conteudo, media_url, media_mime, respondendo_a, criado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           RETURNING *`,
          [msgId, op.tenantId, canalId, op.id, tipo || 'texto', conteudoNorm || null, mediaUrl || null, mediaMime || null, respondendoA || null]
        );
        io.to(salas.canal(canalId)).emit('interno:nova', {
          ...msg,
          remetente_nome: op.nome,
          respondendo_a: respondendoA || null,
        });
        if (ack) ack({ ok: true, mensagem: msg });
      } catch (err) {
        console.error('[Socket] interno:responder error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    // === EVOLUÇÕES: Notificações ===

    socket.on('notificacao:marcar-lida', async ({ notificacaoId }, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await db.none(
          'UPDATE notificacoes SET lida = true WHERE id = $1 AND operador_id = $2 AND tenant_id = $3',
          [notificacaoId, op.id, op.tenantId]
        );
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] notificacao:marcar-lida error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('conversa:arquivar', async (convId, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await db.none(
          `UPDATE conversas SET status = 'arquivada' WHERE id = $1 AND tenant_id = $2`,
          [convId, op.tenantId]
        );
        await _auditar(op.tenantId, op.id, 'conversa.arquivada', { conversaId: convId });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:arquivar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('conversa:desarquivar', async (convId, ack) => {
      try {
        await setTenantContext(op.tenantId);
        const conv = await db.oneOrNone('SELECT * FROM conversas WHERE id = $1 AND tenant_id = $2', [convId, op.tenantId]);
        const novoStatus = conv?.operador_id ? 'aberta' : 'fila';
        await db.none(
          `UPDATE conversas SET status = $1 WHERE id = $2 AND tenant_id = $3`,
          [novoStatus, convId, op.tenantId]
        );
        await _auditar(op.tenantId, op.id, 'conversa.desarquivada', { conversaId: convId });
        io.to(salas.tenant(op.tenantId)).emit('conversa:atualizada', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:desarquivar error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('conversa:excluir', async (convId, ack) => {
      try {
        await setTenantContext(op.tenantId);
        await db.none(
          `DELETE FROM conversas WHERE id = $1 AND tenant_id = $2`,
          [convId, op.tenantId]
        );
        await _auditar(op.tenantId, op.id, 'conversa.excluida', { conversaId: convId });
        io.to(salas.tenant(op.tenantId)).emit('conversa:removida', { convId });
        if (ack) ack({ ok: true });
      } catch (err) {
        console.error('[Socket] conversa:excluir error:', err.message);
        if (ack) ack({ ok: false, erro: err.message });
      }
    });

    socket.on('disconnect', async () => {
      try {
        await setTenantContext(op.tenantId);
        await _setOnline(op.tenantId, op.id, false);
        io.to(salas.tenant(op.tenantId)).emit('operador:presenca', {
          opId: op.id,
          online: false,
        });
      } catch {}
      // Limpa timers de exclusão pendentes deste socket
      for (const [msgId, timer] of exclusaoTimers.entries()) {
        clearTimeout(timer);
      }
      exclusaoTimers.clear();
    });
  });

  wa.on('qr', ({ tenantId, qr, qrRaw }) => {
    io.to(salas.tenant(tenantId)).emit('whatsapp:qr', { qr, qrRaw });
  });

  wa.on('connected', ({ tenantId, numero }) => {
    io.to(salas.tenant(tenantId)).emit('whatsapp:conectado', { numero });
  });

  wa.on('logout', ({ tenantId }) => {
    io.to(salas.tenant(tenantId)).emit('whatsapp:desconectado');
  });

  // Reconexão esgotou as tentativas: avisa o tenant para reescanear o QR.
  wa.on('falha-conexao', ({ tenantId, tentativas }) => {
    io.to(salas.tenant(tenantId)).emit('whatsapp:falha', {
      msg: `Não foi possível reconectar o WhatsApp após ${tentativas} tentativas. Reconecte escaneando o QR.`,
    });
  });

  // Presença do cidadão (digitando/online) -> repassa para a sala da conversa.
  wa.on('presence', ({ tenantId, id, presences }) => {
    try {
      const convId = convPorJid.get(`${tenantId}:${id}`);
      if (!convId) return;
      const estado = presences?.[id]?.lastKnownPresence;
      const digitando = estado === 'composing' || estado === 'recording';
      io.to(salas.conversa(convId)).emit('cliente:presenca', {
        convId,
        digitando,
        estado: estado || null,
      });
    } catch {}
  });

  wa.on('message', async ({ tenantId, msg }) => {
    try {
      await setTenantContext(tenantId);
      await persistirEntrada(tenantId, msg, io, wa, storage);
    } catch (err) {
      console.error('[Socket] message handler error:', err.message);
    }
  });

  wa.on('message-status', async ({ tenantId, updates }) => {
    try {
      await setTenantContext(tenantId);
      console.log(`[Status] recebidos ${updates.length} updates de status para tenant ${tenantId}`);
      for (const update of updates) {
        const msgId = update?.key?.id;
        if (!msgId) continue;
        const status = update?.update?.status;
        if (!status) continue;
        console.log(`[Status] wa_id=${msgId} status=${status}`);
        let mappedStatus = 'enviado';
        if (status === 'SERVER_ACK' || status === 'DELIVERY_ACK') mappedStatus = 'entregue';
        else if (status === 'READ') mappedStatus = 'lido';
        else if (status === 'ERROR') mappedStatus = 'erro';

        await db.none(
          'UPDATE mensagens SET status = $1 WHERE wa_message_id = $2 AND tenant_id = $3',
          [mappedStatus, msgId, tenantId]
        );
        const conversa = await db.oneOrNone(
          'SELECT c.id as conv_id FROM mensagens m JOIN conversas c ON c.id = m.conversa_id WHERE m.wa_message_id = $1 AND m.tenant_id = $2',
          [msgId, tenantId]
        );
        if (conversa) {
          io.to(salas.conversa(conversa.conv_id)).emit('mensagem:status', {
            waMessageId: msgId,
            status: mappedStatus,
          });
        }
      }
    } catch (err) {
      console.error('[Socket] message-status handler error:', err.message);
    }
  });

  return io;
}

// Busca e salva a foto de perfil do WhatsApp de um contato, em background.
// Só faz a requisição se o avatar_url ainda estiver nulo no banco.
export async function buscarAvatarContato(wa, tenantId, contatoId) {
  try {
    const row = await db.oneOrNone(
      'SELECT avatar_url, wa_jid FROM contatos WHERE id = $1 AND tenant_id = $2',
      [contatoId, tenantId]
    );
    if (!row || !row.wa_jid) return;
    if (row.avatar_url) {
      console.log(`[Avatar] contato ${contatoId} já tem avatar, pulando`);
      return;
    }

    // Só busca foto para JID de telefone (@s.whatsapp.net), não para @lid.
    const jidAlvo = row.wa_jid;
    if (!jidAlvo.endsWith('@s.whatsapp.net')) {
      console.log(`[Avatar] contato ${contatoId} JID não é @s.whatsapp.net (${jidAlvo}), pulando`);
      return;
    }

    console.log(`[Avatar] buscando foto para contato ${contatoId} JID=${jidAlvo}`);
    const ppUrl = await wa.fetchProfilePicture(tenantId, jidAlvo);
    if (ppUrl) {
      await db.none(
        'UPDATE contatos SET avatar_url = $1 WHERE id = $2 AND tenant_id = $3',
        [ppUrl, contatoId, tenantId]
      );
      console.log(`[Avatar] foto salva para contato ${contatoId}`);
    } else {
      console.log(`[Avatar] contato ${contatoId} não tem foto de perfil`);
    }
  } catch (err) {
    console.error(`[Avatar] erro ao buscar foto do contato ${contatoId}:`, err.message);
  }
}

async function persistirEntrada(tenantId, msg, io, wa, storage) {
  const jid = msg.key.remoteJid;
  // Quando o WhatsApp entrega via @lid, o telefone real (formato 55...@s.whatsapp.net)
  // vem em senderPn. Sem isso não há como descobrir o número do cidadão a partir do @lid.
  const senderPn = msg.key.senderPn || null;
  const pushName = msg.pushName || null;
  const jidParaTelefone = jidEhLid(jid) ? senderPn : jid;
  const telefone = jidParaTelefone?.split('@')[0] || null;
  const direcao = msg.key.fromMe ? 'saida' : 'entrada';

  // Ignora mensagens de números bloqueados pelo órgão.
  if (telefone) {
    const bloqueado = await db.oneOrNone(
      'SELECT 1 FROM contatos_bloqueados WHERE tenant_id = $1 AND telefone = $2',
      [tenantId, telefone.replace(/\D/g, '')]
    );
    if (bloqueado) return;
  }
  const msgId = msg.key.id;
  const msgTimestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();
  const operadorSync = direcao === 'saida'
    ? await obterOperadorPayload(tenantId, null, null)
    : { id: null, nome: null, departamentos: [] };

  // Dedupe: o Baileys pode disparar messages.upsert mais de uma vez para o
  // mesmo wa_message_id. Sai cedo para não duplicar bolha/contador/mídia/bot.
  if (msgId) {
    const jaProcessada = await db.oneOrNone(
      'SELECT 1 FROM mensagens WHERE tenant_id = $1 AND wa_message_id = $2',
      [tenantId, msgId]
    );
    if (jaProcessada) {
      console.log(`[Persist] mensagem duplicada ignorada wa_message_id=${msgId}`);
      return;
    }
  }

  let tipo = 'texto';
  let conteudo = null;
  let mediaUrl = null;
  let mediaMime = null;

  const messageContent = extrairConteudoMensagem(msg.message);

  // Reação (👍 ❤️ ...) a uma mensagem existente: não é uma mensagem nova.
  // Atualiza o alvo e avisa o painel; texto vazio = reação removida.
  if (messageContent?.reactionMessage) {
    const alvoWaId = messageContent.reactionMessage.key?.id;
    const emoji = messageContent.reactionMessage.text || null;
    if (alvoWaId) {
      const alvo = await db.oneOrNone(
        `UPDATE mensagens SET reacao = $1
         WHERE wa_message_id = $2 AND tenant_id = $3
         RETURNING id, conversa_id`,
        [emoji, alvoWaId, tenantId]
      );
      if (alvo) {
        io.to(salas.conversa(alvo.conversa_id)).emit('mensagem:reacao', {
          mensagemId: alvo.id,
          waMessageId: alvoWaId,
          emoji,
        });
      }
    }
    return;
  }

  // Mensagens de sistema/protocolo (revogação, etc.) não têm conteúdo útil: ignora com segurança.
  if (messageContent?.protocolMessage || messageContent?.senderKeyDistributionMessage) {
    if (WA_DEBUG_GATEWAY) console.log(`[Persist] mensagem de sistema ignorada wa_message_id=${msgId}`);
    return;
  }

  if (messageContent?.conversation) {
    conteudo = messageContent.conversation;
  } else if (messageContent?.extendedTextMessage?.text) {
    conteudo = messageContent.extendedTextMessage.text;
  } else if (messageContent?.imageMessage) {
    tipo = 'imagem';
    mediaMime = 'image/jpeg';
    conteudo = messageContent.imageMessage.caption || null;
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      mediaUrl = await storage.salvar(buffer, 'image/jpeg', tenantId);
    } catch (e) {
      console.error('[Persist] media download error:', e.message);
    }
  } else if (messageContent?.videoMessage) {
    tipo = 'video';
    mediaMime = 'video/mp4';
    conteudo = messageContent.videoMessage.caption || null;
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      mediaUrl = await storage.salvar(buffer, 'video/mp4', tenantId);
    } catch {}
  } else if (messageContent?.audioMessage) {
    tipo = 'audio';
    mediaMime = 'audio/ogg';
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      mediaUrl = await storage.salvar(buffer, 'audio/ogg', tenantId);
    } catch {}
  } else if (messageContent?.documentMessage) {
    tipo = 'documento';
    mediaMime = messageContent.documentMessage.mimetype || 'application/octet-stream';
    conteudo = messageContent.documentMessage.caption || null;
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      mediaUrl = await storage.salvar(buffer, mediaMime, tenantId);
    } catch {}
  } else if (messageContent?.locationMessage) {
    tipo = 'local';
    conteudo = JSON.stringify({
      lat: messageContent.locationMessage.degreesLatitude,
      lng: messageContent.locationMessage.degreesLongitude,
    });
  } else {
    console.log(`[Persist] tipo de mensagem ignorado wa_message_id=${msgId} keys=${Object.keys(messageContent || {}).join(',')}`);
    return;
  }

  let contatoRow = await db.oneOrNone(
    `SELECT c.id
     FROM contato_aliases a
     JOIN contatos c ON c.id = a.contato_id
     WHERE a.tenant_id = $1 AND a.alias_jid = $2`,
    [tenantId, jid]
  );

  // LID com senderPn: resolve direto para o telefone real do cidadão.
  // Cria/atualiza o contato com o JID de telefone (@s.whatsapp.net) e registra o alias
  // do @lid, garantindo que o envio (bot ou operador) vá para o número correto.
  if (!contatoRow && jidEhLid(jid) && senderPn) {
    const digitsReal = normalizarTelefoneWhatsApp(senderPn.split('@')[0]);
    if (digitsReal) {
      const jidReal = `${digitsReal}@s.whatsapp.net`;
      const variantes = variantesTelefoneBrasil(digitsReal);
      contatoRow = await db.oneOrNone(
        `SELECT co.id
         FROM contatos co
         LEFT JOIN conversas c ON c.contato_id = co.id
         WHERE co.tenant_id = $1
           AND (co.telefone = ANY($2) OR co.wa_jid = ANY($3))
         ORDER BY CASE WHEN c.status IN ('aberta', 'fila') THEN 0 ELSE 1 END,
                  c.ultima_mensagem_em DESC NULLS LAST
         LIMIT 1`,
        [tenantId, variantes, variantes.map((n) => `${n}@s.whatsapp.net`)]
      );
      if (contatoRow) {
        // Corrige contatos que tinham sido criados apenas com o @lid (sem telefone real).
        await db.none(
          `UPDATE contatos SET wa_jid = $1, telefone = COALESCE(telefone, $2)
           WHERE id = $3 AND tenant_id = $4 AND wa_jid LIKE '%@lid'`,
          [jidReal, digitsReal, contatoRow.id, tenantId]
        );
      } else {
        contatoRow = await db.one(
          `INSERT INTO contatos (tenant_id, wa_jid, nome, telefone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, wa_jid) DO UPDATE
             SET nome = COALESCE(contatos.nome, EXCLUDED.nome),
                 telefone = COALESCE(contatos.telefone, EXCLUDED.telefone)
           RETURNING id`,
          [tenantId, jidReal, pushName, digitsReal]
        );
      }
      // Registra os aliases (@lid e @s.whatsapp.net) apontando para o contato real.
      for (const alias of [jid, jidReal]) {
        await db.none(
          `INSERT INTO contato_aliases (tenant_id, contato_id, alias_jid)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, alias_jid) DO UPDATE SET contato_id = EXCLUDED.contato_id`,
          [tenantId, contatoRow.id, alias]
        );
      }
    }
  }

  if (!contatoRow && jid?.endsWith('@lid')) {
    const conhecido = await db.oneOrNone(
      `SELECT c.nome, c.telefone, c.wa_jid
       FROM contato_aliases a
       JOIN contatos c ON c.id = a.contato_id
       WHERE a.alias_jid = $1
         AND c.wa_jid LIKE '%@s.whatsapp.net'
         AND c.telefone IS NOT NULL
         AND c.telefone !~ '^[0-9]{14,}$'
       ORDER BY c.criado_em ASC
       LIMIT 1`,
      [jid]
    );
    if (conhecido?.telefone || conhecido?.wa_jid) {
      const base = conhecido.telefone || conhecido.wa_jid.split('@')[0];
      const variantes = variantesTelefoneBrasil(base);
      contatoRow = await db.oneOrNone(
        `SELECT co.id
         FROM contatos co
         LEFT JOIN conversas c ON c.contato_id = co.id
         WHERE co.tenant_id = $1
           AND (co.telefone = ANY($2) OR co.wa_jid = ANY($3))
         ORDER BY CASE WHEN c.status IN ('aberta', 'fila') THEN 0 ELSE 1 END,
                  c.ultima_mensagem_em DESC NULLS LAST
         LIMIT 1`,
        [tenantId, variantes, variantes.map((n) => `${n}@s.whatsapp.net`)]
      );
      if (!contatoRow) {
        const telefoneReal = variantes[0] || base;
        const jidReal = conhecido.wa_jid || `${telefoneReal}@s.whatsapp.net`;
        contatoRow = await db.one(
          `INSERT INTO contatos (tenant_id, wa_jid, nome, telefone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, wa_jid) DO UPDATE
             SET nome = COALESCE(contatos.nome, EXCLUDED.nome),
                 telefone = COALESCE(contatos.telefone, EXCLUDED.telefone)
           RETURNING id`,
          [tenantId, jidReal, pushName || conhecido.nome || null, telefoneReal]
        );
      }
      await db.none(
        `INSERT INTO contato_aliases (tenant_id, contato_id, alias_jid)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, alias_jid) DO UPDATE SET contato_id = EXCLUDED.contato_id`,
        [tenantId, contatoRow.id, jid]
      );
    }
  }

  if (!contatoRow) {
    const variantes = variantesTelefoneBrasil(telefone);
    if (variantes.length > 0) {
      contatoRow = await db.oneOrNone(
        `SELECT co.id
         FROM contatos co
         LEFT JOIN conversas c ON c.contato_id = co.id
         WHERE co.tenant_id = $1
           AND (
             co.telefone = ANY($2)
             OR co.wa_jid = ANY($3)
           )
         ORDER BY
           CASE WHEN c.status IN ('aberta', 'fila') THEN 0 ELSE 1 END,
           c.ultima_mensagem_em DESC NULLS LAST
         LIMIT 1`,
        [tenantId, variantes, variantes.map((n) => `${n}@s.whatsapp.net`)]
      );
    }
  }

  if (!contatoRow) {
    contatoRow = await db.oneOrNone(
       `INSERT INTO contatos (tenant_id, wa_jid, nome, telefone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, wa_jid) DO UPDATE
          SET telefone = COALESCE(EXCLUDED.telefone, contatos.telefone)
        RETURNING id`,
      [tenantId, jid, pushName, jidEhLid(jid) ? null : telefone]
    );
  }

  // Busca foto de perfil do WhatsApp se o contato ainda não tiver avatar.
  // Executa em background (não bloqueia a entrega da mensagem).
  buscarAvatarContato(wa, tenantId, contatoRow.id).catch(() => {});

  const conversaRow = await db.oneOrNone(
    `INSERT INTO conversas (tenant_id, contato_id, status, nao_lidas, ultima_mensagem, ultima_mensagem_em)
     VALUES ($1, $2, $5, $6, $3, $4)
      ON CONFLICT (tenant_id, contato_id) DO UPDATE
        SET nao_lidas = CASE
              WHEN $7 = 'saida' THEN conversas.nao_lidas
              WHEN conversas.status = 'resolvida' THEN 1
              ELSE conversas.nao_lidas + 1
            END,
            status = CASE
              WHEN conversas.status IN ('resolvida', 'arquivada') AND $7 = 'entrada' THEN 'fila'
              ELSE conversas.status
            END,
            operador_id = CASE
              WHEN conversas.status IN ('resolvida', 'arquivada') AND $7 = 'entrada' THEN NULL
              ELSE conversas.operador_id
            END,
            departamento_id = CASE
              WHEN conversas.status IN ('resolvida', 'arquivada') AND $7 = 'entrada' THEN NULL
              ELSE conversas.departamento_id
            END,
            protocolo_id = CASE
              WHEN conversas.status IN ('resolvida', 'arquivada') AND $7 = 'entrada' THEN NULL
              ELSE conversas.protocolo_id
            END,
            ultima_mensagem = $3,
            ultima_mensagem_em = $4
     RETURNING id, status, protocolo_id, departamento_id, operador_id`,
    [
      tenantId,
      contatoRow.id,
      conteudo || `[${tipo}]`,
      msgTimestamp,
      direcao === 'saida' ? 'aberta' : 'fila',
      direcao === 'saida' ? 0 : 1,
      direcao,
    ]
  );

  if (!conversaRow.protocolo_id) {
    try {
      await getOuGerarProtocolo(tenantId, conversaRow.id, contatoRow.id);
    } catch (e) {
      console.error('[Protocolo] Erro ao gerar:', e.message);
    }
  }

  let novaMensagem = await db.oneOrNone(
    `INSERT INTO mensagens (tenant_id, conversa_id, wa_message_id, direcao, operador_id, tipo, conteudo, media_url, media_mime, status, criado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      tenantId,
      conversaRow.id,
      msgId,
      direcao,
      operadorSync.id,
      tipo,
      conteudo,
      mediaUrl,
      mediaMime,
      direcao === 'saida' ? 'enviado' : 'entregue',
      msgTimestamp,
    ]
  );
  // Se houve conflito (corrida), a mensagem já foi processada por outra execução: não re-emite.
  if (!novaMensagem) {
    console.log(`[Persist] insert em corrida ignorado wa_message_id=${msgId}`);
    return;
  }

  if (operadorSync.id) {
    novaMensagem = {
      ...novaMensagem,
      operador_nome: operadorSync.nome,
      operador_departamentos: operadorSync.departamentos,
    };
  }

  io.to(salas.conversa(conversaRow.id)).emit('mensagem:nova', novaMensagem);
  io.to(salas.tenant(tenantId)).emit('conversa:atualizada', { convId: conversaRow.id });

  if (direcao === 'entrada' && tipo === 'texto' && conteudo) {
    try {
      const jidEnvio = jid;

      const irisCfg = await db.oneOrNone(
        'SELECT * FROM config_iris WHERE tenant_id = $1 AND ativo = true',
        [tenantId]
      );

      // Detecta primeiro contato.
      const msgCountResult = await db.one(
        'SELECT COUNT(*)::int as cnt FROM mensagens WHERE conversa_id = $1 AND tenant_id = $2',
        [conversaRow.id, tenantId]
      );
      const isFirstContact = msgCountResult.cnt === 1;

      const enviarBotMsg = async (textoResposta, origem = 'bot') => {
        if (!textoResposta || !textoResposta.trim()) {
          console.log('[Chatbot] Resposta vazia, ignorando envio');
          return;
        }
        // Emite evento "bot digitando..." antes de enviar
        io.to(salas.conversa(conversaRow.id)).emit('cliente:presenca', {
          convId: conversaRow.id,
          digitando: false,
          estado: 'bot_digitando',
          bot: origem,
        });

        const botMsgId = uuidv4();
        const botMsg = await db.one(
          `INSERT INTO mensagens (id, tenant_id, conversa_id, direcao, tipo, conteudo, status, criado_em)
           VALUES ($1, $2, $3, 'saida', 'texto', $4, 'enviado', now())
           RETURNING *`,
          [botMsgId, tenantId, conversaRow.id, `🤖 ${textoResposta}`]
        );
        const sendResult = await wa.sendText(tenantId, jidEnvio, textoResposta);
        if (sendResult?.key?.id) {
          await db.none(
            'UPDATE mensagens SET wa_message_id = $1 WHERE id = $2 AND tenant_id = $3',
            [sendResult.key.id, botMsgId, tenantId]
          );
        }
        await db.none(
          `UPDATE conversas SET ultima_mensagem = $1, ultima_mensagem_em = now()
           WHERE id = $2 AND tenant_id = $3`,
          [textoResposta.slice(0, 200), conversaRow.id, tenantId]
        );
        io.to(salas.conversa(conversaRow.id)).emit('mensagem:nova', botMsg);
        io.to(salas.tenant(tenantId)).emit('conversa:atualizada', { convId: conversaRow.id });

        // Limpa o "bot digitando" apos enviar
        io.to(salas.conversa(conversaRow.id)).emit('cliente:presenca', {
          convId: conversaRow.id,
          digitando: false,
          estado: null,
        });
      };

      let departamentoAlvo = null;

      // O bot (Iris/chatbot) so atua na triagem: enquanto nenhum operador humano assumiu
      let botPodeResponder = !conversaRow.operador_id;
      if (botPodeResponder && conversaRow.departamento_id) {
        const dep = await db.oneOrNone(
          "SELECT LOWER(nome) = 'recepção' AS eh_recepcao FROM departamentos WHERE id = $1 AND tenant_id = $2",
          [conversaRow.departamento_id, tenantId]
        );
        botPodeResponder = dep?.eh_recepcao === true;
      }

      if (botPodeResponder && irisCfg) {
        // Emite "Iris esta digitando" para o painel
        io.to(salas.conversa(conversaRow.id)).emit('cliente:presenca', {
          convId: conversaRow.id,
          digitando: false,
          estado: 'bot_digitando',
          bot: 'iris',
        });

        // Modo Iris — IA 24h com DeepSeek ou OpenAI
        const resultado = await processarComIris(tenantId, conversaRow.id, conteudo);
        if (resultado && resultado.respondido) {
          await enviarBotMsg(resultado.resposta, 'iris');
          if (resultado.departamento_id) {
            departamentoAlvo = resultado.departamento_id;
          }
          if (resultado.confianca) {
            console.log(`[Iris] Confianca: ${resultado.confianca} | Depto: ${departamentoAlvo || 'nenhum'}`);
          }
        } else {
          io.to(salas.conversa(conversaRow.id)).emit('cliente:presenca', {
            convId: conversaRow.id,
            digitando: false,
            estado: null,
          });
        }
      } else if (botPodeResponder) {
        io.to(salas.conversa(conversaRow.id)).emit('cliente:presenca', {
          convId: conversaRow.id,
          digitando: false,
          estado: 'bot_digitando',
          bot: 'chatbot',
        });

        // Modo Chatbot tradicional
        const cfg = await db.oneOrNone(
          'SELECT * FROM config_chatbot WHERE tenant_id = $1',
          [tenantId]
        );

        if (isFirstContact && cfg && cfg.ativo && cfg.mensagem_boas_vindas) {
          await enviarBotMsg(cfg.mensagem_boas_vindas, 'chatbot');
        }

        if (cfg && cfg.ativo) {
          const resultado = await processarMensagem(tenantId, conversaRow.id, contatoRow.id, conteudo);
          if (resultado && resultado.respondido) {
            await enviarBotMsg(resultado.resposta, 'chatbot');
            if (resultado.departamento_id) {
              departamentoAlvo = resultado.departamento_id;
            }
          } else if (cfg.mensagem_fallback) {
            await enviarBotMsg(cfg.mensagem_fallback, 'chatbot');
          }
        } else {
          io.to(salas.conversa(conversaRow.id)).emit('cliente:presenca', {
            convId: conversaRow.id,
            digitando: false,
            estado: null,
          });
        }
      }

      // Auto-encaminha para o departamento indicado pelo bot ou para a Recepcao.
      if (!conversaRow.operador_id) {
        let deptId = departamentoAlvo;
        if (!deptId && !conversaRow.departamento_id) {
          const recepcao = await db.oneOrNone(
            "SELECT id FROM departamentos WHERE tenant_id = $1 AND LOWER(nome) = 'recepção' AND ativo = true",
            [tenantId]
          );
          deptId = recepcao?.id;
        }
        if (deptId && deptId !== conversaRow.departamento_id) {
          await db.none(
            'UPDATE conversas SET departamento_id = $1 WHERE id = $2 AND tenant_id = $3',
            [deptId, conversaRow.id, tenantId]
          );
          io.to(salas.tenant(tenantId)).emit('conversa:atualizada', { convId: conversaRow.id });
        }

        // Salva departamento_sugerido para contexto em mensagens futuras
        if (departamentoAlvo) {
          await db.none(
            'UPDATE conversas SET departamento_sugerido = $1 WHERE id = $2 AND tenant_id = $3',
            [departamentoAlvo, conversaRow.id, tenantId]
          );
        }
      }
    } catch (e) {
      console.error('[Chatbot] Erro ao processar:', e.message);
    }
  }
}

function extrairConteudoMensagem(message) {
  let atual = message;
  for (let i = 0; i < 5; i++) {
    if (!atual) return atual;
    if (atual.ephemeralMessage?.message) {
      atual = atual.ephemeralMessage.message;
      continue;
    }
    if (atual.viewOnceMessage?.message) {
      atual = atual.viewOnceMessage.message;
      continue;
    }
    if (atual.viewOnceMessageV2?.message) {
      atual = atual.viewOnceMessageV2.message;
      continue;
    }
    if (atual.documentWithCaptionMessage?.message) {
      atual = atual.documentWithCaptionMessage.message;
      continue;
    }
    if (atual.editedMessage?.message?.protocolMessage?.editedMessage) {
      atual = atual.editedMessage.message.protocolMessage.editedMessage;
      continue;
    }
    return atual;
  }
  return atual;
}

async function _setOnline(tenantId, operadorId, online) {
  await db.none(
    `UPDATE operadores SET online = $1, ultimo_visto = CASE WHEN $1 THEN ultimo_visto ELSE now() END
     WHERE id = $2 AND tenant_id = $3`,
    [online, operadorId, tenantId]
  );
}

async function _auditar(tenantId, operadorId, acao, detalhe) {
  try {
    await db.none(
      `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, criado_em)
       VALUES ($1, $2, $3, $4, now())`,
      [tenantId, operadorId, acao, detalhe]
    );
  } catch (err) {
    console.error('[Auditoria] Error:', err.message);
  }
}
