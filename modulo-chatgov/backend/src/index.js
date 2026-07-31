import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import db from './db.js';
import { runMigrations } from './migrations/run.js';
import { WhatsAppManager } from './whatsapp/WhatsAppManager.js';
import { iniciarGateway, buscarAvatarContato } from './realtime/gateway.js';
import { createStorage } from './storage/index.js';
import { authMiddleware, requirePapel } from './auth/middleware.js';
import { rateLimiter } from './auth/ratelimit.js';
import { seedDemoData } from './migrations/seed.js';
import { encrypt } from './services/encryption.js';
import { getConfigChatbot } from './services/chatbot.js';
import * as irisService from './services/iris.js';
import {
  gerarProtocolo, consultarProtocolo, encerrarProtocolo,
  getOuGerarProtocolo,
} from './services/protocolo.js';
import { registrarRespostaNPS, calcularNPS, npsPorSetor, npsPorAtendente } from './services/nps.js';
import rotasEvolucoes from './routes/evolucoes.js';
import { iniciarLimpezaConversas } from './services/limpeza-conversas.js';
import { ensureTenantProvisioned } from './services/provisionamento.js';
import devSaasRouter from './auth/dev-saas.js';
import operacaoV2Router from './routes/operacao-v2.js';
import { normalizePhone } from './domain/phone.js';
import { hasPermission, PERMISSIONS, requirePermission } from './auth/permissions.js';
import { protectSensitiveFields } from './domain/privacy.js';
import { transitionProtocol } from './services/status-transitions.js';
import administracaoV2Router from './routes/administracao-v2.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Operador só vê conversa se for participante, ou se estiver na fila da sua
// secretaria/departamento. Admin e supervisor veem tudo do tenant.
function ehGestor(op) {
  return op.papel === 'admin' || op.papel === 'supervisor';
}

