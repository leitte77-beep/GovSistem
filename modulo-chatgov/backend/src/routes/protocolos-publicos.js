import express from 'express';
import db from '../db.js';
import { setTenantContext } from '../db.js';
import { uploadUnico, UploadInvalido, salvarArquivoProtocolo, obterArquivoDocumento } from '../services/upload-protocolo.js';
import {
  validarCredencial, criarSessaoPublica, validarSessaoPublica,
  consultarProtocoloDetalhado, enviarMensagemPublica,
  registrarDocumento, listarDocumentosProtocolo,
  gerarCredencialAcesso, enfileirarNotificacao, documentoVisivelAoCidadao,
  resolverProtocoloPorNumero,
} from '../services/protocolo-v2.js';
import { buscarOuCriarCidadao, criarContaCidadao, buscarContaPorEmail, autenticarCidadao, listarProtocolosDoCidadao, gerarTokenRecuperacaoSenha, redefinirSenhaComToken } from '../services/cidadao.js';
import { config } from '../config.js';

const PORTAL_URL = config.portalUrl;

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate limiter específico para rotas públicas
const tentativasPorIp = new Map();

function rateLimiterPublico(maxTentativas = 10, janelaMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const chave = `${ip}:${req.path}`;
    const agora = Date.now();

    if (!tentativasPorIp.has(chave)) {
      tentativasPorIp.set(chave, { count: 1, resetAt: agora + janelaMs });
      return next();
    }

    const entry = tentativasPorIp.get(chave);
    if (agora > entry.resetAt) {
      tentativasPorIp.set(chave, { count: 1, resetAt: agora + janelaMs });
      return next();
    }

    entry.count++;
    if (entry.count > maxTentativas) {
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde um momento.' });
    }

    next();
  };
}

// O portal é compartilhado por vários tenants. A ordem de decisão é:
// 1) órgão escolhido explicitamente pelo cidadão (body/query `tenant`);
// 2) subdomínio (farol.govsistem…);
// 3) primeiro tenant ativo.
// O passo 1 é o que faz a conta nascer no município que o cidadão escolheu:
// em prot.govsistem.com.br o subdomínio não identifica órgão nenhum, e sem
// ele toda conta caía no fallback — depois nenhum serviço do órgão escolhido
// era encontrado na hora de abrir o protocolo.
async function resolverTenantId(req) {
  const slugEscolhido = String(req.body?.tenant || req.query?.tenant || '').trim();
  if (slugEscolhido) {
    const tenant = await db.oneOrNone(
      'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [slugEscolhido]
    );
    if (tenant) return tenant.id;
  }

  const host = req.get('host') || '';
  const subdomain = host.split('.')[0];

  if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
    const tenant = await db.oneOrNone(
      'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [subdomain]
    );
    if (tenant) return tenant.id;
  }

  const tenant = await db.oneOrNone(
    'SELECT id FROM tenants WHERE ativo = true ORDER BY criado_em LIMIT 1'
  );
  return tenant?.id || null;
}

// Recuperação de senha não tem sessão nem seletor de órgão: acha o tenant
// pelo e-mail cadastrado, entre os ativos, em vez de assumir o do fallback.
async function tenantDaContaPorEmail(req, email) {
  const slugEscolhido = String(req.body?.tenant || '').trim();
  const host = req.get('host') || '';
  const subdomain = host.split('.')[0];
  const preferido = slugEscolhido
    || (subdomain && subdomain !== 'prot' && subdomain !== 'www' ? subdomain : '');

  const candidatos = await db.manyOrNone(
    `SELECT id FROM tenants WHERE ativo = true
      ORDER BY (slug = $1) DESC, criado_em`,
    [preferido || null]
  );

  for (const t of candidatos) {
    const conta = await buscarContaPorEmail(t.id, String(email).trim().toLowerCase());
    if (conta) return t.id;
  }
  return resolverTenantId(req);
}

// Limpeza periódica do rate limiter
setInterval(() => {
  const agora = Date.now();
  for (const [chave, entry] of tentativasPorIp) {
    if (agora > entry.resetAt) tentativasPorIp.delete(chave);
  }
}, 300000);

