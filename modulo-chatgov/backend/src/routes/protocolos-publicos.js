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
import { buscarOuCriarCidadao, criarContaCidadao, autenticarCidadao, listarProtocolosDoCidadao } from '../services/cidadao.js';
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
  next();
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
      `UPDATE protocolo_documentos SET status = 'aguardando_analise' WHERE id = $1`,
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
      status: 'aguardando_analise',
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

// ─── Catálogo de serviços ────────────────────────────────────
router.get('/services', async (req, res) => {
  try {
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];

    let tenantId = null;
    if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
      const tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [subdomain]
      );
      if (tenant) tenantId = tenant.id;
    }

    let where = 's.disponivel = true AND s.ativo = true';
    const params = [];
    if (tenantId) {
      where += ' AND s.tenant_id = $1';
      params.push(tenantId);
    }

    const servicos = await db.manyOrNone(
      `SELECT s.*, d.nome AS departamento_nome, sec.nome AS secretaria_nome
       FROM protocolo_servicos s
       LEFT JOIN departamentos d ON d.id = s.departamento_id
       LEFT JOIN secretarias sec ON sec.id = s.secretaria_id
       WHERE ${where}
       ORDER BY s.ordem, s.nome`,
      params
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

    // Resolve tenant pelo domínio
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];
    let tenantId = null;

    if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
      const tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [subdomain]
      );
      if (tenant) tenantId = tenant.id;
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

// ─── Autenticação do cidadão (login) ─────────────────────────
router.post('/auth/login', rateLimiterPublico(5, 300000), async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });

    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];
    let tenantId = null;

    if (subdomain && subdomain !== 'prot' && subdomain !== 'www') {
      const tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE slug = $1 AND ativo = true', [subdomain]
      );
      if (tenant) tenantId = tenant.id;
    }

    if (!tenantId) {
      const tenant = await db.oneOrNone(
        'SELECT id FROM tenants WHERE ativo = true ORDER BY criado_em LIMIT 1'
      );
      if (tenant) tenantId = tenant.id;
    }

    const conta = await autenticarCidadao(tenantId, email, senha);
    if (!conta) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });

    // Cria sessão vinculada à conta
    const { criarSessaoPublica: criarSessao } = await import('../services/protocolo-v2.js');
    const sessao = await criarSessao(
      tenantId, null, conta.id, req.ip, req.get('user-agent')
    );

    res.json({
      token: sessao.token,
      conta_id: conta.id,
      nome: conta.nome,
      email: conta.email,
      expira_em: sessao.expira_em,
    });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ─── Meus protocolos (conta logada) ──────────────────────────
router.get('/my/protocols', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ erro: 'Não autorizado' });

    const sessao = await validarSessaoPublica(null, token);
    if (!sessao || !sessao.cidadao_conta_id) {
      return res.status(401).json({ erro: 'Faça login para acessar seus protocolos' });
    }

    const conta = await db.oneOrNone(
      'SELECT cidadao_id FROM cidadao_contas WHERE id = $1',
      [sessao.cidadao_conta_id]
    );
    if (!conta) return res.status(404).json({ erro: 'Conta não encontrada' });

    const protocolos = await listarProtocolosDoCidadao(sessao.tenant_id, conta.cidadao_id);
    res.json(protocolos);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno' });
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