// Fragmento SQL (para alias de conversa) que filtra o que um operador comum pode ver.
// Usa $opId como placeholder textual — substituído pelo índice real no chamador.
function filtroVisibilidadeSql(alias, opIdParam) {
  return `(
    EXISTS (SELECT 1 FROM conversa_participantes p WHERE p.conversa_id = ${alias}.id AND p.operador_id = ${opIdParam} AND p.tenant_id = ${alias}.tenant_id)
    OR (${alias}.status = 'fila' AND (
      ${alias}.departamento_id IS NULL
      OR EXISTS (
        SELECT 1 FROM operador_departamentos od
        JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
        WHERE od.operador_id = ${opIdParam} AND od.departamento_id = ${alias}.departamento_id
      )
      OR (
        EXISTS (
          SELECT 1 FROM departamentos dd WHERE dd.id = ${alias}.departamento_id AND LOWER(dd.nome) = 'recepcao' AND dd.ativo = true
        )
        AND EXISTS (
          SELECT 1 FROM operador_departamentos od
          JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
          WHERE od.operador_id = ${opIdParam} AND LOWER(d.nome) = 'recepcao'
        )
      )
    ))
  )`;
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

// Resolve o JID de envio de uma conversa (prioriza @lid, onde estão as chaves Signal).
async function obterJidDaConversaIndex(tenantId, convId) {
  const contato = await db.oneOrNone(
    `SELECT co.telefone, co.wa_jid,
            (SELECT alias_jid FROM contato_aliases
             WHERE tenant_id = co.tenant_id AND contato_id = co.id AND alias_jid LIKE '%@lid'
             ORDER BY criado_em DESC LIMIT 1) AS alias_lid
     FROM conversas c JOIN contatos co ON co.id = c.contato_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [convId, tenantId]
  );
  if (!contato) return null;
  if (contato.wa_jid?.endsWith('@lid')) return contato.wa_jid;
  if (contato.alias_lid) return contato.alias_lid;
  const base = String(contato.wa_jid || '').split('@')[0];
  const digits = normalizarTelefoneWhatsApp(contato.telefone || base);
  return digits ? `${digits}@s.whatsapp.net` : null;
}

async function podeVerConversa(op, convId) {
  if (ehGestor(op)) {
    const r = await db.oneOrNone('SELECT 1 FROM conversas WHERE id = $1 AND tenant_id = $2', [convId, op.tenantId]);
    return !!r;
  }
  const r = await db.oneOrNone(
    `SELECT 1 FROM conversas c WHERE c.id = $1 AND c.tenant_id = $2 AND ${filtroVisibilidadeSql('c', '$3')}`,
    [convId, op.tenantId, op.id]
  );
  return !!r;
}

async function main() {
  await runMigrations();
  console.log('[Boot] Migrations complete');

  try {
    await seedDemoData();
  } catch (err) {
    console.warn('[Boot] Seed skipped:', err.message);
  }

  const wa = new WhatsAppManager();
  const storage = createStorage();

  const app = express();
  const server = createServer(app);

  app.use(cors({ origin: config.corsOrigin || '*', credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

app.use('/media', express.static(config.uploadsDir));

// Ponte de autenticação exclusiva do ambiente dev: valida a identidade no SaaS
// e provisiona somente o banco isolado. A própria rota retorna 404 em produção.
app.use('/api/dev/saas', devSaasRouter);

app.get('/health', async (_req, res) => {
  try {
    await db.one('SELECT 1');
    res.json({ status: 'ok', ambiente: process.env.NODE_ENV || 'production' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

app.post('/api/internal/sync-organization', async (req, res) => {
  const key = req.headers['x-internal-key'];
  if (key !== (config.internalApiKey || 'chatgov-internal-key-change-me')) {
    return res.status(401).json({ erro: 'Invalid internal key' });
  }

  try {
    const { organization_id, name, slug, is_active } = req.body;
    if (!organization_id || !name || !slug) {
      return res.status(400).json({ erro: 'organization_id, name, slug required' });
    }

    await ensureTenantProvisioned({ organization_id, name, slug, is_active });

    return res.json({ status: 'ok', organization_id });
  } catch (err) {
    console.error('[Internal] sync-organization error:', err.message);
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

app.post('/api/internal/sync-user', async (req, res) => {
  const key = req.headers['x-internal-key'];
  if (key !== (config.internalApiKey || 'chatgov-internal-key-change-me')) {
    return res.status(401).json({ erro: 'Invalid internal key' });
  }

  try {
    const { user_id, organization_id, name, email, is_active, roles = [] } = req.body;
    if (!user_id || !organization_id || !name || !email) {
      return res.status(400).json({ erro: 'user_id, organization_id, name, email required' });
    }

    let papel = 'operador';
    if (roles.some(r => ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ADMIN'].includes(r))) {
      papel = 'admin';
    }

    const bcrypt = await import('bcrypt');
    const defaultHash = await bcrypt.default.hash('chatgov123', 10);

    const existing = await db.oneOrNone(
      `SELECT id FROM operadores WHERE id = $1 OR (tenant_id = $2 AND email = $3)`,
      [user_id, organization_id, email.toLowerCase().trim()]
    );

    if (!existing) {
      await db.none(
        `INSERT INTO operadores (id, tenant_id, nome, email, senha_hash, papel)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user_id, organization_id, name, email.toLowerCase().trim(), defaultHash, papel]
      );

      // Vincula ao departamento "Geral" APENAS na criação do operador.
      // Em syncs subsequentes (a cada login) não mexemos nos departamentos,
      // para não desfazer as atribuições feitas por um admin.
      const deptGeral = await db.oneOrNone(
        "SELECT id FROM departamentos WHERE tenant_id = $1 AND nome = 'Geral' AND ativo = true",
        [organization_id]
      );
      if (deptGeral) {
        await db.none(
          'INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [user_id, deptGeral.id, organization_id]
        );
      }
    } else {
      await db.none(
        `UPDATE operadores SET tenant_id = $1, nome = $2, email = $3, papel = $4
         WHERE id = $5`,
        [organization_id, name, email.toLowerCase().trim(), papel, existing.id]
      );
    }

    return res.json({ status: 'ok', user_id });
  } catch (err) {
    console.error('[Internal] sync-user error:', err.message);
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

app.use('/api', authMiddleware);
app.use('/api', rateLimiter);

  app.use('/api/v2', operacaoV2Router);
  app.use('/api/v2/admin', administracaoV2Router);
  app.use('/api/evolucoes', rotasEvolucoes);

  app.get('/api/me', async (req, res) => {
    try {
      const op = req.operador;
      if (!op?.id) return res.json(op);
      const row = await db.oneOrNone(
        `SELECT o.id, o.nome, o.email, o.papel, o.tenant_id as "tenantId",
                t.nome as "tenantNome", t.slug as "tenantSlug"
         FROM operadores o
         LEFT JOIN tenants t ON t.id = o.tenant_id
         WHERE o.id = $1`,
        [op.id]
      );
      res.json(row || op);
    } catch (err) {
      res.json(req.operador);
    }
  });

  app.get('/api/conversas', async (req, res) => {
    try {
      const { status, departamento_id, busca, arquivadas } = req.query;
      const op = req.operador;

      let query = `
        SELECT c.*, co.nome as contato_nome, co.telefone as contato_telefone, co.wa_jid,
               co.avatar_url as contato_avatar_url,
               d.nome as departamento_nome, d.cor as departamento_cor,
               o.nome as operador_nome,
               pr.numero as protocolo_numero
        FROM conversas c
        JOIN contatos co ON co.id = c.contato_id
        LEFT JOIN departamentos d ON d.id = c.departamento_id
        LEFT JOIN operadores o ON o.id = c.operador_id
        LEFT JOIN protocolos pr ON pr.id = c.protocolo_id
        WHERE c.tenant_id = $1
      `;
      const params = [op.tenantId];
      let paramIdx = 2;

      if (!ehGestor(op)) {
        query += ` AND ${filtroVisibilidadeSql('c', `$${paramIdx}`)}`;
        params.push(op.id);
        paramIdx++;
      }

      if (status) {
        const statusNormalizado = String(status).toUpperCase();
        query += ` AND c.status_operacional = $${paramIdx++}`;
        params.push(statusNormalizado);
      } else if (arquivadas === 'true') {
        query += ` AND c.status_operacional = 'ARQUIVADA'`;
      } else {
        query += ` AND c.status_operacional NOT IN ('RESOLVIDA', 'ARQUIVADA') AND c.deleted_at IS NULL`;
      }
      if (departamento_id) {
        query += ` AND c.departamento_id = $${paramIdx++}::uuid`;
        params.push(departamento_id);
      }
      if (busca) {
        query += ` AND (co.nome ILIKE $${paramIdx} OR co.telefone ILIKE $${paramIdx} OR co.cpf ILIKE $${paramIdx})`;
        params.push(`%${busca}%`);
      }

      const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 100);
      const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
      query += ` ORDER BY c.ultima_mensagem_em DESC NULLS LAST LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
      params.push(limite, (pagina - 1) * limite);

      const conversas = await db.manyOrNone(query, params);
      res.json(conversas.map((c) => protectSensitiveFields(c, hasPermission(op.papel, PERMISSIONS.SENSITIVE_VIEW))));
    } catch (err) {
      console.error('[API] conversas error:', err.message);
      res.status(500).json({ erro: 'Erro ao buscar conversas' });
    }
  });

  app.get('/api/conversas/:id/mensagens', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      if (!(await podeVerConversa(op, id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      // Paginação por cursor: ?antesDe=<ISO criado_em>&limite=N carrega o lote
      // anterior (scroll infinito). Sem cursor, retorna as últimas `limite` mensagens.
      const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 200);
      const { antesDe } = req.query;
      const params = [id, op.tenantId];
      let filtroCursor = '';
      if (antesDe) {
        params.push(antesDe);
        filtroCursor = ` AND m.criado_em < $${params.length}`;
      }
      params.push(limite);
      const rows = await db.manyOrNone(
        `SELECT m.*, o.nome as operador_nome,
                COALESCE(
                  (
                    SELECT json_agg(json_build_object('nome', d.nome, 'cor', d.cor) ORDER BY d.nome)
                    FROM operador_departamentos od
                    JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
                    WHERE od.operador_id = m.operador_id
                      AND od.tenant_id = m.tenant_id
                  ),
                  '[]'::json
                ) AS operador_departamentos
         FROM mensagens m
         LEFT JOIN operadores o ON o.id = m.operador_id
         WHERE m.conversa_id = $1 AND m.tenant_id = $2${filtroCursor}
         ORDER BY m.criado_em DESC
         LIMIT $${params.length}`,
        params
      );
      // Mais antigas há mais para carregar se vier o lote cheio.
      const temMais = rows.length === limite;
      res.json({ mensagens: rows.reverse(), temMais });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar mensagens' });
    }
  });

  // Exclui (soft-delete) uma mensagem. Operador apaga as próprias mensagens enviadas;
  // admin pode apagar qualquer uma (LGPD). Tenta revogar no WhatsApp (best-effort).
  app.delete('/api/conversas/:id/mensagens/:msgId', async (req, res) => {
    try {
      const { id, msgId } = req.params;
      const op = req.operador;
      if (!(await podeVerConversa(op, id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      const msg = await db.oneOrNone(
        'SELECT * FROM mensagens WHERE id = $1 AND conversa_id = $2 AND tenant_id = $3',
        [msgId, id, op.tenantId]
      );
      if (!msg) return res.status(404).json({ erro: 'Mensagem não encontrada' });

      const ehAdmin = op.papel === 'admin';
      if (!ehAdmin && (msg.direcao !== 'saida' || msg.operador_id !== op.id)) {
        return res.status(403).json({ erro: 'Você só pode excluir mensagens que enviou' });
      }

      // Revoga no WhatsApp se foi enviada por nós e ainda temos o id da mensagem.
      if (msg.direcao === 'saida' && msg.wa_message_id) {
        const jid = await obterJidDaConversaIndex(op.tenantId, id);
        if (jid) await wa.revokeMessage(op.tenantId, jid, msg.wa_message_id, true);
      }

      await db.none(
        `UPDATE mensagens SET excluida = true, excluida_em = now(), conteudo = NULL, media_url = NULL
         WHERE id = $1 AND tenant_id = $2`,
        [msgId, op.tenantId]
      );
      io.to(`conversa:${id}`).emit('mensagem:excluida', { mensagemId: msgId, conversaId: id });
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] excluir mensagem error:', err.message);
      res.status(500).json({ erro: 'Erro ao excluir mensagem' });
    }
  });

  app.get('/api/departamentos', async (req, res) => {
    try {
      const op = req.operador;
      const departamentos = await db.manyOrNone(
        `SELECT d.*, s.nome AS secretaria_nome, s.cor AS secretaria_cor
         FROM departamentos d
         LEFT JOIN secretarias s ON s.id = d.secretaria_id
         WHERE d.tenant_id = $1 AND d.ativo = true
         ORDER BY s.nome NULLS LAST, d.nome`,
        [op.tenantId]
      );
      res.json(departamentos);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar departamentos' });
    }
  });

  // Painel de atendentes online por departamento
  app.get('/api/departamentos/painel', async (req, res) => {
    try {
      const op = req.operador;
      const deptos = await db.manyOrNone(
        `SELECT d.id, d.nome, s.nome AS secretaria_nome, s.cor AS secretaria_cor,
                COUNT(o.id) FILTER (WHERE o.online = true)::int AS atendentes_online,
                COUNT(c.id) FILTER (WHERE c.status = 'fila' AND c.operador_id IS NULL)::int AS conversas_na_fila
         FROM departamentos d
         LEFT JOIN secretarias s ON s.id = d.secretaria_id
         LEFT JOIN operador_departamentos od ON od.departamento_id = d.id
         LEFT JOIN operadores o ON o.id = od.operador_id
         LEFT JOIN conversas c ON c.departamento_id = d.id AND c.tenant_id = $1 AND c.status = 'fila'
         WHERE d.tenant_id = $1 AND d.ativo = true
         GROUP BY d.id, d.nome, s.nome, s.cor
         ORDER BY s.nome NULLS LAST, d.nome`,
        [op.tenantId]
      );
      res.json(deptos);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar painel' });
    }
  });

  app.get('/api/secretarias', async (req, res) => {
    try {
      const op = req.operador;
      const secretarias = await db.manyOrNone(
        `SELECT s.*, (SELECT COUNT(*)::int FROM departamentos d WHERE d.secretaria_id = s.id AND d.ativo = true) AS total_departamentos
         FROM secretarias s WHERE s.tenant_id = $1 AND s.ativo = true ORDER BY s.nome`,
        [op.tenantId]
      );
      res.json(secretarias);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar secretarias' });
    }
  });

  app.get('/api/conversas/:id/participantes', async (req, res) => {
    try {
      const op = req.operador;
      const { id } = req.params;
      if (!(await podeVerConversa(op, id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      const participantes = await db.manyOrNone(
        `SELECT p.operador_id, p.papel, o.nome, o.email, o.online
         FROM conversa_participantes p
         JOIN operadores o ON o.id = p.operador_id
         WHERE p.conversa_id = $1 AND p.tenant_id = $2
         ORDER BY p.papel DESC, o.nome`,
        [id, op.tenantId]
      );
      res.json(participantes);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar participantes' });
    }
  });

  // Transferência pendente de uma conversa (para mostrar aceite/recusa no painel).
  app.get('/api/conversas/:id/transferencia', async (req, res) => {
    try {
      const op = req.operador;
      const { id } = req.params;
      if (!(await podeVerConversa(op, id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      const t = await db.oneOrNone(
        `SELECT ct.id, ct.conversa_id, ct.de_operador_id, ct.para_operador_id, ct.motivo, ct.criado_em,
                od.nome AS de_nome, pa.nome AS para_nome
         FROM conversa_transferencias ct
         LEFT JOIN operadores od ON od.id = ct.de_operador_id
         LEFT JOIN operadores pa ON pa.id = ct.para_operador_id
         WHERE ct.conversa_id = $1 AND ct.tenant_id = $2 AND ct.status = 'pendente'
         ORDER BY ct.criado_em DESC LIMIT 1`,
        [id, op.tenantId]
      );
      res.json(t || null);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar transferência' });
    }
  });

  // Galeria de mídia da conversa: todas as mensagens com arquivo (foto/vídeo/áudio/documento).
  app.get('/api/conversas/:id/midias', async (req, res) => {
    try {
      const op = req.operador;
      if (!(await podeVerConversa(op, req.params.id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      const rows = await db.manyOrNone(
        `SELECT id, tipo, media_url, media_mime, media_nome, conteudo, direcao, criado_em
         FROM mensagens
         WHERE conversa_id = $1 AND tenant_id = $2
           AND media_url IS NOT NULL AND excluida = false
         ORDER BY criado_em DESC`,
        [req.params.id, op.tenantId]
      );
      res.json(rows);
    } catch (err) {
      console.error('[API] midias conversa error:', err.message);
      res.status(500).json({ erro: 'Erro ao buscar mídias' });
    }
  });

  // Marca a conversa como não lida (badge na lista). É zerada ao reabrir a conversa.
  app.post('/api/conversas/:id/marcar-nao-lida', async (req, res) => {
    try {
      const op = req.operador;
      if (!(await podeVerConversa(op, req.params.id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      await db.none(
        `UPDATE conversas SET nao_lidas = GREATEST(nao_lidas, 1) WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, op.tenantId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] marcar nao lida error:', err.message);
      res.status(500).json({ erro: 'Erro ao marcar como não lida' });
    }
  });

  // Linha do tempo da conversa: quem fez o quê e quando. Reúne três fontes que já
  // existem — auditoria (ações do painel), eventos_status (transições formais) e
  // notas internas — em vez de criar mais um registro paralelo.
  const ROTULO_MOVIMENTACAO = {
    'conversa.assumida': 'Atendimento assumido',
    'conversa.atribuida': 'Encaminhado para setor',
    'conversa.devolvida': 'Devolvido para a fila',
    'conversa.transferida.solicitada': 'Transferência solicitada',
    'conversa.transferida.aceita': 'Transferência aceita',
    'conversa.transferida.rejeitada': 'Transferência recusada',
    'conversa.anexados': 'Atendentes anexados',
    'conversa.exclusao_logica': 'Conversa excluída',
    'conversa.status.alterado': 'Status alterado',
    'conversa.resolvida': 'Atendimento resolvido',
    'conversa.reaberta': 'Atendimento reaberto',
    'conversa.arquivada': 'Conversa arquivada',
    'conversa.desarquivada': 'Conversa desarquivada',
    'conversa.excluida': 'Conversa excluída',
    'conversa.nao_lida': 'Marcada como não lida',
    'etiqueta.adicionada': 'Etiqueta adicionada',
    'etiqueta.removida': 'Etiqueta removida',
  };

  app.get('/api/conversas/:id/historico', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      if (!(await podeVerConversa(op, id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }

      const [conversa, acoes, transicoes, notas] = await Promise.all([
        db.oneOrNone(
          `SELECT c.criado_em, c.resolvida_em, c.arquivada_em, p.numero AS protocolo_numero, p.aberto_em AS protocolo_em
           FROM conversas c LEFT JOIN protocolos p ON p.id = c.protocolo_id
           WHERE c.id = $1 AND c.tenant_id = $2`,
          [id, op.tenantId]
        ),
        db.manyOrNone(
          `SELECT a.acao, a.detalhe, a.criado_em, o.nome AS operador_nome
           FROM auditoria a LEFT JOIN operadores o ON o.id = a.operador_id
           WHERE a.tenant_id = $1
             AND a.acao <> 'mensagem.enviada'
             AND (a.entidade_id = $2 OR a.detalhe ->> 'conversaId' = $3)
           ORDER BY a.criado_em DESC LIMIT 60`,
          [op.tenantId, id, id]
        ),
        db.manyOrNone(
          `SELECT e.status_anterior, e.novo_status, e.justificativa, e.criado_em, o.nome AS operador_nome
           FROM eventos_status e LEFT JOIN operadores o ON o.id = e.operador_id
           WHERE e.tenant_id = $1 AND e.entidade = 'conversa' AND e.entidade_id = $2
           ORDER BY e.criado_em DESC LIMIT 60`,
          [op.tenantId, id]
        ),
        db.manyOrNone(
          `SELECT n.criado_em, o.nome AS operador_nome
           FROM notas_internas n LEFT JOIN operadores o ON o.id = n.operador_id
           WHERE n.conversa_id = $1 AND n.tenant_id = $2
           ORDER BY n.criado_em DESC LIMIT 30`,
          [id, op.tenantId]
        ),
      ]);
      if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada' });

      const eventos = [];
      const push = (tipo, titulo, criado_em, detalhe, operador_nome) => {
        if (criado_em) eventos.push({ tipo, titulo, criado_em, detalhe: detalhe || null, operador_nome: operador_nome || null });
      };

      push('inicio', 'Atendimento recebido', conversa.criado_em);
      if (conversa.protocolo_numero) push('protocolo', `Protocolo #${conversa.protocolo_numero} gerado`, conversa.protocolo_em);
      acoes.forEach((a) => push(
        'acao',
        ROTULO_MOVIMENTACAO[a.acao] || a.acao,
        a.criado_em,
        a.detalhe?.motivo || a.detalhe?.departamentoNome || null,
        a.operador_nome
      ));
      transicoes.forEach((t) => push(
        'status',
        `Status: ${t.status_anterior || '—'} → ${t.novo_status}`,
        t.criado_em, t.justificativa, t.operador_nome
      ));
      notas.forEach((n) => push('nota', 'Nota interna adicionada', n.criado_em, null, n.operador_nome));
      if (conversa.resolvida_em) push('resolvida', 'Atendimento resolvido', conversa.resolvida_em);
      if (conversa.arquivada_em) push('arquivada', 'Conversa arquivada', conversa.arquivada_em);

      eventos.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      res.json({ eventos });
    } catch (err) {
      console.error('[API] histórico da conversa:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar o histórico' });
    }
  });

  // Ficha do cidadão para o painel lateral do atendimento: cadastro, protocolos,
  // atendimentos anteriores e bloqueio. Uma chamada só — o painel abre e fecha o
  // tempo todo e não vale multiplicar requisições.
  app.get('/api/conversas/:id/ficha', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      if (!(await podeVerConversa(op, id))) {
        return res.status(403).json({ erro: 'Sem acesso a esta conversa' });
      }
      const conversa = await db.oneOrNone(
        `SELECT c.id, c.contato_id, c.criado_em, c.departamento_id, c.operador_id,
                d.nome AS departamento_nome, d.cor AS departamento_cor,
                o.nome AS operador_nome, p.numero AS protocolo_numero
         FROM conversas c
         LEFT JOIN departamentos d ON d.id = c.departamento_id
         LEFT JOIN operadores o ON o.id = c.operador_id
         LEFT JOIN protocolos p ON p.id = c.protocolo_id
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [id, op.tenantId]
      );
      if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada' });

      const [contato, protocolos, atendimentos, bloqueio, primeiroContato] = await Promise.all([
        db.oneOrNone(
          `SELECT id, nome, telefone, phone_display, cpf, data_nascimento, endereco, bairro,
                  avatar_url, criado_em
           FROM contatos WHERE id = $1 AND tenant_id = $2`,
          [conversa.contato_id, op.tenantId]
        ),
        db.manyOrNone(
          `SELECT p.numero, p.assunto, p.status, p.aberto_em, p.fechado_em, d.nome AS departamento_nome
           FROM protocolos p
           LEFT JOIN departamentos d ON d.id = p.departamento_id
           WHERE p.contato_id = $1 AND p.tenant_id = $2
           ORDER BY p.aberto_em DESC LIMIT 10`,
          [conversa.contato_id, op.tenantId]
        ),
        db.manyOrNone(
          `SELECT c.id, c.criado_em, c.ultima_mensagem_em, c.status, c.status_operacional,
                  d.nome AS departamento_nome, o.nome AS operador_nome
           FROM conversas c
           LEFT JOIN departamentos d ON d.id = c.departamento_id
           LEFT JOIN operadores o ON o.id = c.operador_id
           WHERE c.contato_id = $1 AND c.tenant_id = $2 AND c.id <> $3 AND c.deleted_at IS NULL
           ORDER BY c.ultima_mensagem_em DESC NULLS LAST LIMIT 8`,
          [conversa.contato_id, op.tenantId, id]
        ),
        db.oneOrNone(
          `SELECT motivo, criado_em, expira_em FROM contatos_bloqueados
           WHERE tenant_id = $1 AND ativo = true
             AND (phone_e164 = (SELECT phone_e164 FROM contatos WHERE id = $2)
                  OR telefone = (SELECT telefone FROM contatos WHERE id = $2))
             AND (expira_em IS NULL OR expira_em > now())
           LIMIT 1`,
          [op.tenantId, conversa.contato_id]
        ),
        db.oneOrNone(
          `SELECT min(criado_em) AS em FROM mensagens
           WHERE tenant_id = $1 AND conversa_id IN (
             SELECT id FROM conversas WHERE contato_id = $2 AND tenant_id = $1
           )`,
          [op.tenantId, conversa.contato_id]
        ),
      ]);

      res.json({
        contato,
        conversa,
        protocolos,
        atendimentos,
        bloqueio: bloqueio || null,
        primeiro_contato_em: primeiroContato?.em || conversa.criado_em,
      });
    } catch (err) {
      console.error('[API] ficha do cidadão:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar a ficha do cidadão' });
    }
  });

  // Pré-checagem da tela "Nova conversa": dado um telefone, diz se já existe
  // contato cadastrado e se há atendimento em andamento. Serve para preencher o
  // nome sozinho e para avisar antes de abrir uma conversa duplicada.
  app.get('/api/contatos/prechecagem', async (req, res) => {
    try {
      const op = req.operador;
      const digits = normalizarTelefoneWhatsApp(req.query.telefone || '');
      if (digits.length < 10) return res.json({ contato: null, conversa: null });

      const variantes = variantesTelefoneBrasil(digits);
      const contato = await db.oneOrNone(
        `SELECT id, nome, telefone, avatar_url
         FROM contatos
         WHERE tenant_id = $1 AND (telefone = ANY($2) OR wa_jid = ANY($3))
         LIMIT 1`,
        [op.tenantId, variantes, variantes.map((n) => `${n}@s.whatsapp.net`)]
      );
      if (!contato) return res.json({ contato: null, conversa: null });

      // Só interessa o atendimento que ainda está de pé — resolvido/arquivado
      // não impede abrir um novo.
      const conversa = await db.oneOrNone(
        `SELECT c.id, c.status, c.status_operacional, c.criado_em, c.ultima_mensagem_em,
                d.nome AS departamento_nome, o.nome AS operador_nome, p.numero AS protocolo_numero
         FROM conversas c
         LEFT JOIN departamentos d ON d.id = c.departamento_id
         LEFT JOIN operadores o ON o.id = c.operador_id
         LEFT JOIN protocolos p ON p.id = c.protocolo_id
         WHERE c.tenant_id = $1 AND c.contato_id = $2 AND c.deleted_at IS NULL
           AND COALESCE(c.status_operacional, '') NOT IN ('RESOLVIDA', 'ARQUIVADA')
           AND COALESCE(c.status, '') NOT IN ('resolvida', 'arquivada')
         ORDER BY c.ultima_mensagem_em DESC NULLS LAST
         LIMIT 1`,
        [op.tenantId, contato.id]
      );
      res.json({ contato, conversa: conversa || null });
    } catch (err) {
      console.error('[API] prechecagem de contato:', err.message);
      res.status(500).json({ erro: 'Erro ao consultar o contato' });
    }
  });

  app.post('/api/conversas/iniciar', async (req, res) => {
    try {
      const op = req.operador;
      let { telefone, nome, departamento_id, mensagem } = req.body;
      if (!telefone) return res.status(400).json({ erro: 'Telefone obrigatório' });

      const digits = normalizarTelefoneWhatsApp(telefone);
      if (digits.length < 10) return res.status(400).json({ erro: 'Telefone inválido' });
      const jid = `${digits}@s.whatsapp.net`;

      const variantes = variantesTelefoneBrasil(digits);
      let contato = await db.oneOrNone(
        `SELECT co.id
         FROM contatos co
         LEFT JOIN conversas c ON c.contato_id = co.id
         WHERE co.tenant_id = $1
           AND (co.telefone = ANY($2) OR co.wa_jid = ANY($3))
         ORDER BY CASE WHEN c.status IN ('aberta', 'fila') THEN 0 ELSE 1 END,
                  c.ultima_mensagem_em DESC NULLS LAST
         LIMIT 1`,
        [op.tenantId, variantes, variantes.map((n) => `${n}@s.whatsapp.net`)]
      );

      if (!contato) {
        contato = await db.one(
          `INSERT INTO contatos (tenant_id, wa_jid, nome, telefone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, wa_jid) DO UPDATE SET nome = COALESCE(EXCLUDED.nome, contatos.nome)
           RETURNING id`,
          [op.tenantId, jid, nome || null, digits]
        );
      } else if (nome) {
        await db.none(
          'UPDATE contatos SET nome = COALESCE(nome, $1) WHERE id = $2 AND tenant_id = $3',
          [nome, contato.id, op.tenantId]
        );
      }

      // Busca foto de perfil do WhatsApp em background.
      buscarAvatarContato(wa, op.tenantId, contato.id).catch(() => {});

      const conversa = await db.one(
        `INSERT INTO conversas (tenant_id, contato_id, departamento_id, operador_id, status, status_operacional, ultima_mensagem_em)
         VALUES ($1, $2, $3, $4, 'aberta', 'EM_ATENDIMENTO', now())
         ON CONFLICT (tenant_id, contato_id) DO UPDATE
           SET status = CASE WHEN conversas.status = 'resolvida' THEN 'aberta' ELSE conversas.status END,
               status_operacional = CASE WHEN conversas.status_operacional IN ('RESOLVIDA','ARQUIVADA') THEN 'EM_ATENDIMENTO' ELSE conversas.status_operacional END,
               departamento_id = COALESCE($3, conversas.departamento_id),
               operador_id = COALESCE(conversas.operador_id, $4)
         RETURNING *`,
        [op.tenantId, contato.id, departamento_id || null, op.id]
      );

      await db.none(
        `INSERT INTO conversa_participantes (conversa_id, operador_id, papel, adicionado_por, tenant_id)
         VALUES ($1, $2, 'dono', $2, $3) ON CONFLICT DO NOTHING`,
        [conversa.id, op.id, op.tenantId]
      );

      if (mensagem && mensagem.trim()) {
        try {
          const cfgAss = await db.oneOrNone(
            'SELECT assinatura_ativa, assinatura_modo FROM tenant_config WHERE tenant_id = $1',
            [op.tenantId]
          );
          let textoAssinado = mensagem.trim();
          if (op?.nome && cfgAss?.assinatura_ativa !== false) {
            const nomeAss = cfgAss?.assinatura_modo === 'primeiro' ? op.nome.trim().split(/\s+/)[0] : op.nome;
            const depsAss = await db.manyOrNone(
              `SELECT d.nome
               FROM operador_departamentos od
               JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true
               WHERE od.operador_id = $1 AND od.tenant_id = $2
               ORDER BY d.nome`,
              [op.id, op.tenantId]
            );
            const depsTexto = depsAss.map((d) => d.nome).filter(Boolean);
            const assinatura = depsTexto.length > 0 ? `${nomeAss} (${depsTexto.slice(0, 2).join(', ')})` : nomeAss;
            textoAssinado = `*${assinatura}*\n${mensagem.trim()}`;
          }
          const result = await wa.sendText(op.tenantId, jid, textoAssinado);
          await db.none(
            `INSERT INTO mensagens (tenant_id, conversa_id, wa_message_id, direcao, operador_id, tipo, conteudo, status, criado_em)
             VALUES ($1, $2, $3, 'saida', $4, 'texto', $5, 'enviado', now())`,
            [op.tenantId, conversa.id, result?.key?.id || null, op.id, mensagem.trim()]
          );
          await db.none(
            `UPDATE conversas SET ultima_mensagem = $1, ultima_mensagem_em = now() WHERE id = $2`,
            [mensagem.trim(), conversa.id]
          );
          // Salva o JID resolvido como alias (não bloqueia o fluxo se falhar)
          if (result?.key?.remoteJid && result.key.remoteJid !== jid) {
            db.none(
              `INSERT INTO contato_aliases (tenant_id, contato_id, alias_jid)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, alias_jid) DO NOTHING`,
              [op.tenantId, contato.id, result.key.remoteJid]
            ).catch(() => {});
          }
        } catch (waErr) {
          console.error('[API] wa.sendText falhou:', waErr.message);
          return res.status(502).json({ erro: 'Conversa criada, mas o WhatsApp não está conectado para enviar a mensagem', conversa });
        }
      }

      res.json(conversa);
    } catch (err) {
      console.error('[API] iniciar conversa error:', err.message);
      res.status(500).json({ erro: 'Erro ao iniciar conversa' });
    }
  });

  app.get('/api/operadores', async (req, res) => {
    try {
      const op = req.operador;
      const operadores = await db.manyOrNone(
        `SELECT o.id, o.nome, o.email, o.papel, o.avatar_url, o.online, o.ultimo_visto,
                COALESCE(array_agg(od.departamento_id) FILTER (WHERE d.ativo = true), '{}') AS departamento_ids
         FROM operadores o
         LEFT JOIN operador_departamentos od ON od.operador_id = o.id
         LEFT JOIN departamentos d ON d.id = od.departamento_id
         WHERE o.tenant_id = $1
         GROUP BY o.id
         ORDER BY o.online DESC, o.nome`,
        [op.tenantId]
      );
      res.json(operadores);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar operadores' });
    }
  });

  app.get('/api/whatsapp/status', async (req, res) => {
    const op = req.operador;
    const status = wa.getStatus(op.tenantId);
    const numero = wa.getNumber(op.tenantId);
    res.json({ status, numero });
  });

  app.get('/api/canais-internos', async (req, res) => {
    try {
      const op = req.operador;
      const canais = await db.manyOrNone(
        `SELECT ci.*,
                array_agg(json_build_object('id', cm.operador_id, 'nome', o.nome, 'online', o.online)) as membros,
                (
                  SELECT json_build_object(
                    'id', mi.id,
                    'conteudo', mi.conteudo,
                    'tipo', mi.tipo,
                    'criado_em', mi.criado_em,
                    'remetente_id', mi.remetente_id,
                    'remetente_nome', aut.nome
                  )
                  FROM mensagens_internas mi
                  LEFT JOIN operadores aut ON aut.id = mi.remetente_id
                  WHERE mi.canal_id = ci.id AND mi.excluida = false
                  ORDER BY mi.criado_em DESC LIMIT 1
                ) as ultima_mensagem,
                (
                  SELECT COUNT(*)::int
                  FROM mensagens_internas mi
                  LEFT JOIN leituras_mensagens lm
                    ON lm.operador_id = $2 AND lm.canal_id = mi.canal_id
                  WHERE mi.canal_id = ci.id
                    AND mi.tenant_id = $1
                    AND mi.remetente_id <> $2
                    AND mi.excluida = false
                    AND mi.criado_em > COALESCE(lm.lido_ate, '1970-01-01'::timestamp)
                )::int as nao_lidas
         FROM canais_internos ci
         JOIN canal_membros cm ON cm.canal_id = ci.id
         JOIN operadores o ON o.id = cm.operador_id
         WHERE ci.tenant_id = $1
         GROUP BY ci.id
         ORDER BY ci.criado_em DESC`,
        [op.tenantId, op.id]
      );
      res.json(canais);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar canais' });
    }
  });

  app.post('/api/canais-internos', async (req, res) => {
    try {
      const op = req.operador;
      const { tipo, nome, membros } = req.body;

      const canal = await db.one(
        `INSERT INTO canais_internos (tenant_id, nome, tipo, criado_por)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [op.tenantId, nome || null, tipo || 'dm', op.id]
      );

      const idsMembros = membros || [op.id];
      const uniqueMembros = [...new Set(idsMembros)];
      for (const membroId of uniqueMembros) {
        await db.none(
          'INSERT INTO canal_membros (canal_id, operador_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [canal.id, membroId, op.tenantId]
        );
      }

      res.json(canal);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar canal' });
    }
  });

  app.get('/api/canais-internos/:id/mensagens', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      const { listarMensagensCanal, assertMembroCanal, getReacoes } = await import('./services/mensagens.js');
      const antesDe = req.query.antesDe || null;
      const limite = req.query.limite || 50;
      try {
        await assertMembroCanal(op.tenantId, id, op.id);
      } catch (e) {
        return res.status(403).json({ erro: e.message });
      }
      const mensagens = await listarMensagensCanal(op.tenantId, id, op.id, { antesDe, limite });
      // Inclui reações nas mensagens do histórico
      if (mensagens.length > 0) {
        const ids = mensagens.map((m) => m.id);
        const reacoes = await getReacoes(op.tenantId, ids);
        const reacoesMap = {};
        for (const r of reacoes) {
          reacoesMap[r.msg_id] = r;
        }
        for (const m of mensagens) {
          if (reacoesMap[m.id]) {
            m._reacao_raw = reacoesMap[m.id];
          }
        }
      }
      res.json(mensagens);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar mensagens' });
    }
  });

  app.delete('/api/canais-internos/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      const { ehMembroCanal } = await import('./services/mensagens.js');
      const canal = await db.oneOrNone(
        'SELECT * FROM canais_internos WHERE id = $1 AND tenant_id = $2',
        [id, op.tenantId]
      );
      if (!canal) return res.status(404).json({ erro: 'Canal nao encontrado' });
      if (canal.criado_por !== op.id && op.papel !== 'admin') {
        const ehMembro = await ehMembroCanal(op.tenantId, id, op.id);
        if (!ehMembro) return res.status(403).json({ erro: 'Sem permissao' });
      }

      await db.none('DELETE FROM canais_internos WHERE id = $1 AND tenant_id = $2', [id, op.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir canal' });
    }
  });

  // Gerenciar membros do canal
  app.post('/api/canais-internos/:id/membros', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      const { membros } = req.body; // array de operador IDs
      const { assertMembroCanal } = await import('./services/mensagens.js');
      await assertMembroCanal(op.tenantId, id, op.id);
      if (!Array.isArray(membros) || membros.length === 0) {
        return res.status(400).json({ erro: 'Lista de membros obrigatoria' });
      }
      for (const membroId of membros) {
        await db.none(
          'INSERT INTO canal_membros (canal_id, operador_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [id, membroId, op.tenantId]
        );
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao adicionar membros' });
    }
  });

  app.delete('/api/canais-internos/:id/membros/:operadorId', async (req, res) => {
    try {
      const { id, operadorId } = req.params;
      const op = req.operador;
      const { assertMembroCanal, ehMembroCanal } = await import('./services/mensagens.js');
      await assertMembroCanal(op.tenantId, id, op.id);
      // Só pode remover outros se for admin ou dono do canal
      const canal = await db.oneOrNone('SELECT criado_por FROM canais_internos WHERE id = $1 AND tenant_id = $2', [id, op.tenantId]);
      if (!canal) return res.status(404).json({ erro: 'Canal nao encontrado' });
      if (canal.criado_por !== op.id && op.papel !== 'admin') {
        return res.status(403).json({ erro: 'Apenas o criador do canal pode remover membros' });
      }
      await db.none(
        'DELETE FROM canal_membros WHERE canal_id = $1 AND operador_id = $2 AND tenant_id = $3',
        [id, operadorId, op.tenantId]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao remover membro' });
    }
  });

  app.post('/api/canais-internos/:id/sair', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      await db.none(
        'DELETE FROM canal_membros WHERE canal_id = $1 AND operador_id = $2 AND tenant_id = $3',
        [id, op.id, op.tenantId]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao sair do canal' });
    }
  });

  // Enquetes
  app.post('/api/canais-internos/:id/enquetes', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      const { assertMembroCanal } = await import('./services/mensagens.js');
      await assertMembroCanal(op.tenantId, id, op.id);
      const { pergunta, opcoes } = req.body;
      if (!pergunta || !Array.isArray(opcoes) || opcoes.length < 2) {
        return res.status(400).json({ erro: 'Enquete invalida' });
      }
      const msgId = uuidv4();
      const dados = JSON.stringify({ pergunta, opcoes, votos: {} }); // votos: { opcaoIdx: [operadorId, ...] }
      const msg = await db.one(
        `INSERT INTO mensagens_internas (id, tenant_id, canal_id, remetente_id, tipo, conteudo, criado_em)
         VALUES ($1, $2, $3, $4, 'enquete', $5, now()) RETURNING *`,
        [msgId, op.tenantId, id, op.id, dados]
      );
      msg.remetente_nome = op.nome;
      io.to(salas.canal(id)).emit('interno:nova', msg);
      res.json({ ok: true, mensagem: msg });
    } catch (err) {
      console.error('[Socket] enquete criar error:', err.message);
      res.status(500).json({ erro: 'Erro ao criar enquete' });
    }
  });

  app.post('/api/canais-internos/:canalId/enquetes/:msgId/votar', async (req, res) => {
    try {
      const { canalId, msgId } = req.params;
      const op = req.operador;
      const { assertMembroCanal } = await import('./services/mensagens.js');
      await assertMembroCanal(op.tenantId, canalId, op.id);
      const { opcao_idx } = req.body;
      const msg = await db.oneOrNone(
        "SELECT * FROM mensagens_internas WHERE id = $1 AND canal_id = $2 AND tenant_id = $3 AND tipo = 'enquete'",
        [msgId, canalId, op.tenantId]
      );
      if (!msg) return res.status(404).json({ erro: 'Enquete nao encontrada' });
      let dados = JSON.parse(msg.conteudo || '{}');
      dados.votos = dados.votos || {};
      // Remove voto anterior do operador
      for (const k of Object.keys(dados.votos)) {
        dados.votos[k] = (dados.votos[k] || []).filter((oid) => oid !== op.id);
        if (dados.votos[k].length === 0) delete dados.votos[k];
      }
      // Adiciona novo voto
      const key = String(opcao_idx);
      dados.votos[key] = [...(dados.votos[key] || []), op.id];
      await db.none(
        'UPDATE mensagens_internas SET conteudo = $1 WHERE id = $2 AND tenant_id = $3',
        [JSON.stringify(dados), msgId, op.tenantId]
      );
      io.to(salas.canal(canalId)).emit('enquete:atualizada', { msgId, dados });
      res.json({ ok: true, dados });
    } catch (err) {
      console.error('[Socket] enquete votar error:', err.message);
      res.status(500).json({ erro: 'Erro ao votar' });
    }
  });

  // Busca de mensagens no canal
  app.get('/api/canais-internos/:id/buscar', async (req, res) => {
    try {
      const { id } = req.params;
      const op = req.operador;
      const { q } = req.query;
      const { assertMembroCanal } = await import('./services/mensagens.js');
      try {
        await assertMembroCanal(op.tenantId, id, op.id);
      } catch (e) {
        return res.status(403).json({ erro: e.message });
      }
      if (!q || q.trim().length < 2) {
        return res.json([]);
      }
      const mensagens = await db.manyOrNone(
        `SELECT mi.*, aut.nome AS remetente_nome
         FROM mensagens_internas mi
         LEFT JOIN operadores aut ON aut.id = mi.remetente_id
         WHERE mi.canal_id = $1
           AND mi.tenant_id = $2
           AND mi.excluida = false
           AND mi.tipo = 'texto'
           AND mi.conteudo ILIKE '%' || $3 || '%'
         ORDER BY mi.criado_em DESC
         LIMIT 30`,
        [id, op.tenantId, q.trim()]
      );
      res.json(mensagens);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar mensagens' });
    }
  });

  app.get('/api/fila/contagem', async (req, res) => {
    try {
      const op = req.operador;
      const result = await db.one(
        'SELECT COUNT(*)::int as total FROM conversas WHERE tenant_id = $1 AND status = $2',
        [op.tenantId, 'fila']
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar contagem' });
    }
  });

  // ===== Painel Operacional (KPIs, SLA, volume por setor) =====
  app.get('/api/conversas/operacional', async (req, res) => {
    try {
      const op = req.operador;
      const { departamento_id } = req.query;
      const gestor = ehGestor(op);

      // Clausula de visibilidade para queries agregadas.
      // Para gestores: sem restricao alem do tenant.
      // Para operadores: ve apenas o que o filtroVisibilidadeSql permite.
      const params = [op.tenantId];
      let idx = 2;

      const visibilidadeWhere = gestor
        ? ''
        : ` AND ${filtroVisibilidadeSql('c', `$${idx++}`)}`;
      if (!gestor) params.push(op.id);

      let deptFilter = '';
      if (departamento_id) {
        deptFilter = ` AND c.departamento_id = $${idx++}::uuid`;
        params.push(departamento_id);
      }

      // ---- KPIs ----
      // na_fila: conversas com status='fila'
      const filaQuery = `SELECT COUNT(*)::int FROM conversas c WHERE c.tenant_id = $1 AND c.status = 'fila'${visibilidadeWhere}${deptFilter}`;
      const filaParams = [...params];

      // em_andamento: conversas com status='aberta' (agente respondeu e aguarda cidadao, ou em andamento)
      const andamentoQuery = `SELECT COUNT(*)::int FROM conversas c WHERE c.tenant_id = $1 AND c.status = 'aberta'${visibilidadeWhere}${deptFilter}`;
      const andamentoParams = [...params];

      // concluidos_hoje: resolvidas no dia corrente (fuso do tenant -- usamos o servidor por enquanto)
      const hojeParams = [...params];
      const concluidosQuery = `SELECT COUNT(*)::int FROM conversas c
        WHERE c.tenant_id = $1
        AND c.status = 'resolvida'
        AND c.ultima_mensagem_em >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::timestamptz
        AND c.ultima_mensagem_em < ((CURRENT_DATE + 1) AT TIME ZONE 'America/Sao_Paulo')::timestamptz
        ${visibilidadeWhere}${deptFilter}`;

      // nao_lidas: soma de c.nao_lidas das conversas visiveis
      const naoLidasQuery = `SELECT COALESCE(SUM(c.nao_lidas), 0)::int FROM conversas c WHERE c.tenant_id = $1 AND c.nao_lidas > 0${visibilidadeWhere}${deptFilter}`;
      const naoLidasParams = [...params];

      // tma_primeira_resposta: tempo medio (seg) entre mensagem de entrada e primeira saida do agente HOJE.
      // Usa LATERAL para buscar a primeira resposta em uma única subquery, evitando 3 correlated subqueries.
      const tmaQuery = `
        WITH entradas_hoje AS (
          SELECT m.conversa_id, m.criado_em AS entrada_em
          FROM mensagens m
          JOIN conversas c ON c.id = m.conversa_id AND c.tenant_id = $1
          WHERE m.tenant_id = $1
            AND m.direcao = 'entrada'
            AND m.operador_id IS NULL
            AND m.criado_em >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::timestamptz
            AND m.criado_em < ((CURRENT_DATE + 1) AT TIME ZONE 'America/Sao_Paulo')::timestamptz
            ${visibilidadeWhere}${deptFilter}
        )
        SELECT COALESCE(AVG(
          EXTRACT(EPOCH FROM (r.resposta_em - e.entrada_em))
        ), 0)::float AS tma_seg
        FROM entradas_hoje e
        CROSS JOIN LATERAL (
          SELECT MIN(m2.criado_em) AS resposta_em
          FROM mensagens m2
          WHERE m2.conversa_id = e.conversa_id
            AND m2.tenant_id = $1
            AND m2.direcao = 'saida'
            AND m2.operador_id IS NOT NULL
            AND m2.criado_em > e.entrada_em
        ) r
        WHERE r.resposta_em IS NOT NULL`;

      // ---- SLA: top conversas aguardando resposta do agente ----
      // Regra correta:
      // 1. Conversa aberta (fila | aberta)
      // 2. A ULTIMA mensagem de qualquer autor deve ser do CIDADÃO (direcao='entrada')
      // 3. espera = now - timestamp dessa ultima mensagem
      // 4. Ordenado decrescente por espera; top N
      // Usamos DISTINCT ON + window para pegar a ultima mensagem de cada conversa.
      const slaLimit = parseInt(req.query.sla_limite, 10) || 5;
      const slaAbandonoSeg = parseInt(req.query.sla_abandono_seg, 10) || (7 * 24 * 3600);
      const slaQuery = `
        WITH ultima_msg AS (
          SELECT DISTINCT ON (m.conversa_id)
            m.conversa_id,
            m.direcao,
            m.operador_id,
            m.criado_em
          FROM mensagens m
          WHERE m.tenant_id = $1
          ORDER BY m.conversa_id, m.criado_em DESC
        )
        SELECT c.id, um.criado_em AS ultima_mensagem_cidadao_em,
               co.nome AS contato_nome, co.telefone AS contato_telefone,
               d.nome AS departamento_nome, d.cor AS departamento_cor,
               EXTRACT(EPOCH FROM (NOW() - um.criado_em))::int AS espera_segundos
        FROM conversas c
        JOIN contatos co ON co.id = c.contato_id
        JOIN ultima_msg um ON um.conversa_id = c.id
        LEFT JOIN departamentos d ON d.id = c.departamento_id
        WHERE c.tenant_id = $1
          AND c.status IN ('fila', 'aberta')
          AND um.direcao = 'entrada'
          AND um.operador_id IS NULL
          ${visibilidadeWhere}${deptFilter}
          AND EXTRACT(EPOCH FROM (NOW() - um.criado_em)) <= $${idx++}
        ORDER BY um.criado_em ASC
        LIMIT $${idx++}`;
      const slaParams = [...params, slaAbandonoSeg, slaLimit];

      // Contagem de abandonadas (espera > teto, sem visibilidade no ranking)
      const abandonadasQuery = `
        WITH ultima_msg AS (
          SELECT DISTINCT ON (m.conversa_id)
            m.conversa_id, m.direcao, m.operador_id, m.criado_em
          FROM mensagens m
          WHERE m.tenant_id = $1
          ORDER BY m.conversa_id, m.criado_em DESC
        )
        SELECT COUNT(*)::int FROM conversas c
        JOIN ultima_msg um ON um.conversa_id = c.id
        WHERE c.tenant_id = $1
          AND c.status IN ('fila', 'aberta')
          AND um.direcao = 'entrada'
          AND um.operador_id IS NULL
          ${visibilidadeWhere}${deptFilter}
          AND EXTRACT(EPOCH FROM (NOW() - um.criado_em)) > $${idx++}`;
      const abandonadasParams = [...params, slaAbandonoSeg];

      // ---- Volume por setor (abertas agora, sem janela, bate com KPIs) ----
      // LEFT JOIN inclui conversas sem departamento (agrupadas como "Sem setor").
      const volumeQuery = `
        SELECT COALESCE(d.id::text, 'sem-setor') AS departamento_id,
               COALESCE(d.nome, 'Sem setor') AS departamento_nome,
               COALESCE(d.cor, '#6B7280') AS departamento_cor,
               COUNT(c.id)::int AS total
        FROM conversas c
        LEFT JOIN departamentos d ON d.id = c.departamento_id AND d.ativo = true
        WHERE c.tenant_id = $1
          AND c.status IN ('fila', 'aberta')
          ${visibilidadeWhere}
        GROUP BY d.id, d.nome, d.cor
        ORDER BY total DESC`;
      const volumeParams = [op.tenantId];
      if (!gestor) volumeParams.push(op.id);

      const [naFila, emAndamento, concluidosHoje, naoLidas, tma, sla, abandonadas, volume] = await Promise.all([
        db.one(filaQuery, filaParams).then(r => r.count).catch(() => 0),
        db.one(andamentoQuery, andamentoParams).then(r => r.count).catch(() => 0),
        db.one(concluidosQuery, hojeParams).then(r => r.count).catch(() => 0),
        db.one(naoLidasQuery, naoLidasParams).then(r => r.sum || 0).catch(() => 0),
        db.one(tmaQuery, params).then(r => Math.round(r.tma_seg || 0)).catch(() => 0),
        db.manyOrNone(slaQuery, slaParams).catch(() => []),
        db.one(abandonadasQuery, abandonadasParams).then(r => r.count).catch(() => 0),
        db.manyOrNone(volumeQuery, volumeParams).catch(() => []),
      ]);

      res.json({
        kpis: {
          na_fila: naFila,
          em_atendimento: emAndamento,
          concluidos_hoje: concluidosHoje,
          tma_primeira_resposta_seg: tma,
          nao_lidas: naoLidas,
        },
        sla,
        abandonadas,
        volume_por_setor: volume,
      });
    } catch (err) {
      console.error('[API] operacional error:', err.message);
      res.status(500).json({ erro: 'Erro ao buscar dados operacionais' });
    }
  });

  // ===== Agenda de Contatos =====
  app.get('/api/contatos', async (req, res) => {
    try {
      const op = req.operador;
      const { busca } = req.query;
      let query = `SELECT c.*,
                     ult.ultima_conversa_em, ult.departamento_nome, ult.operador_nome,
                     COALESCE(ult.total_atendimentos, 0) AS total_atendimentos
                   FROM contatos c
                   LEFT JOIN LATERAL (
                     SELECT MAX(cv.ultima_mensagem_em) AS ultima_conversa_em,
                            (array_agg(d.nome ORDER BY cv.ultima_mensagem_em DESC))[1] AS departamento_nome,
                            (array_agg(o.nome ORDER BY cv.ultima_mensagem_em DESC))[1] AS operador_nome,
                            COUNT(*)::int AS total_atendimentos
                     FROM conversas cv
                     LEFT JOIN departamentos d ON d.id = cv.departamento_id
                     LEFT JOIN operadores o ON o.id = cv.operador_id
                     WHERE cv.tenant_id = c.tenant_id
                       AND (cv.contato_id = c.id OR cv.contato_id IN (
                         SELECT id FROM contatos WHERE merged_into_id = c.id AND tenant_id = c.tenant_id
                       ))
                   ) ult ON true
                   WHERE c.tenant_id = $1 AND c.deleted_at IS NULL AND c.merged_into_id IS NULL`;
      const params = [op.tenantId];
      if (busca) {
        query += ` AND (c.nome ILIKE $2 OR c.telefone ILIKE $2 OR c.phone_e164 ILIKE $2)`;
        params.push(`%${busca}%`);
      }
      // Ordem alfabética: contatos com nome primeiro (case-insensitive),
      // os sem nome (só número) vão para o fim, ordenados pelo telefone.
      query += ` ORDER BY (c.nome IS NULL OR btrim(c.nome) = '') ASC, lower(c.nome) ASC, c.telefone ASC LIMIT 200`;
      const lista = await db.manyOrNone(query, params);
      res.json(lista.map((p) => protectSensitiveFields(p, hasPermission(op.papel, PERMISSIONS.SENSITIVE_VIEW))));
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar contatos' });
    }
  });

  app.post('/api/contatos', async (req, res) => {
    try {
      const op = req.operador;
      const phone = normalizePhone(req.body.telefone);
      const canal = String(req.body.canal || 'whatsapp').toLowerCase();
      const existente = await db.oneOrNone(
        `SELECT * FROM contatos
         WHERE tenant_id = $1 AND canal = $2 AND phone_e164 = $3
           AND deleted_at IS NULL AND merged_into_id IS NULL`,
        [op.tenantId, canal, phone.phoneE164]
      );
      if (existente) return res.status(409).json({ erro: 'Contato já cadastrado', contato_existente: existente });
      const jid = canal === 'whatsapp' ? `${phone.phoneE164.slice(1)}@s.whatsapp.net` : `${canal}:${phone.phoneE164}`;
      const contato = await db.one(
        `INSERT INTO contatos
           (tenant_id, wa_jid, nome, telefone, canal, phone_e164, phone_display,
            country_code, area_code, local_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          op.tenantId, jid, req.body.nome?.trim() || null, phone.phoneE164,
          canal, phone.phoneE164, phone.phoneDisplay, phone.countryCode,
          phone.areaCode, phone.localNumber,
        ]
      );
      res.status(201).json(contato);
    } catch (err) {
      const status = /Telefone/.test(err.message) ? 400 : err.code === '23505' ? 409 : 500;
      res.status(status).json({ erro: status === 409 ? 'Contato já cadastrado' : err.message || 'Erro ao criar contato' });
    }
  });

  app.post('/api/contatos/:id/mesclar', requirePapel('admin', 'supervisor'), async (req, res) => {
    try {
      const op = req.operador;
      const origemId = req.params.id;
      const destinoId = req.body.destino_id;
      const motivo = String(req.body.motivo || '').trim();
      if (!destinoId || destinoId === origemId) return res.status(400).json({ erro: 'Contato de destino inválido' });
      if (!motivo) return res.status(400).json({ erro: 'Motivo obrigatório' });
      const resultado = await db.tx(async (t) => {
        const contatos = await t.manyOrNone(
          `SELECT * FROM contatos WHERE tenant_id = $1 AND id IN ($2, $3)
           AND deleted_at IS NULL FOR UPDATE`,
          [op.tenantId, origemId, destinoId]
        );
        if (contatos.length !== 2) throw new Error('Contato não encontrado');
        const origem = contatos.find((c) => c.id === origemId);
        const destino = contatos.find((c) => c.id === destinoId);
        if (origem.nome && origem.nome !== destino.nome) {
          await t.none(
            `INSERT INTO contato_nomes_alternativos (tenant_id, contato_id, nome)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [op.tenantId, destinoId, origem.nome]
          );
        }
        await t.none(
          `UPDATE contatos SET merged_into_id = $1, arquivado_em = now()
           WHERE id = $2 AND tenant_id = $3`,
          [destinoId, origemId, op.tenantId]
        );
        await t.none(
          `INSERT INTO contato_merge_eventos
             (tenant_id, contato_origem_id, contato_destino_id, operador_id, motivo)
           VALUES ($1,$2,$3,$4,$5)`,
          [op.tenantId, origemId, destinoId, op.id, motivo]
        );
        await t.none(
          `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id)
           VALUES ($1,$2,'contato.mesclado',$3,'usuario','contato',$4)`,
          [op.tenantId, op.id, { origemId, destinoId, motivo }, destinoId]
        );
        return { ...destino, contatos_mesclados: [origemId] };
      });
      res.json(resultado);
    } catch (err) {
      res.status(/não encontrado/.test(err.message) ? 404 : 409).json({ erro: err.message });
    }
  });

  app.put('/api/contatos/:id', async (req, res) => {
    try {
      const op = req.operador;
      const { nome, telefone, canal = 'whatsapp' } = req.body;
      let phone = null;
      if (telefone !== undefined) phone = normalizePhone(telefone);
      const row = await db.oneOrNone(
        `UPDATE contatos SET
           nome = $1,
           telefone = COALESCE($2, telefone),
           canal = COALESCE($3, canal),
           phone_e164 = COALESCE($4, phone_e164),
           phone_display = COALESCE($5, phone_display),
           country_code = COALESCE($6, country_code),
           area_code = COALESCE($7, area_code),
           local_number = COALESCE($8, local_number)
         WHERE id = $9 AND tenant_id = $10 AND deleted_at IS NULL
         RETURNING *`,
        [
          nome || null,
          phone?.phoneE164 || null,
          canal || null,
          phone?.phoneE164 || null,
          phone?.phoneDisplay || null,
          phone?.countryCode || null,
          phone?.areaCode || null,
          phone?.localNumber || null,
          req.params.id,
          op.tenantId,
        ]
      );
      if (!row) return res.status(404).json({ erro: 'Contato não encontrado' });
      res.json(row);
    } catch (err) {
      const status = /Telefone/.test(err.message) ? 400 : err.code === '23505' ? 409 : 500;
      res.status(status).json({ erro: status === 409 ? 'Já existe um contato com este telefone e canal' : err.message || 'Erro ao atualizar contato' });
    }
  });

  app.delete('/api/contatos/:id', async (req, res) => {
    try {
      const op = req.operador;
      const motivo = String(req.body?.motivo || 'Exclusão solicitada pelo operador').trim();
      const row = await db.oneOrNone(
        `UPDATE contatos SET deleted_at = now()
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
         RETURNING id, nome, telefone`,
        [req.params.id, op.tenantId]
      );
      if (!row) return res.status(404).json({ erro: 'Contato não encontrado' });
      await db.none(
        `INSERT INTO auditoria
           (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id, ip, user_agent)
         VALUES ($1, $2, 'CONTATO_EXCLUSAO_LOGICA', $3, 'usuario', 'contato', $4, $5, $6)`,
        [op.tenantId, op.id, JSON.stringify({ motivo }), row.id, req.ip || null, req.get('user-agent') || null]
      );
      res.json({ ok: true, id: row.id });
    } catch (err) {
      console.error('[chatgov] Erro ao excluir contato:', err.message);
      res.status(500).json({ erro: 'Erro ao excluir contato' });
    }
  });

  // ===== Gestão (admin do órgão) =====
  app.post('/api/secretarias', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { nome, cor } = req.body;
      if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
      const sec = await db.one(
        'INSERT INTO secretarias (tenant_id, nome, cor) VALUES ($1, $2, $3) RETURNING *',
        [op.tenantId, nome, cor || '#2563EB']
      );
      res.json(sec);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar secretaria' });
    }
  });

  app.put('/api/secretarias/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { nome, cor } = req.body;
      const sec = await db.oneOrNone(
        'UPDATE secretarias SET nome = COALESCE($1, nome), cor = COALESCE($2, cor) WHERE id = $3 AND tenant_id = $4 RETURNING *',
        [nome || null, cor || null, req.params.id, op.tenantId]
      );
      if (!sec) return res.status(404).json({ erro: 'Secretaria não encontrada' });
      res.json(sec);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao atualizar secretaria' });
    }
  });

  app.delete('/api/secretarias/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none('UPDATE secretarias SET ativo = false WHERE id = $1 AND tenant_id = $2', [req.params.id, op.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir secretaria' });
    }
  });

  app.post('/api/departamentos', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { nome, cor, secretaria_id } = req.body;
      if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
      const dep = await db.one(
        'INSERT INTO departamentos (tenant_id, nome, cor, secretaria_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [op.tenantId, nome, cor || '#2563EB', secretaria_id || null]
      );
      res.json(dep);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar departamento' });
    }
  });

  app.put('/api/departamentos/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { nome, cor, secretaria_id } = req.body;
      const dep = await db.oneOrNone(
        `UPDATE departamentos SET nome = COALESCE($1, nome), cor = COALESCE($2, cor),
                secretaria_id = $3
         WHERE id = $4 AND tenant_id = $5 RETURNING *`,
        [nome || null, cor || null, secretaria_id || null, req.params.id, op.tenantId]
      );
      if (!dep) return res.status(404).json({ erro: 'Departamento não encontrado' });
      res.json(dep);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao atualizar departamento' });
    }
  });

  app.delete('/api/departamentos/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none('UPDATE departamentos SET ativo = false WHERE id = $1 AND tenant_id = $2', [req.params.id, op.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir departamento' });
    }
  });

  // Vincular operador a papel + departamentos
  app.put('/api/operadores/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { papel, departamento_ids } = req.body;
      const alvo = await db.oneOrNone('SELECT id FROM operadores WHERE id = $1 AND tenant_id = $2', [req.params.id, op.tenantId]);
      if (!alvo) return res.status(404).json({ erro: 'Operador não encontrado' });

      const papeisValidos = ['admin', 'supervisor', 'gestor_departamento', 'operador', 'auditor', 'operador_ia'];
      if (papel && !papeisValidos.includes(papel)) {
        return res.status(400).json({ erro: 'Perfil inválido' });
      }
      if (papel) {
        await db.none('UPDATE operadores SET papel = $1 WHERE id = $2', [papel, alvo.id]);
      }
      if (Array.isArray(departamento_ids)) {
        await db.none('DELETE FROM operador_departamentos WHERE operador_id = $1 AND tenant_id = $2', [alvo.id, op.tenantId]);
        for (const depId of [...new Set(departamento_ids)]) {
          await db.none(
            'INSERT INTO operador_departamentos (operador_id, departamento_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [alvo.id, depId, op.tenantId]
          );
        }
      }
      await db.none(
        `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id)
         VALUES ($1,$2,'operador.permissoes.alteradas',$3,'usuario','operador',$4)`,
        [op.tenantId, op.id, { papel: papel || null, departamento_ids: departamento_ids || null }, alvo.id]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] update operador error:', err.message);
      res.status(500).json({ erro: 'Erro ao atualizar operador' });
    }
  });

  // Configurações do órgão (sem expor o token salvo)
  app.get('/api/config', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const cfg = await db.oneOrNone('SELECT * FROM tenant_config WHERE tenant_id = $1', [op.tenantId]);
      const base = cfg || { provider: 'baileys', dias_atendimento: '1,2,3,4,5', fora_horario_ativo: false };
      res.json({
        provider: base.provider || 'baileys',
        wa_api_phone_id: base.wa_api_phone_id || '',
        wa_api_business_id: base.wa_api_business_id || '',
        wa_api_verify_token: base.wa_api_verify_token || '',
        wa_api_token_set: !!base.wa_api_token,
        saudacao: base.saudacao || '',
        mensagem_ausencia: base.mensagem_ausencia || '',
        horario_inicio: base.horario_inicio || '',
        horario_fim: base.horario_fim || '',
        dias_atendimento: base.dias_atendimento || '1,2,3,4,5',
        fora_horario_ativo: !!base.fora_horario_ativo,
        assinatura_ativa: base.assinatura_ativa !== false,
        assinatura_modo: base.assinatura_modo || 'completo',
      });
    } catch (err) {
      console.error('[API] get config error:', err.message);
      res.status(500).json({ erro: 'Erro ao buscar configurações' });
    }
  });

  app.put('/api/config', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const b = req.body || {};
      // Token só é regravado quando enviado (não vem no GET).
      const tokenEnc = b.wa_api_token ? encrypt(b.wa_api_token) : undefined;
      await db.none(
        `INSERT INTO tenant_config
           (tenant_id, provider, wa_api_phone_id, wa_api_business_id, wa_api_verify_token,
            wa_api_token, saudacao, mensagem_ausencia, horario_inicio, horario_fim,
            dias_atendimento, fora_horario_ativo, assinatura_ativa, assinatura_modo, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         ON CONFLICT (tenant_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           wa_api_phone_id = EXCLUDED.wa_api_phone_id,
           wa_api_business_id = EXCLUDED.wa_api_business_id,
           wa_api_verify_token = EXCLUDED.wa_api_verify_token,
           wa_api_token = COALESCE($6, tenant_config.wa_api_token),
           saudacao = EXCLUDED.saudacao,
           mensagem_ausencia = EXCLUDED.mensagem_ausencia,
           horario_inicio = EXCLUDED.horario_inicio,
           horario_fim = EXCLUDED.horario_fim,
           dias_atendimento = EXCLUDED.dias_atendimento,
           fora_horario_ativo = EXCLUDED.fora_horario_ativo,
           assinatura_ativa = EXCLUDED.assinatura_ativa,
           assinatura_modo = EXCLUDED.assinatura_modo,
           atualizado_em = now()`,
        [
          op.tenantId, b.provider || 'baileys', b.wa_api_phone_id || null, b.wa_api_business_id || null,
          b.wa_api_verify_token || null, tokenEnc || null, b.saudacao || null, b.mensagem_ausencia || null,
          b.horario_inicio || null, b.horario_fim || null, b.dias_atendimento || '1,2,3,4,5',
          b.fora_horario_ativo === true,
          b.assinatura_ativa !== false,
          b.assinatura_modo === 'primeiro' ? 'primeiro' : 'completo',
        ]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] put config error:', err.message);
      res.status(500).json({ erro: 'Erro ao salvar configurações' });
    }
  });

  // Bloqueios
  app.get('/api/bloqueios', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const lista = await db.manyOrNone(
        `SELECT b.*, o.nome AS bloqueado_por_nome FROM contatos_bloqueados b
         LEFT JOIN operadores o ON o.id = b.bloqueado_por
         WHERE b.tenant_id = $1 ORDER BY b.criado_em DESC`,
        [op.tenantId]
      );
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar bloqueios' });
    }
  });

  app.post('/api/bloqueios', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const phone = normalizePhone(req.body.telefone);
      const telefone = phone.phoneE164.slice(1);
      const row = await db.one(
        `INSERT INTO contatos_bloqueados
           (tenant_id, telefone, phone_e164, motivo, bloqueado_por, ativo, expira_em)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (tenant_id, telefone) DO UPDATE SET
           phone_e164 = EXCLUDED.phone_e164, motivo = EXCLUDED.motivo,
           bloqueado_por = EXCLUDED.bloqueado_por, ativo = true,
           expira_em = EXCLUDED.expira_em, desbloqueado_em = NULL, desbloqueado_por = NULL
         RETURNING *`,
        [op.tenantId, telefone, phone.phoneE164, req.body.motivo || null, op.id, req.body.expira_em || null]
      );
      res.json(row);
    } catch (err) {
      res.status(/Telefone/.test(err.message) ? 400 : 500).json({ erro: err.message || 'Erro ao bloquear contato' });
    }
  });

  app.delete('/api/bloqueios/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none(
        `UPDATE contatos_bloqueados SET ativo = false, desbloqueado_em = now(), desbloqueado_por = $1
         WHERE id = $2 AND tenant_id = $3`,
        [op.id, req.params.id, op.tenantId]
      );
      await db.none(
        `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id)
         VALUES ($1,$2,'contato.desbloqueado',$3,'usuario','bloqueio',$4)`,
        [op.tenantId, op.id, { motivo: req.body?.motivo || null }, req.params.id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao remover bloqueio' });
    }
  });

  app.use('/api/admin', requirePapel('admin'));

  app.post('/api/admin/seed', async (req, res) => {
    try {
      const op = req.operador;
      const { adminEmail } = req.body;

      const tenantId = op.tenantId;

      const dep1 = await db.one(
        "INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1, 'Saúde', '#FF6B6B') ON CONFLICT DO NOTHING RETURNING id",
        [tenantId]
      );
      const dep2 = await db.one(
        "INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1, 'Tributos', '#4ECDC4') ON CONFLICT DO NOTHING RETURNING id",
        [tenantId]
      );
      const dep3 = await db.one(
        "INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1, 'Protocolo', '#45B7D1') ON CONFLICT DO NOTHING RETURNING id",
        [tenantId]
      );
      const dep4 = await db.one(
        "INSERT INTO departamentos (tenant_id, nome, cor) VALUES ($1, 'Obras', '#96CEB4') ON CONFLICT DO NOTHING RETURNING id",
        [tenantId]
      );

      res.json({ ok: true, departamentos: [dep1, dep2, dep3, dep4] });
    } catch (err) {
      console.error('[API] seed error:', err.message);
      res.status(500).json({ erro: 'Erro ao criar dados iniciais' });
    }
  });

  // ===== Chatbot / Automação (imp.md 1.1) =====

  app.get('/api/chatbot/config', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      let cfg = await db.oneOrNone('SELECT * FROM config_chatbot WHERE tenant_id = $1', [op.tenantId]);
      if (!cfg) {
        cfg = {
          ativo: false, mensagem_boas_vindas: '', menu_principal: null,
          usar_keywords: true, usar_faq: true, usar_llm: false,
          threshold_faq: 0.6, llm_provider: 'openai', llm_api_key: '',
          llm_model: 'gpt-4o-mini', llm_system_prompt: '', mensagem_fallback: '',
        };
      }
      res.json({
        ...cfg,
        llm_api_key: cfg.llm_api_key ? '********' : '',
        llm_api_key_set: !!cfg.llm_api_key,
      });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar configuração do chatbot' });
    }
  });

  app.put('/api/chatbot/config', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const b = req.body;
      const llmKey = b.llm_api_key && b.llm_api_key !== '********' ? b.llm_api_key : undefined;

      await db.none(
        `INSERT INTO config_chatbot
          (tenant_id, ativo, mensagem_boas_vindas, menu_principal, usar_keywords, usar_faq, usar_llm,
           threshold_faq, llm_provider, llm_model, llm_system_prompt, mensagem_fallback, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT (tenant_id) DO UPDATE SET
           ativo = EXCLUDED.ativo,
           mensagem_boas_vindas = EXCLUDED.mensagem_boas_vindas,
           menu_principal = EXCLUDED.menu_principal,
           usar_keywords = EXCLUDED.usar_keywords,
           usar_faq = EXCLUDED.usar_faq,
           usar_llm = EXCLUDED.usar_llm,
           threshold_faq = EXCLUDED.threshold_faq,
           llm_provider = EXCLUDED.llm_provider,
           llm_model = EXCLUDED.llm_model,
           llm_system_prompt = EXCLUDED.llm_system_prompt,
           mensagem_fallback = EXCLUDED.mensagem_fallback,
           llm_api_key = COALESCE($13, config_chatbot.llm_api_key),
           atualizado_em = now()`,
        [
          op.tenantId, b.ativo === true, b.mensagem_boas_vindas || null,
          b.menu_principal ? JSON.stringify(b.menu_principal) : null,
          b.usar_keywords !== false, b.usar_faq !== false, b.usar_llm === true,
          b.threshold_faq ?? 0.6, b.llm_provider || 'openai', b.llm_model || 'gpt-4o-mini',
          b.llm_system_prompt || null, b.mensagem_fallback || null, llmKey || null,
        ]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] put chatbot config error:', err.message);
      res.status(500).json({ erro: 'Erro ao salvar configuração do chatbot' });
    }
  });

  // === Palavras-chave ===
  app.get('/api/chatbot/palavras-chave', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const lista = await db.manyOrNone(
        'SELECT * FROM palavras_chave WHERE tenant_id = $1 ORDER BY prioridade DESC',
        [op.tenantId]
      );
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar palavras-chave' });
    }
  });

  app.post('/api/chatbot/palavras-chave', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { palavras, resposta, prioridade, departamento_id } = req.body;
      if (!palavras || !palavras.length || !resposta) {
        return res.status(400).json({ erro: 'Palavras e resposta obrigatórios' });
      }
      const row = await db.one(
        `INSERT INTO palavras_chave (tenant_id, palavras, resposta, prioridade, departamento_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [op.tenantId, palavras, resposta, prioridade || 0, departamento_id || null]
      );
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar palavra-chave' });
    }
  });

  app.put('/api/chatbot/palavras-chave/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { palavras, resposta, prioridade, ativo, departamento_id } = req.body;
      const setClauses = [];
      const values = [];
      let idx = 1;

      if (palavras !== undefined) { setClauses.push(`palavras = $${idx++}`); values.push(palavras); }
      if (resposta !== undefined) { setClauses.push(`resposta = $${idx++}`); values.push(resposta); }
      if (prioridade !== undefined) { setClauses.push(`prioridade = $${idx++}`); values.push(prioridade); }
      if (ativo !== undefined) { setClauses.push(`ativo = $${idx++}`); values.push(ativo); }
      if (departamento_id !== undefined) { setClauses.push(`departamento_id = $${idx++}`); values.push(departamento_id || null); }

      if (!setClauses.length) {
        return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
      }

      values.push(req.params.id, op.tenantId);
      const row = await db.oneOrNone(
        `UPDATE palavras_chave SET ${setClauses.join(', ')}
         WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
        values
      );
      if (!row) return res.status(404).json({ erro: 'Não encontrada' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao atualizar palavra-chave' });
    }
  });

  app.delete('/api/chatbot/palavras-chave/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none('DELETE FROM palavras_chave WHERE id = $1 AND tenant_id = $2', [req.params.id, op.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir palavra-chave' });
    }
  });

  // === FAQ ===
  app.get('/api/chatbot/faqs', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { categoria } = req.query;
      let query = 'SELECT * FROM faqs WHERE tenant_id = $1';
      const params = [op.tenantId];
      if (categoria) {
        query += ' AND categoria = $2';
        params.push(categoria);
      }
      query += ' ORDER BY categoria, criado_em DESC';
      const lista = await db.manyOrNone(query, params);
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar FAQs' });
    }
  });

  app.post('/api/chatbot/faqs', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { pergunta, resposta, categoria } = req.body;
      if (!pergunta || !resposta) {
        return res.status(400).json({ erro: 'Pergunta e resposta obrigatórios' });
      }
      const row = await db.one(
        `INSERT INTO faqs (tenant_id, pergunta, resposta, categoria)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [op.tenantId, pergunta, resposta, categoria || 'Geral']
      );
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar FAQ' });
    }
  });

  app.put('/api/chatbot/faqs/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { pergunta, resposta, categoria, ativo } = req.body;
      const row = await db.oneOrNone(
        `UPDATE faqs SET pergunta = COALESCE($1, pergunta), resposta = COALESCE($2, resposta),
           categoria = COALESCE($3, categoria), ativo = COALESCE($4, ativo)
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [pergunta || null, resposta || null, categoria || null, ativo ?? null, req.params.id, op.tenantId]
      );
      if (!row) return res.status(404).json({ erro: 'Não encontrada' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao atualizar FAQ' });
    }
  });

  app.delete('/api/chatbot/faqs/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none('DELETE FROM faqs WHERE id = $1 AND tenant_id = $2', [req.params.id, op.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir FAQ' });
    }
  });

  // ===== Iris — Assistente IA (DeepSeek) =====
  app.get('/api/iris/config', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const cfg = await irisService.getConfigIris(op.tenantId);
      if (cfg.api_key) {
        cfg.api_key = cfg.api_key.slice(0, 4) + '••••' + cfg.api_key.slice(-4);
      }
      res.json(cfg);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar config da Iris' });
    }
  });

  app.put('/api/iris/config', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const cfg = await irisService.saveConfigIris(op.tenantId, req.body);
      if (cfg.api_key) {
        cfg.api_key = cfg.api_key.slice(0, 4) + '••••' + cfg.api_key.slice(-4);
      }
      res.json(cfg);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao salvar config da Iris' });
    }
  });

  // === Templates de Mensagem (Respostas Rápidas) ===
  app.get('/api/templates', async (req, res) => {
    try {
      const op = req.operador;
      const { categoria } = req.query;
      let query = 'SELECT * FROM templates_mensagem WHERE tenant_id = $1 AND ativo = true';
      const params = [op.tenantId];
      if (categoria) { query += ' AND categoria = $2'; params.push(categoria); }
      query += ' ORDER BY categoria, titulo';
      const lista = await db.manyOrNone(query, params);
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar templates' });
    }
  });

  app.post('/api/templates', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { titulo, conteudo, categoria } = req.body;
      if (!titulo || !conteudo) return res.status(400).json({ erro: 'Título e conteúdo obrigatórios' });
      const row = await db.one(
        `INSERT INTO templates_mensagem (tenant_id, titulo, conteudo, categoria)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [op.tenantId, titulo, conteudo, categoria || 'Geral']
      );
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar template' });
    }
  });

  app.put('/api/templates/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { titulo, conteudo, categoria, ativo } = req.body;
      const row = await db.oneOrNone(
        `UPDATE templates_mensagem SET titulo = COALESCE($1, titulo), conteudo = COALESCE($2, conteudo),
           categoria = COALESCE($3, categoria), ativo = COALESCE($4, ativo)
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [titulo || null, conteudo || null, categoria || null, ativo ?? null, req.params.id, op.tenantId]
      );
      if (!row) return res.status(404).json({ erro: 'Não encontrado' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao atualizar template' });
    }
  });

  app.delete('/api/templates/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none(
        `UPDATE templates_mensagem SET ativo = false, atualizado_em = now()
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, op.tenantId]
      );
      await db.none(
        `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, origem, entidade, entidade_id)
         VALUES ($1,$2,'template.arquivado',$3,'usuario','template',$4)`,
        [op.tenantId, op.id, { motivo: req.body?.motivo || 'Arquivado pelo administrador' }, req.params.id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir template' });
    }
  });

  // === Protocolos (imp.md 1.2) ===
  app.get('/api/protocolos', async (req, res) => {
    try {
      const op = req.operador;
      const { status, departamento_id, busca } = req.query;
      let query = `
        SELECT p.*, c.nome AS contato_nome, c.telefone AS contato_telefone,
               d.nome AS departamento_nome, o.nome AS operador_nome
        FROM protocolos p
        LEFT JOIN contatos c ON c.id = p.contato_id
        LEFT JOIN departamentos d ON d.id = p.departamento_id
        LEFT JOIN operadores o ON o.id = p.operador_id
        WHERE p.tenant_id = $1
      `;
      const params = [op.tenantId];

      if (status) { query += ` AND p.status = $${params.length + 1}`; params.push(status); }
      if (departamento_id) { query += ` AND p.departamento_id = $${params.length + 1}`; params.push(departamento_id); }
      if (busca) { query += ` AND (p.numero ILIKE $${params.length + 1} OR c.nome ILIKE $${params.length + 1} OR c.cpf ILIKE $${params.length + 1})`; params.push(`%${busca}%`); }

      query += ' ORDER BY p.atualizado_em DESC LIMIT 200';
      const lista = await db.manyOrNone(query, params);
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar protocolos' });
    }
  });

  app.get('/api/protocolos/:numero', async (req, res) => {
    try {
      const op = req.operador;
      const proto = await consultarProtocolo(op.tenantId, req.params.numero);
      if (!proto) return res.status(404).json({ erro: 'Protocolo não encontrado' });
      res.json(protectSensitiveFields(proto, hasPermission(op.papel, PERMISSIONS.SENSITIVE_VIEW)));
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao consultar protocolo' });
    }
  });

  app.post('/api/protocolos', requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE), async (req, res) => {
    try {
      const op = req.operador;
      const { conversa_id, contato_id, departamento_id, assunto } = req.body;
      if (!contato_id) return res.status(400).json({ erro: 'contato_id obrigatório' });
      const proto = await gerarProtocolo(
        op.tenantId, conversa_id || null, contato_id,
        departamento_id || null, op.id, assunto || null
      );
      res.json(proto);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao gerar protocolo' });
    }
  });

  app.patch('/api/protocolos/:id/status', requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE), async (req, res) => {
    try {
      const op = req.operador;
      const { status, descricao, justificativa } = req.body;
      if (!status) return res.status(400).json({ erro: 'Status obrigatório' });
      const proto = await transitionProtocol({
        tenantId: op.tenantId,
        protocoloId: req.params.id,
        targetStatus: status,
        operadorId: op.id,
        justificativa: justificativa || descricao || '',
        origem: 'usuario',
        ip: req.ip,
      });
      res.json(proto);
    } catch (err) {
      res.status(/não encontrado/.test(err.message) ? 404 : 409).json({ erro: err.message });
    }
  });

  // === Notas Internas (imp.md 1.5) ===
  app.get('/api/conversas/:id/notas', async (req, res) => {
    try {
      const op = req.operador;
      if (!(await podeVerConversa(op, req.params.id))) {
        return res.status(403).json({ erro: 'Sem acesso' });
      }
      const notas = await db.manyOrNone(
        `SELECT ni.*, o.nome AS operador_nome
         FROM notas_internas ni
         LEFT JOIN operadores o ON o.id = ni.operador_id
         WHERE ni.conversa_id = $1 AND ni.tenant_id = $2
         ORDER BY ni.criado_em DESC`,
        [req.params.id, op.tenantId]
      );
      res.json(notas);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar notas' });
    }
  });

  // === Etiquetas (imp.md 1.5) ===
  app.get('/api/etiquetas', async (req, res) => {
    try {
      const op = req.operador;
      const lista = await db.manyOrNone(
        'SELECT * FROM etiquetas WHERE tenant_id = $1 AND ativo = true ORDER BY nome',
        [op.tenantId]
      );
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar etiquetas' });
    }
  });

  app.post('/api/etiquetas', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { nome, cor } = req.body;
      if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
      const row = await db.one(
        'INSERT INTO etiquetas (tenant_id, nome, cor) VALUES ($1, $2, $3) RETURNING *',
        [op.tenantId, nome, cor || '#6B7280']
      );
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao criar etiqueta' });
    }
  });

  app.delete('/api/etiquetas/:id', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      await db.none('UPDATE etiquetas SET ativo = false WHERE id = $1 AND tenant_id = $2', [req.params.id, op.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao excluir etiqueta' });
    }
  });

  app.get('/api/conversas/:id/etiquetas', async (req, res) => {
    try {
      const op = req.operador;
      const lista = await db.manyOrNone(
        `SELECT e.* FROM etiquetas e
         JOIN conversa_etiquetas ce ON ce.etiqueta_id = e.id
         WHERE ce.conversa_id = $1 AND ce.tenant_id = $2`,
        [req.params.id, op.tenantId]
      );
      res.json(lista);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar etiquetas da conversa' });
    }
  });

  // === Fila com posição (imp.md 1.2) ===
  app.get('/api/fila/posicao/:conversaId', async (req, res) => {
    try {
      const op = req.operador;
      const conv = await db.oneOrNone(
        'SELECT id, departamento_id, criado_em FROM conversas WHERE id = $1 AND tenant_id = $2 AND status = $3',
        [req.params.conversaId, op.tenantId, 'fila']
      );
      if (!conv) return res.json({ posicao: 0, estimativa_minutos: 0 });

      const count = await db.one(
        `SELECT COUNT(*)::int AS posicao FROM conversas
         WHERE tenant_id = $1 AND status = 'fila' AND criado_em <= $2
           AND (departamento_id = $3 OR ($3 IS NULL AND departamento_id IS NULL) OR $3 IS NULL)`,
        [op.tenantId, conv.criado_em, conv.departamento_id]
      );

      const emAndamento = await db.one(
        `SELECT COUNT(*)::int AS total FROM conversas
         WHERE tenant_id = $1 AND status = 'aberta' AND departamento_id = $2`,
        [op.tenantId, conv.departamento_id]
      );

      const tmaHistorico = await db.oneOrNone(
        `SELECT AVG(EXTRACT(EPOCH FROM (fechado_em - aberto_em))/60) AS minutos
         FROM protocolos
         WHERE tenant_id = $1 AND departamento_id = $2 AND fechado_em IS NOT NULL`,
        [op.tenantId, conv.departamento_id]
      );

      const tma = Math.max(tmaHistorico?.minutos || 15, 5);
      const estimativa = Math.round((count.posicao + emAndamento.total) * tma / Math.max(emAndamento.total || 1, 1));

      res.json({ posicao: count.posicao, estimativa_minutos: estimativa });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao calcular posição na fila' });
    }
  });

  // === NPS (imp.md 1.4) ===
  app.post('/api/nps/responder', async (req, res) => {
    try {
      const op = req.operador;
      const { protocolo_id, conversa_id, nota, comentario } = req.body;
      if (!nota || nota < 1 || nota > 10) {
        return res.status(400).json({ erro: 'Nota deve ser entre 1 e 10' });
      }
      const proto = protocolo_id
        ? await db.oneOrNone('SELECT * FROM protocolos WHERE id = $1 AND tenant_id = $2', [protocolo_id, op.tenantId])
        : null;
      const row = await registrarRespostaNPS(
        op.tenantId, protocolo_id || null, conversa_id || null, nota, comentario || null,
        proto?.departamento_id || null, proto?.operador_id || null
      );
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao registrar NPS' });
    }
  });

  app.get('/api/nps', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { inicio, fim } = req.query;
      const resultado = await calcularNPS(op.tenantId, inicio || null, fim || null);
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao calcular NPS' });
    }
  });

  app.get('/api/nps/por-setor', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { inicio, fim } = req.query;
      const resultado = await npsPorSetor(op.tenantId, inicio || null, fim || null);
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar NPS por setor' });
    }
  });

  app.get('/api/nps/por-atendente', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;
      const { inicio, fim } = req.query;
      const resultado = await npsPorAtendente(op.tenantId, inicio || null, fim || null);
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar NPS por atendente' });
    }
  });

  // === LGPD (imp.md 1.6) ===
  app.get('/api/lgpd/consentimento/:contatoId', async (req, res) => {
    try {
      const op = req.operador;
      const consent = await db.oneOrNone(
        'SELECT * FROM consentimentos_lgpd WHERE tenant_id = $1 AND contato_id = $2',
        [op.tenantId, req.params.contatoId]
      );
      res.json(consent || { aceito: false });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao buscar consentimento' });
    }
  });

  app.post('/api/lgpd/consentimento', async (req, res) => {
    try {
      const op = req.operador;
      const { contato_id, aceito } = req.body;
      const row = await db.one(
        `INSERT INTO consentimentos_lgpd (tenant_id, contato_id, aceito, ip, data_aceite)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id, contato_id) DO UPDATE SET aceito = $3, data_aceite = now()
         RETURNING *`,
        [op.tenantId, contato_id, aceito !== false, req.ip || null]
      );
      res.json(row);
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao registrar consentimento' });
    }
  });

  app.post('/api/lgpd/exclusao', async (req, res) => {
    try {
      const op = req.operador;
      const { contato_id } = req.body;
      await db.none(
        'UPDATE consentimentos_lgpd SET data_exclusao = now(), aceito = false WHERE tenant_id = $1 AND contato_id = $2',
        [op.tenantId, contato_id]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao registrar exclusão' });
    }
  });

  // === Dashboard Admin (imp.md Painel Admin) ===
  app.get('/api/admin/dashboard', requirePapel('admin'), async (req, res) => {
    try {
      const op = req.operador;

      const hoje = new Date().toISOString().slice(0, 10);
      const inicioSemana = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [totalHoje, totalSemana, totalMes] = await Promise.all([
        db.one('SELECT COUNT(*)::int AS c FROM conversas WHERE tenant_id = $1 AND criado_em::date = $2', [op.tenantId, hoje]),
        db.one('SELECT COUNT(*)::int AS c FROM conversas WHERE tenant_id = $1 AND criado_em::date >= $2', [op.tenantId, inicioSemana]),
        db.one('SELECT COUNT(*)::int AS c FROM conversas WHERE tenant_id = $1 AND criado_em::date >= $2', [op.tenantId, inicioMes]),
      ]);

      const porStatus = await db.manyOrNone(
        'SELECT status, COUNT(*)::int FROM conversas WHERE tenant_id = $1 GROUP BY status',
        [op.tenantId]
      );

      const nps = await calcularNPS(op.tenantId, inicioMes, null);

      const tmaPorSetor = await db.manyOrNone(
        `SELECT d.nome, AVG(EXTRACT(EPOCH FROM (p.fechado_em - p.aberto_em))/60)::int AS minutos
         FROM protocolos p JOIN departamentos d ON d.id = p.departamento_id
         WHERE p.tenant_id = $1 AND p.fechado_em IS NOT NULL AND p.fechado_em::date >= $2
         GROUP BY d.nome ORDER BY minutos`,
        [op.tenantId, inicioMes]
      );

      const topAssuntos = await db.manyOrNone(
        `SELECT COALESCE(assunto, 'Geral') AS assunto, COUNT(*)::int AS total
         FROM protocolos WHERE tenant_id = $1 AND aberto_em::date >= $2
         GROUP BY assunto ORDER BY total DESC LIMIT 5`,
        [op.tenantId, inicioMes]
      );

      const operadoresOnline = await db.manyOrNone(
        `SELECT o.id, o.nome, o.online, o.status_atendente,
                (SELECT COUNT(*)::int FROM conversa_participantes cp
                 JOIN conversas c ON c.id = cp.conversa_id AND c.status = 'aberta'
                 WHERE cp.operador_id = o.id) AS carga
         FROM operadores o WHERE o.tenant_id = $1 ORDER BY o.online DESC`,
        [op.tenantId]
      );

      res.json({
        total_hoje: totalHoje.c,
        total_semana: totalSemana.c,
        total_mes: totalMes.c,
        por_status: porStatus,
        nps,
        tma_por_setor: tmaPorSetor,
        top_assuntos: topAssuntos,
        operadores_online: operadoresOnline,
      });
    } catch (err) {
      console.error('[API] dashboard error:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar dashboard' });
    }
  });

  // === Relatórios: métricas e séries para o dashboard (admin/supervisor) ===
  app.get('/api/relatorios/metricas', requirePapel('admin', 'supervisor'), async (req, res) => {
    try {
      const op = req.operador;
      const t = op.tenantId;
      const hojeStr = new Date().toISOString().slice(0, 10);
      const fim = String(req.query.fim || hojeStr).slice(0, 10);
      const inicio = String(req.query.inicio || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)).slice(0, 10);
      const { departamento_id, operador_id, status: statusFiltro, canal, comparar } = req.query;

      // Build dynamic WHERE clauses — two variants:
      //   convFilter4 / msgFilter4: for queries with $1=t,$2=inicio,$3=fim (extra params start at $4)
      //   convFilter2 / msgFilter2: for queries with $1=t only (extra params start at $2)
      let convFilter4 = '';
      let msgFilter4 = '';
      let convFilter2 = '';
      let msgFilter2 = '';
      const extraParams4 = [];
      const extraParams2 = [];
      let p4 = 4; // params start after $1(tenant), $2(inicio), $3(fim)
      let p2 = 2; // params start after $1(tenant)

      if (departamento_id) {
        convFilter4 += ` AND departamento_id = $${p4}::uuid`;
        msgFilter4 += ` AND m.conversa_id IN (SELECT id FROM conversas WHERE tenant_id=$1 AND departamento_id=$${p4}::uuid)`;
        convFilter2 += ` AND departamento_id = $${p2}::uuid`;
        msgFilter2 += ` AND m.conversa_id IN (SELECT id FROM conversas WHERE tenant_id=$1 AND departamento_id=$${p2}::uuid)`;
        extraParams4.push(departamento_id);
        extraParams2.push(departamento_id);
        p4++; p2++;
      }
      if (operador_id) {
        convFilter4 += ` AND (c.operador_id = $${p4}::uuid OR EXISTS (SELECT 1 FROM conversa_participantes cp WHERE cp.conversa_id=c.id AND cp.operador_id=$${p4}::uuid))`;
        msgFilter4 += ` AND m.operador_id = $${p4 + 1}::uuid`;
        convFilter2 += ` AND (c.operador_id = $${p2}::uuid OR EXISTS (SELECT 1 FROM conversa_participantes cp WHERE cp.conversa_id=c.id AND cp.operador_id=$${p2}::uuid))`;
        msgFilter2 += ` AND m.operador_id = $${p2 + 1}::uuid`;
        // msgFilter refere-se ao mesmo param (operador_id), mas passamos 2x no array
        extraParams4.push(operador_id);
        extraParams2.push(operador_id);
        p4 += 2; p2 += 2;
      }
      if (statusFiltro) {
        convFilter4 += ` AND c.status = $${p4}`;
        convFilter2 += ` AND c.status = $${p2}`;
        extraParams4.push(statusFiltro);
        extraParams2.push(statusFiltro);
        p4++; p2++;
      }
      if (canal === 'chatbot') {
        const f = ` AND c.operador_id IS NULL`;
        convFilter4 += f;
        convFilter2 += f;
        msgFilter4 += ` AND m.operador_id IS NULL`;
        msgFilter2 += ` AND m.operador_id IS NULL`;
      } else if (canal === 'interno') {
        const f = ` AND FALSE`;
        convFilter4 += f;
        convFilter2 += f;
        msgFilter4 += f;
        msgFilter2 += f;
      }

      const msgExtra4 = [];
      if (departamento_id) {
        msgExtra4.push(departamento_id);
      }
      if (operador_id) {
        msgExtra4.push(operador_id);
        msgExtra4.push(operador_id);
      }
      if (statusFiltro) {
        msgExtra4.push(statusFiltro);
      }
      const msgParams = [t, inicio, fim, ...msgExtra4];

      const convParams = [t, inicio, fim, ...extraParams4];
      // msgParams inclui duplicatas para queries que referenciam operador_id em posições diferentes (conv e msg)
      const allParams = [t, inicio, fim, ...msgExtra4];
      const baseParams = [t, ...extraParams2];

      const [resumo, primeiraResposta, porStatus, porDia, porSetor, porHora, ranking] = await Promise.all([
        db.one(
          `SELECT
             (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND criado_em::date BETWEEN $2 AND $3${convFilter4}) AS criadas,
             (SELECT COUNT(*)::int FROM mensagens m WHERE tenant_id=$1 AND direcao='saida' AND criado_em::date BETWEEN $2 AND $3${msgFilter4}) AS enviadas,
             (SELECT COUNT(*)::int FROM mensagens m WHERE tenant_id=$1 AND direcao='entrada' AND criado_em::date BETWEEN $2 AND $3${msgFilter4}) AS recebidas,
             (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND status='aberta'${convFilter4}) AS em_aberto,
             (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND status='fila'${convFilter4}) AS na_fila,
             (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND status IN ('resolvida','arquivada') AND criado_em::date BETWEEN $2 AND $3${convFilter4}) AS resolvidas_periodo`,
          allParams
        ),
        db.oneOrNone(
          `SELECT AVG(EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)))::int AS seg
           FROM (
             SELECT conversa_id,
               MIN(criado_em) FILTER (WHERE direcao='entrada') AS primeira_entrada,
               MIN(criado_em) FILTER (WHERE direcao='saida')   AS primeira_saida
             FROM mensagens m
             WHERE tenant_id=$1 AND criado_em::date BETWEEN $2 AND $3${msgFilter4}
             GROUP BY conversa_id
           ) q
           WHERE primeira_entrada IS NOT NULL AND primeira_saida IS NOT NULL AND primeira_saida > primeira_entrada`,
          allParams
        ),
        db.manyOrNone(`SELECT status, COUNT(*)::int AS total FROM conversas WHERE tenant_id=$1${convFilter2} GROUP BY status`, baseParams),
        db.manyOrNone(
          `SELECT to_char(d.dia,'YYYY-MM-DD') AS dia, COALESCE(c.total,0)::int AS total
           FROM generate_series($2::date, $3::date, interval '1 day') d(dia)
           LEFT JOIN (
             SELECT criado_em::date AS dia, COUNT(*)::int AS total
             FROM conversas WHERE tenant_id=$1 AND criado_em::date BETWEEN $2 AND $3${convFilter4}
             GROUP BY criado_em::date
           ) c ON c.dia = d.dia
           ORDER BY d.dia`,
          convParams
        ),
        db.manyOrNone(
          `SELECT COALESCE(dp.nome,'Sem setor') AS nome, COUNT(*)::int AS total
           FROM conversas c LEFT JOIN departamentos dp ON dp.id=c.departamento_id
           WHERE c.tenant_id=$1 AND c.criado_em::date BETWEEN $2 AND $3${convFilter4}
           GROUP BY dp.nome ORDER BY total DESC LIMIT 10`,
          convParams
        ),
        db.manyOrNone(
          `SELECT EXTRACT(HOUR FROM (criado_em AT TIME ZONE 'America/Sao_Paulo'))::int AS hora, COUNT(*)::int AS total
           FROM mensagens m WHERE tenant_id=$1 AND direcao='entrada' AND criado_em::date BETWEEN $2 AND $3${msgFilter4}
           GROUP BY hora ORDER BY hora`,
          allParams
        ),
        db.manyOrNone(
          `SELECT o.nome,
                  COUNT(*) FILTER (WHERE m.direcao='saida')::int AS enviadas,
                  COUNT(DISTINCT m.conversa_id)::int AS conversas
           FROM mensagens m JOIN operadores o ON o.id=m.operador_id
           WHERE m.tenant_id=$1 AND m.operador_id IS NOT NULL AND m.criado_em::date BETWEEN $2 AND $3${msgFilter4}
           GROUP BY o.id, o.nome ORDER BY enviadas DESC LIMIT 10`,
          allParams
        ),
      ]);

      let nps = null;
      try { nps = await calcularNPS(t, inicio, fim); } catch (e) { /* NPS opcional */ }

      const resumoData = {
        criadas: resumo.criadas,
        enviadas: resumo.enviadas,
        recebidas: resumo.recebidas,
        em_aberto: resumo.em_aberto,
        na_fila: resumo.na_fila,
        resolvidas_periodo: resumo.resolvidas_periodo,
        taxa_resolucao: resumo.criadas > 0 ? Math.round((resumo.resolvidas_periodo / resumo.criadas) * 100) : 0,
        tempo_primeira_resposta_seg: primeiraResposta?.seg || 0,
      };

      let comparacao = null;
      if (comparar === 'true') {
        const diffMs = new Date(fim).getTime() - new Date(inicio).getTime();
        const diffDias = Math.ceil(diffMs / 86400000) + 1;
        const fimAntDate = new Date(new Date(inicio).getTime() - 86400000);
        const inicioAntDate = new Date(fimAntDate.getTime() - (diffDias - 1) * 86400000);
        const inicioAnt = inicioAntDate.toISOString().slice(0, 10);
        const fimAnt = fimAntDate.toISOString().slice(0, 10);

        try {
          const allParamsAnt = [t, inicioAnt, fimAnt, ...msgExtra4];
          const [resumoAnt, primeiraRespAnt] = await Promise.all([
            db.one(
              `SELECT
                 (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND criado_em::date BETWEEN $2 AND $3${convFilter4}) AS criadas,
                 (SELECT COUNT(*)::int FROM mensagens m WHERE tenant_id=$1 AND direcao='saida' AND criado_em::date BETWEEN $2 AND $3${msgFilter4}) AS enviadas,
                 (SELECT COUNT(*)::int FROM mensagens m WHERE tenant_id=$1 AND direcao='entrada' AND criado_em::date BETWEEN $2 AND $3${msgFilter4}) AS recebidas,
                 (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND status='aberta'${convFilter4}) AS em_aberto,
                 (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND status='fila'${convFilter4}) AS na_fila,
                 (SELECT COUNT(*)::int FROM conversas WHERE tenant_id=$1 AND status IN ('resolvida','arquivada') AND criado_em::date BETWEEN $2 AND $3${convFilter4}) AS resolvidas_periodo`,
              allParamsAnt
            ),
            db.oneOrNone(
              `SELECT AVG(EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)))::int AS seg
               FROM (
                 SELECT conversa_id,
                   MIN(criado_em) FILTER (WHERE direcao='entrada') AS primeira_entrada,
                   MIN(criado_em) FILTER (WHERE direcao='saida')   AS primeira_saida
                 FROM mensagens m
                 WHERE tenant_id=$1 AND criado_em::date BETWEEN $2 AND $3${msgFilter4}
                 GROUP BY conversa_id
               ) q
               WHERE primeira_entrada IS NOT NULL AND primeira_saida IS NOT NULL AND primeira_saida > primeira_entrada`,
              allParamsAnt
            ),
          ]);

          const taxaAnt = resumoAnt.criadas > 0 ? Math.round((resumoAnt.resolvidas_periodo / resumoAnt.criadas) * 100) : 0;
          const pct = (atual, ant) => ant > 0 ? Math.round(((atual - ant) / ant) * 100) : (atual > 0 ? 100 : 0);

          comparacao = {
            periodo: { inicio: inicioAnt, fim: fimAnt },
            criadas: resumoAnt.criadas,
            enviadas: resumoAnt.enviadas,
            recebidas: resumoAnt.recebidas,
            em_aberto: resumoAnt.em_aberto,
            na_fila: resumoAnt.na_fila,
            resolvidas_periodo: resumoAnt.resolvidas_periodo,
            taxa_resolucao: taxaAnt,
            tempo_primeira_resposta_seg: primeiraRespAnt?.seg || 0,
            delta_criadas: pct(resumoData.criadas, resumoAnt.criadas),
            delta_recebidas: pct(resumoData.recebidas, resumoAnt.recebidas),
            delta_enviadas: pct(resumoData.enviadas, resumoAnt.enviadas),
            delta_taxa_resolucao: pct(resumoData.taxa_resolucao, taxaAnt),
            delta_tempo_resposta: resumoAnt.criadas > 0
              ? pct(resumoData.tempo_primeira_resposta_seg, resumoAnt.tempo_primeira_resposta_seg || 1)
              : 0,
          };
        } catch (e) {
          console.error('[API] comparacao error:', e.message);
        }
      }

      res.json({
        periodo: { inicio, fim },
        resumo: resumoData,
        por_status: porStatus,
        por_dia: porDia,
        por_setor: porSetor,
        por_hora: porHora,
        ranking_atendentes: ranking,
        nps,
        comparacao,
      });
    } catch (err) {
      console.error('[API] relatorios metricas error:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar relatórios' });
    }
  });

  app.post('/api/relatorios/exportacoes', requirePermission(PERMISSIONS.EXPORT), async (req, res) => {
    try {
      const op = req.operador;
      const formato = String(req.body.formato || '').toLowerCase();
      if (!['csv', 'xlsx', 'pdf', 'impressao'].includes(formato)) {
        return res.status(400).json({ erro: 'Formato de exportação inválido' });
      }
      await db.none(
        `INSERT INTO auditoria
           (tenant_id, operador_id, acao, detalhe, origem, entidade, ip, user_agent)
         VALUES ($1,$2,'relatorio.exportado',$3,'usuario','relatorio',$4,$5)`,
        [
          op.tenantId, op.id,
          { formato, filtros: req.body.filtros || {}, periodo: req.body.periodo || null },
          req.ip || null, req.get('user-agent') || null,
        ]
      );
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao registrar exportação' });
    }
  });

  // === Relatórios: NPS detalhado (admin/supervisor) ===
  app.get('/api/relatorios/nps-detalhado', requirePapel('admin', 'supervisor'), async (req, res) => {
    try {
      const t = req.operador.tenantId;
      const hojeStr = new Date().toISOString().slice(0, 10);
      const fim = String(req.query.fim || hojeStr).slice(0, 10);
      const inicio = String(req.query.inicio || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)).slice(0, 10);

      const [geral, por_setor, por_atendente] = await Promise.all([
        calcularNPS(t, inicio, fim),
        npsPorSetor(t, inicio, fim),
        npsPorAtendente(t, inicio, fim),
      ]);

      res.json({ geral, por_setor, por_atendente });
    } catch (err) {
      console.error('[API] nps-detalhado error:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar NPS detalhado' });
    }
  });

  // === Relatórios: SLA (admin/supervisor) ===
  app.get('/api/relatorios/sla', requirePapel('admin', 'supervisor'), async (req, res) => {
    try {
      const t = req.operador.tenantId;
      const hojeStr = new Date().toISOString().slice(0, 10);
      const fim = String(req.query.fim || hojeStr).slice(0, 10);
      const inicio = String(req.query.inicio || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)).slice(0, 10);
      const { departamento_id } = req.query;

      let deptoFilter = '';
      const slaParams = [t, inicio, fim];
      if (departamento_id) {
        deptoFilter = ' AND c.departamento_id = $4::uuid';
        slaParams.push(departamento_id);
      }

      const [tmaGeral, tmaSetor, abandono, p95Resp, distTempo] = await Promise.all([
        db.oneOrNone(
          `SELECT EXTRACT(EPOCH FROM AVG(ultima_mensagem_em - criado_em))::int AS seg
           FROM conversas c
           WHERE c.tenant_id=$1 AND c.status IN ('resolvida','arquivada')
             AND c.ultima_mensagem_em IS NOT NULL
             AND c.criado_em::date BETWEEN $2 AND $3${deptoFilter}`,
          slaParams
        ),
        db.manyOrNone(
          `SELECT COALESCE(d.nome,'Sem setor') AS nome,
                  EXTRACT(EPOCH FROM AVG(c.ultima_mensagem_em - c.criado_em))::int AS tma_seg,
                  COUNT(*)::int AS conversas
           FROM conversas c LEFT JOIN departamentos d ON d.id=c.departamento_id
           WHERE c.tenant_id=$1 AND c.status IN ('resolvida','arquivada')
             AND c.ultima_mensagem_em IS NOT NULL
             AND c.criado_em::date BETWEEN $2 AND $3${deptoFilter}
           GROUP BY d.nome ORDER BY conversas DESC`,
          slaParams
        ),
        db.one(
          `SELECT ROUND(
             COUNT(*) FILTER (WHERE c.status='fila' AND c.criado_em < now() - interval '30 minutes')
               * 100.0 / GREATEST(COUNT(*), 1), 1
           ) AS pct
           FROM conversas c
           WHERE c.tenant_id=$1 AND c.criado_em::date BETWEEN $2 AND $3${deptoFilter}`,
          slaParams
        ),
        db.oneOrNone(
          `SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY primeira_saida - primeira_entrada)::int AS seg
           FROM (
             SELECT MIN(criado_em) FILTER (WHERE direcao='entrada') AS primeira_entrada,
                    MIN(criado_em) FILTER (WHERE direcao='saida')   AS primeira_saida
             FROM mensagens m
             WHERE m.tenant_id=$1 AND m.criado_em::date BETWEEN $2 AND $3
             GROUP BY m.conversa_id
           ) q
           WHERE primeira_entrada IS NOT NULL AND primeira_saida IS NOT NULL AND primeira_saida > primeira_entrada`,
          [t, inicio, fim]
        ),
        db.manyOrNone(
          `SELECT faixa, COUNT(*)::int AS total FROM (
             SELECT CASE
               WHEN EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)) <= 30 THEN '0-30s'
               WHEN EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)) <= 60 THEN '30s-1min'
               WHEN EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)) <= 300 THEN '1min-5min'
               WHEN EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)) <= 900 THEN '5min-15min'
               WHEN EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)) <= 1800 THEN '15min-30min'
               WHEN EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)) <= 3600 THEN '30min-1h'
               ELSE '1h+'
             END AS faixa
             FROM (
               SELECT MIN(criado_em) FILTER (WHERE direcao='entrada') AS primeira_entrada,
                      MIN(criado_em) FILTER (WHERE direcao='saida')   AS primeira_saida
               FROM mensagens m
               WHERE m.tenant_id=$1 AND m.criado_em::date BETWEEN $2 AND $3
               GROUP BY m.conversa_id
             ) q
             WHERE primeira_entrada IS NOT NULL AND primeira_saida IS NOT NULL AND primeira_saida > primeira_entrada
           ) sub
           GROUP BY faixa ORDER BY MIN(EXTRACT(EPOCH FROM (primeira_saida - primeira_entrada)))`,
          [t, inicio, fim]
        ),
      ]);

      const faixasOrdem = ['0-30s', '30s-1min', '1min-5min', '5min-15min', '15min-30min', '30min-1h', '1h+'];
      const distribuicao_tempo = faixasOrdem.map(f => {
        const found = (distTempo || []).find(d => d.faixa === f);
        return { faixa: f, total: found ? found.total : 0 };
      });

      res.json({
        tma_geral_seg: tmaGeral?.seg || 0,
        tma_por_setor: tmaSetor,
        taxa_abandono: parseFloat(abandono?.pct) || 0,
        p95_resposta_seg: p95Resp?.seg || 0,
        distribuicao_tempo,
      });
    } catch (err) {
      console.error('[API] sla error:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar SLA' });
    }
  });

  // === Relatórios: Conversas por assunto (admin/supervisor) ===
  app.get('/api/relatorios/conversas-por-assunto', requirePapel('admin', 'supervisor'), async (req, res) => {
    try {
      const t = req.operador.tenantId;
      const hojeStr = new Date().toISOString().slice(0, 10);
      const fim = String(req.query.fim || hojeStr).slice(0, 10);
      const inicio = String(req.query.inicio || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)).slice(0, 10);

      const assuntos = await db.manyOrNone(
        `SELECT COALESCE(d.nome, 'Sem setor') AS assunto, COUNT(*)::int AS total
         FROM conversas c
         LEFT JOIN departamentos d ON d.id = c.departamento_id
         WHERE c.tenant_id = $1 AND c.criado_em::date BETWEEN $2 AND $3
         GROUP BY d.nome
         ORDER BY total DESC`,
        [t, inicio, fim]
      );

      res.json({ assuntos });
    } catch (err) {
      console.error('[API] conversas-por-assunto error:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar conversas por assunto' });
    }
  });

  // === Relatórios: Filtros disponíveis (admin/supervisor) ===
  app.get('/api/relatorios/filtros', requirePapel('admin', 'supervisor'), async (req, res) => {
    try {
      const t = req.operador.tenantId;

      const [departamentos, operadores] = await Promise.all([
        db.manyOrNone(
          `SELECT id, nome FROM departamentos WHERE tenant_id = $1 AND ativo = true ORDER BY nome`,
          [t]
        ),
        db.manyOrNone(
          `SELECT id, nome FROM operadores WHERE tenant_id = $1 AND papel IN ('operador','supervisor') ORDER BY nome`,
          [t]
        ),
      ]);

      res.json({
        departamentos,
        operadores,
        status: ['fila', 'aberta', 'resolvida', 'arquivada'],
        canais: ['whatsapp', 'interno', 'chatbot'],
      });
    } catch (err) {
      console.error('[API] filtros error:', err.message);
      res.status(500).json({ erro: 'Erro ao carregar filtros' });
    }
  });

  // === Busca avançada (imp.md 1.5) ===
  app.get('/api/conversas/busca', async (req, res) => {
    try {
      const op = req.operador;
      const { q } = req.query;
      if (!q || q.length < 2) return res.json([]);

      const results = await db.manyOrNone(
        `SELECT c.*, co.nome AS contato_nome, co.telefone AS contato_telefone, co.cpf,
                d.nome AS departamento_nome, p.numero AS protocolo_numero
         FROM conversas c
         JOIN contatos co ON co.id = c.contato_id
         LEFT JOIN departamentos d ON d.id = c.departamento_id
         LEFT JOIN protocolos p ON p.conversa_id = c.id
         WHERE c.tenant_id = $1
           AND (co.nome ILIKE $2 OR co.telefone ILIKE $2 OR co.cpf ILIKE $2 OR p.numero ILIKE $2)
         ORDER BY c.ultima_mensagem_em DESC NULLS LAST LIMIT 20`,
        [op.tenantId, `%${q}%`]
      );
      res.json(results.map((item) => protectSensitiveFields(item, hasPermission(op.papel, PERMISSIONS.SENSITIVE_VIEW))));
    } catch (err) {
      res.status(500).json({ erro: 'Erro na busca' });
    }
  });

  const io = iniciarGateway(server, wa, storage);

  server.listen(config.port, async () => {
    console.log(`[ChatGov] Server running on port ${config.port}`);

    try {
      await wa.restaurarSessoes();
      console.log('[ChatGov] WhatsApp sessions restored');
    } catch (err) {
      console.error('[ChatGov] Failed to restore WhatsApp sessions:', err.message);
    }

    iniciarLimpezaConversas(storage);
  });

  process.on('SIGTERM', async () => {
    console.log('[ChatGov] Shutting down...');
    for (const [tenantId] of wa.sessions) {
      try { await wa._cleanupSession(tenantId); } catch {}
    }
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[ChatGov] Fatal error:', err);
  process.exit(1);
});