// ─── Acesso por número + senha ───────────────────────────────
router.post('/protocols/access', rateLimiterPublico(10, 60000), async (req, res) => {
  try {
    const { numero, senha } = req.body;
    if (!numero || !senha) {
      return res.status(400).json({ erro: 'Número do protocolo e senha são obrigatórios' });
    }

    // Resolve o tenant pelo domínio (host header) ou usa fallback
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];

    let tenant = null;
    if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
      tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE slug = $1 AND ativo = true',
        [subdomain]
      );
    }

    // O número é sequencial por município, então pode existir em mais de um
    // tenant. É o código de acesso que identifica o protocolo correto.
    const resultado = await resolverProtocoloPorNumero(String(numero).trim(), senha, {
      tenantId: tenant?.id || null,
    });

    if (!resultado.valido) {
      const msg = resultado.motivo === 'bloqueado'
        ? 'Acesso bloqueado temporariamente. Aguarde alguns minutos.'
        : 'Protocolo ou código de acesso inválido';
      // Mensagem genérica: não revela se o número existe.
      return res.status(401).json({ erro: msg });
    }

    const sessao = await criarSessaoPublica(
      resultado.tenantId, resultado.protocoloId, null, req.ip,
      req.get('user-agent')
    );

    res.json({
      token: sessao.token,
      protocolo_id: resultado.protocoloId,
      tenant_id: resultado.tenantId,
      expira_em: sessao.expira_em,
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Recuperar acesso ────────────────────────────────────────
router.post('/protocols/recover-access', rateLimiterPublico(5, 300000), async (req, res) => {
  try {
    const { numero, canal } = req.body;
    if (!numero) return res.status(400).json({ erro: 'Número do protocolo obrigatório' });

    const respostaGenerica = {
      ok: true,
      mensagem: 'Se o protocolo existir, as instruções de recuperação serão enviadas.',
    };

    // O mesmo número pode existir em vários municípios: recupera o acesso de
    // todos os que casam, sempre enviando ao contato já cadastrado (nunca a
    // um destino informado na requisição).
    const candidatos = await db.manyOrNone(
      `SELECT p.id, p.tenant_id, p.numero,
              COALESCE(cid.nome_social, cid.nome, co.nome) AS nome,
              COALESCE(cid.telefone, co.telefone) AS telefone,
              COALESCE(cid.email, co.email) AS email
       FROM protocolos p
       LEFT JOIN cidadaos cid ON cid.id = p.cidadao_id
       LEFT JOIN contatos co ON co.id = p.contato_id
       JOIN tenants t ON t.id = p.tenant_id AND t.ativo = true
       WHERE p.numero = $1 AND p.deleted_at IS NULL AND p.externo = true`,
      [String(numero).trim()]
    );

    if (candidatos.length === 0) return res.json(respostaGenerica);

    for (const proto of candidatos) {
      const destino = canal === 'email' ? proto.email : proto.telefone;
      if (!destino) continue;

      // Só emite nova credencial quando há para onde enviá-la.
      const senha = await gerarCredencialAcesso(proto.tenant_id, proto.id);
      await enfileirarNotificacao(proto.tenant_id, proto.id, {
        canal: canal === 'email' ? 'email' : 'whatsapp',
        destinatario: destino,
        assunto: `Recuperação de acesso - Protocolo ${proto.numero}`,
        conteudo: `Protocolo: ${proto.numero}\nNovo código de acesso: ${senha}\nConsulta: ${PORTAL_URL}`,
      });
    }

    res.json(respostaGenerica);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Validar sessão ──────────────────────────────────────────
router.get('/protocols/session', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ erro: 'Sessão não fornecida' });

    const sessao = await validarSessaoPublica(null, token);
    if (!sessao) return res.status(401).json({ erro: 'Sessão expirada ou inválida' });

    res.json(sessao);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Middleware de sessão pública ─────────────────────────────
async function sessaoPublicaMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ erro: 'Acesso não autorizado' });

  const sessao = await validarSessaoPublica(null, token);
  if (!sessao) return res.status(401).json({ erro: 'Sessão expirada ou inválida' });

  req.sessaoPublica = sessao;
  req.tenantId = sessao.tenant_id;
  req.protocoloId = sessao.protocolo_id;

  // Configura o tenant context para o RLS funcionar
  await setTenantContext(sessao.tenant_id);

  // Sessão de conta não nasce presa a um protocolo (o cidadão tem vários): o id
  // vem da URL e só vale se o protocolo for dele.
  if (!req.protocoloId && sessao.cidadao_conta_id) {
    const id = req.params.id;
    if (!id || !UUID_RE.test(id)) {
      return res.status(400).json({ erro: 'Protocolo inválido' });
    }
    const permitido = await protocoloDaConta(sessao.tenant_id, sessao.cidadao_conta_id, id);
    if (!permitido) return res.status(404).json({ erro: 'Protocolo não encontrado' });
    req.protocoloId = permitido.id;
  }

  next();
}

// Um protocolo é do cidadão quando aponta para ele direto (`cidadao_id`, caminho
// do portal) ou pelo contato de WhatsApp vinculado (protocolo aberto no chat).
async function protocoloDaConta(tenantId, contaId, protocoloId) {
  return db.oneOrNone(
    `SELECT p.id
       FROM protocolos p
       JOIN cidadao_contas cc ON cc.id = $3 AND cc.tenant_id = $2
       JOIN cidadaos c ON c.id = cc.cidadao_id
      WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL
        AND (p.cidadao_id = c.id OR (c.contato_id IS NOT NULL AND p.contato_id = c.contato_id))`,
    [protocoloId, tenantId, contaId]
  );
}

// Resolve a conta logada a partir do Bearer token das rotas /my/*.
async function contaDaSessao(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  const sessao = await validarSessaoPublica(null, token);
  if (!sessao?.cidadao_conta_id) return null;

  await setTenantContext(sessao.tenant_id);
  const conta = await db.oneOrNone(
    `SELECT cc.id, cc.cidadao_id, cc.email, cc.tenant_id,
            c.nome, c.cpf, c.telefone,
            t.slug AS tenant_slug, t.nome AS tenant_nome
       FROM cidadao_contas cc
       JOIN cidadaos c ON c.id = cc.cidadao_id
       LEFT JOIN tenants t ON t.id = cc.tenant_id
      WHERE cc.id = $1`,
    [sessao.cidadao_conta_id]
  );
  return conta || null;
}

// ─── Detalhes do protocolo (visão pública) ───────────────────
router.get('/protocols/:id', sessaoPublicaMiddleware, async (req, res) => {
  try {
    const proto = await db.oneOrNone(
      `SELECT p.id, p.uuid_publico, p.numero, p.assunto, p.descricao, p.categoria,
              p.origem, p.prioridade, p.status_operacional AS status,
              p.aberto_em, p.resolvido_em, p.prazo_em,
              d.nome AS setor_atual_nome,
              sv.nome AS servico_nome,
              (SELECT json_agg(json_build_object(
                'titulo', pp.titulo, 'descricao', pp.descricao, 'tipo', pp.tipo,
                'prazo_em', pp.prazo_em, 'status', pp.status, 'criado_em', pp.criado_em
              ) ORDER BY pp.criado_em DESC) FROM protocolo_pendencias pp
               WHERE pp.protocolo_id = p.id AND pp.status = 'pendente') AS pendencias
       FROM protocolos p
       LEFT JOIN departamentos d ON d.id = p.setor_atual_id
       LEFT JOIN protocolo_servicos sv ON sv.id = p.servico_id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.externo = true`,
      [req.protocoloId, req.tenantId]
    );
    if (!proto) return res.status(404).json({ erro: 'Protocolo não encontrado' });

    const statusPublico = {
      ABERTO: 'Solicitação recebida',
      EM_ANDAMENTO: 'Em análise',
      PENDENTE: 'Aguardando sua resposta',
      CONCLUIDO: 'Concluída',
      CANCELADO: 'Cancelada',
    };

    res.json({
      ...proto,
      status_publico: statusPublico[proto.status] || proto.status,
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Linha do tempo (visão pública) ──────────────────────────
// Só os eventos marcados como visíveis ao cidadão, sem operador, setor,
// IP ou qualquer detalhe interno da tramitação.
router.get('/protocols/:id/timeline', sessaoPublicaMiddleware, async (req, res) => {
  try {
    const eventos = await db.manyOrNone(
      `SELECT m.tipo, m.observacao, m.criado_em
       FROM protocolo_movimentacoes m
       WHERE m.protocolo_id = $1 AND m.tenant_id = $2 AND m.visivel_cidadao = true
       ORDER BY m.criado_em ASC`,
      [req.protocoloId, req.tenantId]
    );

    const ROTULOS = {
      abertura: 'Solicitação registrada',
      alteracao_status: 'Andamento da solicitação',
      mensagem_enviada: 'Mensagem da prefeitura',
      pendencia_criada: 'Documento ou informação solicitada',
      documento_liberado: 'Documento disponibilizado',
      conclusao: 'Solicitação concluída',
      cancelamento: 'Solicitação cancelada',
      reabertura: 'Solicitação reaberta',
      arquivamento: 'Solicitação arquivada',
    };

    res.json(eventos.map((e) => ({
      titulo: ROTULOS[e.tipo] || 'Andamento',
      descricao: e.observacao,
      data: e.criado_em,
    })));
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Mensagens públicas ──────────────────────────────────────
router.get('/protocols/:id/messages', sessaoPublicaMiddleware, async (req, res) => {
  try {
    const msgs = await db.manyOrNone(
      `SELECT id, direcao, conteudo, tem_anexo, lida, criado_em
       FROM protocolo_mensagens
       WHERE protocolo_id = $1 AND tenant_id = $2
       ORDER BY criado_em ASC`,
      [req.protocoloId, req.tenantId]
    );
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/protocols/:id/messages', sessaoPublicaMiddleware, async (req, res) => {
  try {
    const { conteudo } = req.body;
    if (!conteudo) return res.status(400).json({ erro: 'Conteúdo obrigatório' });

    const msg = await db.one(
      `INSERT INTO protocolo_mensagens
        (tenant_id, protocolo_id, direcao, conteudo)
       VALUES ($1, $2, 'entrada', $3)
       RETURNING *`,
      [req.tenantId, req.protocoloId, conteudo]
    );

    await db.none(
      `UPDATE protocolos SET atualizado_em = now() WHERE id = $1`,
      [req.protocoloId]
    );

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Documentos (visão pública) ──────────────────────────────
router.get('/protocols/:id/documents', sessaoPublicaMiddleware, async (req, res) => {
  try {
    const docs = await listarDocumentosProtocolo(req.tenantId, req.protocoloId, { publicos: true });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/protocols/:id/documents/:docId/download', sessaoPublicaMiddleware, async (req, res) => {
  try {
    const result = await obterArquivoDocumento(req.tenantId, req.params.docId);
    if (!result) return res.status(404).json({ erro: 'Documento não encontrado' });

    if (result.doc.protocolo_id !== req.protocoloId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    // O cidadão só baixa o que foi liberado para ele. Documentos internos
    // ou ainda não liberados respondem 404 para não revelar sua existência.
    if (!documentoVisivelAoCidadao(result.doc)) {
      return res.status(404).json({ erro: 'Documento não encontrado' });
    }

    if (result.doc.expira_em && new Date(result.doc.expira_em) < new Date()) {
      return res.status(410).json({ erro: 'O link deste documento expirou' });
    }

    await db.none(
      `INSERT INTO protocolo_documento_downloads
        (tenant_id, documento_id, baixado_por, ip, user_agent)
       VALUES ($1,$2,'cidadao',$3,$4)`,
      [req.tenantId, req.params.docId, req.ip, req.get('user-agent')]
    );

    res.set('Content-Type', result.doc.mime_type);
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(result.doc.nome_amigavel)}"`);
    res.send(result.buffer);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Upload de documento pelo cidadão ────────────────────────
router.post('/protocols/:id/documents/upload', sessaoPublicaMiddleware, uploadUnico('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

    // Documento enviado pelo cidadão entra como material do próprio cidadão,
    // aguardando análise do setor — não é liberado nem aprovado sozinho.
    const doc = await salvarArquivoProtocolo(
      req.tenantId, req.protocoloId, req.file, null,
      {
        origem: 'cidadao',
        nivelAcesso: 'restrito_cidadao',
        pendenciaId: req.body?.pendencia_id || null,
      }
    );

    await db.none(
      `UPDATE protocolo_documentos SET status = 'em_analise' WHERE id = $1`,
      [doc.id]
    );

    await db.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, observacao)
       VALUES ($1, $2, 'documento_anexado', $3)`,
      [req.tenantId, req.protocoloId, `Documento enviado pelo cidadão: ${doc.nome_amigavel}`]
    ).catch(() => {});

    await db.none(`UPDATE protocolos SET atualizado_em = now() WHERE id = $1`, [req.protocoloId]);

    // Devolve só o que o portal precisa exibir — sem caminho físico nem hash.
    res.status(201).json({
      id: doc.id,
      nome_amigavel: doc.nome_amigavel,
      mime_type: doc.mime_type,
      tamanho_bytes: doc.tamanho_bytes,
      status: 'em_analise',
      criado_em: doc.criado_em,
    });
  } catch (err) {
    if (err instanceof UploadInvalido) {
      return res.status(400).json({ erro: err.message });
    }
    console.error('[POST public documents/upload]', err.message);
    res.status(500).json({ erro: 'Não foi possível enviar o documento.' });
  }
});

// ─── Lista de órgãos/tenants disponíveis ─────────────────────
router.get('/tenants', async (_req, res) => {
  try {
    const tenants = await db.manyOrNone(
      `SELECT t.id, t.slug, t.nome,
              (SELECT COUNT(*)::int FROM protocolo_servicos s
               WHERE s.tenant_id = t.id AND s.ativo = true AND s.disponivel = true) AS total_servicos
       FROM tenants t
       WHERE t.ativo = true
         AND EXISTS (SELECT 1 FROM protocolo_servicos s
                     WHERE s.tenant_id = t.id AND s.ativo = true AND s.disponivel = true)
       ORDER BY t.nome, t.slug`
    );
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Catálogo de serviços ────────────────────────────────────
router.get('/services', async (req, res) => {
  try {
    // Sem tenant o catálogo misturava serviços de todos os municípios, e abrir
    // um deles dava 404 porque a criação filtra por tenant.
    // Aceita ?tenant=slug para o seletor de órgão no portal.
    const tenantSlugParam = String(req.query.tenant || '').trim().toLowerCase();
    let tenantId = null;
    if (tenantSlugParam) {
      const t = await db.oneOrNone('SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [tenantSlugParam]);
      if (t) tenantId = t.id;
    }
    if (!tenantId) tenantId = await resolverTenantId(req);
    if (!tenantId) return res.json([]);

    const servicos = await db.manyOrNone(
      `SELECT s.*, d.nome AS departamento_nome, sec.nome AS secretaria_nome,
              cat.nome AS categoria_nome
       FROM protocolo_servicos s
       LEFT JOIN departamentos d ON d.id = s.departamento_id
       LEFT JOIN secretarias sec ON sec.id = s.secretaria_id
       LEFT JOIN protocolo_categorias cat ON cat.id = s.categoria_id
       WHERE s.disponivel = true AND s.ativo = true AND s.tenant_id = $1
       ORDER BY s.ordem, s.nome`,
      [tenantId]
    );

    res.json(servicos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/services/:id', async (req, res) => {
  try {
    const servico = await db.oneOrNone(
      `SELECT s.*, d.nome AS departamento_nome, sec.nome AS secretaria_nome
       FROM protocolo_servicos s
       LEFT JOIN departamentos d ON d.id = s.departamento_id
       LEFT JOIN secretarias sec ON sec.id = s.secretaria_id
       WHERE s.id = $1 AND s.disponivel = true AND s.ativo = true`,
      [req.params.id]
    );
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });

    const campos = await db.manyOrNone(
      `SELECT * FROM protocolo_servico_campos
       WHERE servico_id = $1
       ORDER BY ordem`,
      [req.params.id]
    );

    res.json({ ...servico, campos });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Criar solicitação pelo portal ───────────────────────────
router.post('/protocols', async (req, res) => {
  try {
    const {
      nome, cpf, telefone, email, servico_id, assunto, descricao,
      campos, documentos, criar_conta, senha_conta,
    } = req.body;

    // Resolve tenant: primeiro pelo slug enviado no corpo (seletor de órgão),
    // depois pelo token da sessão (usuário logado), depois pelo subdomínio.
    let tenantId = null;

    const tenantSlug = String(req.body.tenant_slug || req.body.orgao || '').trim().toLowerCase();
    if (tenantSlug) {
      const tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [tenantSlug]
      );
      if (tenant) tenantId = tenant.id;
    }

    if (!tenantId) {
      const authHeader = req.headers.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearerToken) {
        const sessao = await db.oneOrNone(
          `SELECT tenant_id FROM protocolo_sessoes_acesso
           WHERE token = $1 AND expira_em > now()`,
          [bearerToken]
        );
        if (sessao) tenantId = sessao.tenant_id;
      }
    }

    if (!tenantId) {
      const host = req.get('host') || '';
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
        const tenant = await db.oneOrNone(
          'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [subdomain]
        );
        if (tenant) tenantId = tenant.id;
      }
    }

    if (!tenantId) {
      const tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE ativo = true ORDER BY criado_em LIMIT 1'
      );
      if (tenant) tenantId = tenant.id;
    }
    if (!tenantId) return res.status(500).json({ erro: 'Configuração de tenant não encontrada' });

    if (!nome || !servico_id) {
      return res.status(400).json({ erro: 'Nome e serviço são obrigatórios' });
    }

    const { criarProtocolo, gerarCredencialAcesso, enfileirarNotificacao } = await import('../services/protocolo-v2.js');
    const { buscarOuCriarCidadao, criarContaCidadao } = await import('../services/cidadao.js');

    const cidadao = await buscarOuCriarCidadao(tenantId, {
      nome, cpf, telefone, email,
    });

    const servico = await db.oneOrNone(
      'SELECT * FROM protocolo_servicos WHERE id = $1 AND tenant_id = $2',
      [servico_id, tenantId]
    );

    const proto = await criarProtocolo(tenantId, {
      assunto: assunto || (servico?.nome || 'Solicitação'),
      descricao,
      servicoId: servico_id,
      departamentoId: servico?.departamento_id,
      origem: 'portal',
      externo: true,
      cidadaoId: cidadao.id,
      campos: campos || [],
    });

    if (telefone) {
      try {
        const contato = await db.oneOrNone(
          `SELECT id FROM contatos WHERE tenant_id = $1 AND (telefone = $2 OR phone_e164 = $3)`,
          [tenantId, telefone, telefone]
        );
        if (contato) {
          await db.none(
            `UPDATE protocolos SET contato_id = $1 WHERE id = $2`,
            [contato.id, proto.id]
          );
          await db.none(
            `UPDATE cidadaos SET contato_id = $1 WHERE id = $2`,
            [contato.id, cidadao.id]
          );
        }
      } catch {}
    }

    const senha = await gerarCredencialAcesso(tenantId, proto.id);

    if (telefone) {
      await enfileirarNotificacao(tenantId, proto.id, {
        canal: 'whatsapp',
        destinatario: telefone,
        assunto: 'Solicitação registrada',
        conteudo: `Olá, ${nome}. Sua solicitação foi registrada.\n\nProtocolo: ${proto.numero}\nCódigo de acesso: ${senha}\nConsulta: ${PORTAL_URL}`,
      });
    }

    if (email) {
      await enfileirarNotificacao(tenantId, proto.id, {
        canal: 'email',
        destinatario: email,
        assunto: `Protocolo ${proto.numero} - Solicitação registrada`,
        conteudo: `Olá, ${nome}.\n\nSua solicitação foi registrada com sucesso.\n\nProtocolo: ${proto.numero}\nCódigo de acesso: ${senha}\n\nAcesse ${PORTAL_URL} para acompanhar.`,
      });
    }

    if (criar_conta && email && senha_conta) {
      await criarContaCidadao(tenantId, cidadao.id, email, senha_conta);
    }

    res.status(201).json({
      protocolo_id: proto.id,
      numero: proto.numero,
      senha_acesso: senha,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Cadastro de conta do cidadão ────────────────────────────
// Antes o portal criava conta chamando POST /protocols, que exige serviço:
// cadastrar sem abrir solicitação devolvia 400 "Nome e serviço são obrigatórios".
router.post('/auth/register', rateLimiterPublico(5, 600000), async (req, res) => {
  try {
    const { nome, cpf, telefone, email, senha } = req.body;

    const nomeLimpo = (nome || '').trim();
    const emailLimpo = (email || '').trim().toLowerCase();

    if (!nomeLimpo || !emailLimpo || !senha) {
      return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const tenantId = await resolverTenantId(req);
    if (!tenantId) return res.status(500).json({ erro: 'Configuração de tenant não encontrada' });

    const jaExiste = await buscarContaPorEmail(tenantId, emailLimpo);
    if (jaExiste) {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Faça login ou recupere a senha.' });
    }

    // Reaproveita o cadastro do cidadão se ele já apareceu por outro canal
    // (WhatsApp, atendimento presencial, solicitação sem conta).
    const cidadao = await buscarOuCriarCidadao(tenantId, {
      nome: nomeLimpo,
      cpf: cpf?.trim() || undefined,
      telefone: telefone?.trim() || undefined,
      email: emailLimpo,
      casarPorEmail: true,
    });

    const conta = await criarContaCidadao(tenantId, cidadao.id, emailLimpo, senha);
    if (!conta) {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Faça login ou recupere a senha.' });
    }

    const sessao = await criarSessaoPublica(
      tenantId, null, conta.id, req.ip, req.get('user-agent')
    );

    const orgao = await db.oneOrNone('SELECT slug, nome FROM tenants WHERE id = $1', [tenantId]);

    res.status(201).json({
      token: sessao.token,
      conta_id: conta.id,
      nome: cidadao.nome,
      email: conta.email,
      tenant_id: tenantId,
      tenant_slug: orgao?.slug || null,
      tenant_nome: orgao?.nome || null,
      expira_em: sessao.expira_em,
    });
  } catch (err) {
    console.error('[portal] falha no cadastro de conta:', err.message);
    res.status(500).json({ erro: 'Não foi possível criar a conta. Tente novamente.' });
  }
});

// ─── Autenticação do cidadão (login) ─────────────────────────
router.post('/auth/login', rateLimiterPublico(5, 300000), async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });

    // No login o cidadão não escolhe órgão: a conta é procurada em todos os
    // tenants ativos. Sem isso, quem se cadastrou em um município só
    // conseguia entrar se ele fosse justamente o do fallback.
    let tenantId = null;
    let conta = null;

    const slugEscolhido = String(req.body.tenant || '').trim();
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];
    const preferido = slugEscolhido
      || (subdomain && subdomain !== 'prot' && subdomain !== 'www' ? subdomain : '');

    const candidatos = await db.manyOrNone(
      `SELECT id FROM tenants WHERE ativo = true
        ORDER BY (slug = $1) DESC, criado_em`,
      [preferido || null]
    );

    for (const t of candidatos) {
      const achada = await autenticarCidadao(t.id, email, senha);
      if (achada) { tenantId = t.id; conta = achada; break; }
    }
    if (!conta) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });

    // Cria sessão vinculada à conta
    const { criarSessaoPublica: criarSessao } = await import('../services/protocolo-v2.js');
    const sessao = await criarSessao(
      tenantId, null, conta.id, req.ip, req.get('user-agent')
    );

    const orgao = await db.oneOrNone('SELECT slug, nome FROM tenants WHERE id = $1', [tenantId]);

    res.json({
      token: sessao.token,
      conta_id: conta.id,
      nome: conta.nome,
      email: conta.email,
      tenant_id: tenantId,
      tenant_slug: orgao?.slug || null,
      tenant_nome: orgao?.nome || null,
      expira_em: sessao.expira_em,
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Recuperação de senha ────────────────────────────────────

router.post('/auth/forgot-password', rateLimiterPublico(3, 600000), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'Informe o e-mail da sua conta.' });

    const tenantId = await tenantDaContaPorEmail(req, email);

    const resultado = await gerarTokenRecuperacaoSenha(tenantId, email);

    // Sempre retorna ok mesmo se o e-mail não existir (segurança)
    if (!resultado) return res.json({ ok: true, mensagem: 'Se o e-mail estiver cadastrado, você receberá um código de recuperação.' });

    // Enfileirar notificação com o código
    try {
      const proto = await db.oneOrNone(
        `SELECT p.id, p.numero FROM protocolos p
         JOIN cidadaos c ON c.contato_id = p.contato_id
         JOIN cidadao_contas cc ON cc.cidadao_id = c.id
         WHERE cc.id = $1 AND cc.tenant_id = $2
         ORDER BY p.aberto_em DESC LIMIT 1`,
        [resultado.email, tenantId]
      );
      if (proto) {
        await enfileirarNotificacao(tenantId, proto.id, {
          canal: 'whatsapp',
          destinatario: null, // será resolvido pelo worker
          assunto: 'Recuperação de senha',
          conteudo: `Olá! Seu código de recuperação de senha é: ${resultado.token}. Ele expira em 30 minutos. Se você não solicitou, ignore esta mensagem.`,
        });
      }
    } catch {}

    res.json({ ok: true, mensagem: 'Se o e-mail estiver cadastrado, você receberá um código de recuperação.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/reset-password', rateLimiterPublico(5, 300000), async (req, res) => {
  try {
    const { email, token, nova_senha } = req.body;
    if (!email || !token || !nova_senha) {
      return res.status(400).json({ erro: 'E-mail, código e nova senha são obrigatórios.' });
    }

    const tenantId = await tenantDaContaPorEmail(req, email);

    await redefinirSenhaComToken(tenantId, email, token, nova_senha);
    res.json({ ok: true });
  } catch (err) {
    const ehRegra = /código inválido|6 caracteres/i.test(err.message);
    res.status(ehRegra ? 400 : 500).json({ erro: err.message });
  }
});

// ─── Meus protocolos (conta logada) ──────────────────────────
router.get('/my/protocols', async (req, res) => {
  try {
    const conta = await contaDaSessao(req);
    if (!conta) return res.status(401).json({ erro: 'Faça login para acessar seus protocolos' });

    const protocolos = await listarProtocolosDoCidadao(conta.tenant_id, conta.cidadao_id);
    res.json(protocolos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Dados da conta (pré-preenche o formulário de solicitação) ─
router.get('/my/account', async (req, res) => {
  try {
    const conta = await contaDaSessao(req);
    if (!conta) return res.status(401).json({ erro: 'Faça login para acessar sua conta' });

    // O órgão vai junto: a conta pertence a um município e o portal precisa
    // dele para listar o catálogo certo na hora de abrir a solicitação.
    res.json({
      conta_id: conta.id,
      nome: conta.nome,
      email: conta.email,
      cpf: conta.cpf,
      telefone: conta.telefone,
      tenant_id: conta.tenant_id,
      tenant_slug: conta.tenant_slug,
      tenant_nome: conta.tenant_nome,
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Abrir solicitação já logado ─────────────────────────────
// Diferente de POST /protocols: o solicitante é a conta, então não se pede
// nome/CPF de novo nem se devolve código de acesso — o protocolo já entra na
// lista "Meus protocolos".
router.post('/my/protocols', async (req, res) => {
  try {
    const conta = await contaDaSessao(req);
    if (!conta) return res.status(401).json({ erro: 'Faça login para abrir uma solicitação' });

    const { servico_id, descricao, campos, telefone } = req.body;
    if (!servico_id || !UUID_RE.test(String(servico_id))) {
      return res.status(400).json({ erro: 'Escolha um serviço para continuar.' });
    }

    const tenantId = conta.tenant_id;
    const servico = await db.oneOrNone(
      'SELECT * FROM protocolo_servicos WHERE id = $1 AND tenant_id = $2 AND ativo = true AND disponivel = true',
      [servico_id, tenantId]
    );
    if (!servico) {
      // Serviço de outro município: a conta é de um órgão só, então o pedido
      // não pode ser aberto por ela. A mensagem genérica escondia a causa.
      const deOutroOrgao = await db.oneOrNone(
        `SELECT t.nome FROM protocolo_servicos s
           JOIN tenants t ON t.id = s.tenant_id
          WHERE s.id = $1`,
        [servico_id]
      );
      if (deOutroOrgao) {
        return res.status(409).json({
          erro: `Este serviço é de ${deOutroOrgao.nome}, e sua conta é de outro órgão. Use a solicitação sem cadastro para abrir o pedido nesse município.`,
        });
      }
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }

    // Telefone informado agora vira o contato da conta, para as notificações.
    const telefoneLimpo = (telefone || '').replace(/\D/g, '');
    if (telefoneLimpo && telefoneLimpo !== conta.telefone) {
      await db.none(
        'UPDATE cidadaos SET telefone = $1, atualizado_em = now() WHERE id = $2 AND tenant_id = $3',
        [telefoneLimpo, conta.cidadao_id, tenantId]
      );
    }
    const telefoneContato = telefoneLimpo || conta.telefone;

    const { criarProtocolo, gerarCredencialAcesso, enfileirarNotificacao } = await import('../services/protocolo-v2.js');

    const proto = await criarProtocolo(tenantId, {
      assunto: servico.nome,
      descricao,
      servicoId: servico.id,
      departamentoId: servico.departamento_id,
      origem: 'portal',
      externo: true,
      cidadaoId: conta.cidadao_id,
      campos: Array.isArray(campos) ? campos : [],
    });

    if (telefoneContato) {
      try {
        const contato = await db.oneOrNone(
          'SELECT id FROM contatos WHERE tenant_id = $1 AND (telefone = $2 OR phone_e164 = $2)',
          [tenantId, telefoneContato]
        );
        if (contato) {
          await db.none('UPDATE protocolos SET contato_id = $1 WHERE id = $2', [contato.id, proto.id]);
          await db.none('UPDATE cidadaos SET contato_id = $1 WHERE id = $2', [contato.id, conta.cidadao_id]);
        }
      } catch {}
    }

    // O código de acesso continua sendo gerado: serve para consultar o
    // protocolo sem login (e é o que vai na notificação).
    const senha = await gerarCredencialAcesso(tenantId, proto.id);

    if (telefoneContato) {
      await enfileirarNotificacao(tenantId, proto.id, {
        canal: 'whatsapp',
        destinatario: telefoneContato,
        assunto: 'Solicitação registrada',
        conteudo: `Olá, ${conta.nome}. Sua solicitação foi registrada.\n\nProtocolo: ${proto.numero}\nCódigo de acesso: ${senha}\nConsulta: ${PORTAL_URL}`,
      });
    }

    if (conta.email) {
      await enfileirarNotificacao(tenantId, proto.id, {
        canal: 'email',
        destinatario: conta.email,
        assunto: `Protocolo ${proto.numero} - Solicitação registrada`,
        conteudo: `Olá, ${conta.nome}.\n\nSua solicitação foi registrada com sucesso.\n\nProtocolo: ${proto.numero}\nCódigo de acesso: ${senha}\n\nAcesse ${PORTAL_URL} para acompanhar.`,
      });
    }

    res.status(201).json({
      protocolo_id: proto.id,
      numero: proto.numero,
      senha_acesso: senha,
    });
  } catch (err) {
    console.error('[portal] falha ao abrir solicitação logada:', err.message);
    res.status(500).json({ erro: 'Não foi possível registrar a solicitação. Tente novamente.' });
  }
});

// ─── LGPD: Exportar dados ────────────────────────────────────
router.get('/my/data/export', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ erro: 'Não autorizado' });

    const sessao = await validarSessaoPublica(null, token);
    if (!sessao?.cidadao_conta_id) return res.status(401).json({ erro: 'Faça login para exportar seus dados' });

    const { exportarDadosCidadao } = await import('../services/lgpd-protocolo.js');
    const dados = await exportarDadosCidadao(sessao.tenant_id, sessao.cidadao_conta_id);
    res.json(dados);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── LGPD: Solicitar exclusão ───────────────────────────────
router.post('/my/data/delete', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ erro: 'Não autorizado' });

    const sessao = await validarSessaoPublica(null, token);
    if (!sessao?.cidadao_conta_id) return res.status(401).json({ erro: 'Faça login para solicitar exclusão' });

    const { solicitarExclusaoDados } = await import('../services/lgpd-protocolo.js');
    const result = await solicitarExclusaoDados(sessao.tenant_id, sessao.cidadao_conta_id, req.body.motivo);
    res.json(result);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── LGPD: Política de privacidade ──────────────────────────
router.get('/privacy', async (req, res) => {
  try {
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];
    let tenantId = null;
    if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
      const tenant = await db.oneOrNone('SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [subdomain]);
      if (tenant) tenantId = tenant.id;
    }
    if (!tenantId) {
      const tenant = await db.oneOrNone('SELECT id FROM tenants WHERE ativo = true ORDER BY criado_em LIMIT 1');
      if (tenant) tenantId = tenant.id;
    }

    const { obterPoliticaPrivacidade } = await import('../services/lgpd-protocolo.js');
    const politica = await obterPoliticaPrivacidade(tenantId);
    res.json(politica);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
