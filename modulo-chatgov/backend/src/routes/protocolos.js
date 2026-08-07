import express from 'express';
import db from '../db.js';
import { PERMISSIONS, requirePermission } from '../auth/permissions.js';
import { uploadUnico, UploadInvalido, salvarArquivoProtocolo, obterArquivoDocumento } from '../services/upload-protocolo.js';
import {
  criarProtocolo, consultarProtocoloDetalhado, listarProtocolos,
  gerarCredencialAcesso, validarCredencial, criarSessaoPublica,
  tramitarProtocolo, enviarMensagemPublica, criarAnotacaoInterna,
  criarPendencia, resolverPendencia,
  registrarDocumento, alterarStatusDocumento, listarDocumentosProtocolo,
  atualizarStatusProtocolo, vincularProtocolo, listarRelacionamentos,
  enfileirarNotificacao, dashboardProtocolos,
} from '../services/protocolo-v2.js';
import { buscarOuCriarCidadao } from '../services/cidadao.js';
import { validarCriacaoProtocolo } from '../domain/protocolo-validacao.js';
import { config } from '../config.js';
import QRCode from 'qrcode';

const PORTAL_URL = config.portalUrl;

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    const data = await dashboardProtocolos(req.operador.tenantId, {
      departamentoId: req.query.departamento_id,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Listar protocolos ───────────────────────────────────────
router.get('/', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    const {
      status, departamento_id, setor_id, responsavel_id,
      busca, origem, prioridade, servico_id, categoria,
      atrasados, externo, limite, pagina, offset,
      proximos_prazo, sem_responsavel, com_pendencia,
    } = req.query;

    const protocolos = await listarProtocolos(req.operador.tenantId, {
      status: status ? String(status).split(',') : undefined,
      departamentoId: departamento_id,
      setorId: setor_id,
      responsavelId: responsavel_id,
      busca,
      origem,
      prioridade,
      servicoId: servico_id,
      categoria,
      atrasados: atrasados === 'true',
      proximosPrazo: proximos_prazo === 'true',
      semResponsavel: sem_responsavel === 'true',
      comPendencia: com_pendencia === 'true',
      externo: externo !== undefined ? externo === 'true' : undefined,
      limite: Math.min(parseInt(limite, 10) || 30, 100),
      pagina: Math.max(parseInt(pagina, 10) || 1, 1),
      offset: offset !== undefined ? Math.max(0, parseInt(offset, 10) || 0) : undefined,
    });

    res.json(protocolos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Criar protocolo ─────────────────────────────────────────
router.post('/', requirePermission(PERMISSIONS.PROTOCOLOS_CREATE), async (req, res) => {
  try {
    const op = req.operador;
    const {
      conversa_id, contato_id, departamento_id,
      assunto, descricao, categoria, categoria_id, servico_id, tipo, tipo_id,
      origem, prioridade, nivel_acesso, externo, prazo, prazo_dias,
      sla_regra_id, campos, mensagens_selecionadas,
      enviar_senha, gerar_senha, gerar_acesso,
      nome_cidadao, cpf_cidadao, telefone_cidadao, email_cidadao,
      nome_social, cnpj_cidadao, tags, observacao_interna,
      cidadao_id,
    } = req.body;

    // ─── Validação (mesmas regras do frontend, reaplicadas no servidor) ───
    const { erros, normalizado } = validarCriacaoProtocolo(req.body);
    if (erros.length > 0) {
      return res.status(422).json({
        erro: 'Não foi possível criar o protocolo. Verifique os campos destacados.',
        erros,
      });
    }

    // ─── Idempotência: protege contra clique duplo / retry da requisição ───
    const chaveIdem = String(
      req.get('Idempotency-Key') || req.body.idempotency_key || ''
    ).trim().slice(0, 200) || null;

    if (chaveIdem) {
      const existente = await db.oneOrNone(
        `SELECT p.* FROM protocolo_idempotencia i
         JOIN protocolos p ON p.id = i.protocolo_id
         WHERE i.tenant_id = $1 AND i.chave = $2`,
        [op.tenantId, chaveIdem]
      );
      if (existente) {
        // Repetição da mesma requisição: devolve o protocolo já criado.
        // A senha não é reemitida — ela só existe no retorno da criação original.
        return res.status(200).json({ ...existente, senha_acesso: null, idempotente: true });
      }
    }

    let cidadaoId = cidadao_id || null;
    if (!cidadaoId && !normalizado.ehInterno
        && (contato_id || normalizado.cpf || normalizado.telefone || normalizado.nome)) {
      const cidadao = await buscarOuCriarCidadao(op.tenantId, {
        nome: normalizado.nome,
        nomeSocial: nome_social,
        cpf: normalizado.cpf,
        cnpj: normalizado.cnpj,
        telefone: normalizado.telefone,
        email: normalizado.email,
        contatoId: contato_id,
      });
      cidadaoId = cidadao?.id;
    }

    const gerarSenha = gerar_senha !== false && gerar_acesso !== false;

    const proto = await criarProtocolo(op.tenantId, {
      conversaId: conversa_id,
      contatoId: contato_id,
      cidadaoId,
      departamentoId: departamento_id,
      operadorId: op.id,
      assunto: normalizado.assunto,
      descricao,
      categoria: categoria || null,
      categoriaId: categoria_id || null,
      servicoId: servico_id,
      tipoId: tipo_id || null,
      origem: normalizado.origem,
      prioridade: normalizado.prioridade,
      nivelAcesso: normalizado.nivelAcesso,
      externo: !normalizado.ehInterno,
      prazoDias: prazo_dias ? Number(prazo_dias) : null,
      prazo: prazo || null,
      slaRegraId: sla_regra_id,
      campos: campos || [],
      mensagensSelecionadas: mensagens_selecionadas || [],
      tags: tags || [],
      observacaoInterna: observacao_interna,
    });

    if (chaveIdem) {
      await db.none(
        `INSERT INTO protocolo_idempotencia (tenant_id, chave, protocolo_id)
         VALUES ($1, $2, $3) ON CONFLICT (tenant_id, chave) DO NOTHING`,
        [op.tenantId, chaveIdem, proto.id]
      );
    }

    let senha = null;
    if (gerarSenha) {
      senha = await gerarCredencialAcesso(op.tenantId, proto.id);
    }

    // Comprovante por WhatsApp — respeita a escolha feita na etapa de
    // comunicação do formulário; só envia quando pedido explicitamente.
    const querWhatsApp = req.body.enviar_whatsapp === true || enviar_senha === true;
    if (querWhatsApp && (normalizado.telefone || contato_id || cidadaoId)) {
      try {
        // O telefone pode não vir no payload (ex.: criação a partir de uma
        // conversa, onde só temos contato_id). Busca no contato/cidadão.
        let numero = normalizado.telefone ? normalizado.telefone.replace(/\D/g, '') : null;
        let nome = normalizado.nome;

        if (!numero || !nome) {
          const dono = await db.oneOrNone(
            `SELECT COALESCE(c.telefone, ct.telefone) AS telefone,
                    COALESCE(c.nome, ct.nome) AS nome
             FROM (SELECT $1::uuid AS cid, $2::uuid AS ctid) src
             LEFT JOIN cidadaos c ON c.id = src.cid AND c.tenant_id = $3
             LEFT JOIN contatos ct ON ct.id = src.ctid AND ct.tenant_id = $3`,
            [cidadaoId || null, contato_id || null, op.tenantId]
          );
          numero = numero || (dono?.telefone ? String(dono.telefone).replace(/\D/g, '') : null);
          nome = nome || dono?.nome || 'cidadão';
        }
        nome = nome || 'cidadão';
        const mensagem = `Olá, ${nome}. Sua solicitação foi registrada.\n\n` +
          `Protocolo: ${proto.numero}` +
          (senha ? `\nCódigo de acesso: ${senha}` : '') +
          `\nConsulta: ${PORTAL_URL}\n\n` +
          `Guarde estas informações para acompanhar o andamento.`;

        // Tenta enviar pelo WhatsAppManager se disponível
        const wa = req.app.locals?.whatsapp;
        if (wa && numero) {
          // Busca o JID do contato pelo número de telefone
          const jid = numero.includes('@s.whatsapp.net') ? numero : `${numero}@s.whatsapp.net`;
          try {
            await wa.sendText(op.tenantId, jid, mensagem);
            console.log(`[whatsapp] Protocolo ${proto.numero} enviado para ${numero}`);
          } catch (sendErr) {
            console.error(`[whatsapp] Falha ao enviar (${numero}), enfileirando:`, sendErr.message);
            await enfileirarNotificacao(op.tenantId, proto.id, {
              canal: 'whatsapp', destinatario: numero, assunto: `Protocolo ${proto.numero}`, conteudo: mensagem,
            });
          }
        } else if (numero) {
          await enfileirarNotificacao(op.tenantId, proto.id, {
            canal: 'whatsapp', destinatario: numero, assunto: `Protocolo ${proto.numero}`, conteudo: mensagem,
          });
        }
      } catch (e) {
        console.error('[whatsapp-envio] Erro:', e.message);
      }
    }

    res.status(201).json({ ...proto, senha_acesso: senha });
  } catch (err) {
    console.error('[POST /protocols] Error:', err.message, err.stack);
    res.status(500).json({ erro: err.message });
  }
});

// ─── Detalhes do protocolo ───────────────────────────────────
router.get('/:id', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const proto = await consultarProtocoloDetalhado(
      req.operador.tenantId, req.params.id
    );
    if (!proto) return res.status(404).json({ erro: 'Protocolo não encontrado' });
    res.json(proto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Atualizar protocolo ─────────────────────────────────────
router.patch('/:id', requirePermission(PERMISSIONS.PROTOCOLOS_EDIT), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const { assunto, descricao, categoria, servico_id, prioridade, nivel_acesso } = req.body;
    const updates = [];
    const params = [req.params.id, req.operador.tenantId];
    let idx = 3;

    if (assunto !== undefined) { updates.push(`assunto = $${idx++}`); params.push(assunto); }
    if (descricao !== undefined) { updates.push(`descricao = $${idx++}`); params.push(descricao); }
    if (categoria !== undefined) { updates.push(`categoria = $${idx++}`); params.push(categoria); }
    if (servico_id !== undefined) { updates.push(`servico_id = $${idx++}`); params.push(servico_id); }
    if (prioridade !== undefined) { updates.push(`prioridade = $${idx++}`); params.push(prioridade); }
    if (nivel_acesso !== undefined) { updates.push(`nivel_acesso = $${idx++}`); params.push(nivel_acesso); }

    if (updates.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

    updates.push('atualizado_em = now()');

    const proto = await db.oneOrNone(
      `UPDATE protocolos SET ${updates.join(', ')}
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      params
    );
    if (!proto) return res.status(404).json({ erro: 'Protocolo não encontrado' });
    res.json(proto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Status ──────────────────────────────────────────────────
router.patch('/:id/status', requirePermission(PERMISSIONS.PROTOCOLOS_COMPLETE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const proto = await atualizarStatusProtocolo(
      req.operador.tenantId, req.params.id,
      {
        statusOperacional: req.body.status_operacional,
        operadorId: req.operador.id,
        justificativa: req.body.justificativa,
        observacao: req.body.observacao,
      }
    );
    res.json(proto);
  } catch (err) {
    res.status(/não encontrado/.test(err.message) ? 404 : 400).json({ erro: err.message });
  }
});

// ─── Mensagens públicas ──────────────────────────────────────
router.get('/:id/messages', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const rows = await db.manyOrNone(
      `SELECT m.*, o.nome AS operador_nome
       FROM protocolo_mensagens m
       LEFT JOIN operadores o ON o.id = m.operador_id
       WHERE m.protocolo_id = $1 AND m.tenant_id = $2
       ORDER BY m.criado_em ASC`,
      [req.params.id, req.operador.tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post('/:id/messages', requirePermission(PERMISSIONS.PROTOCOLOS_MESSAGE_PUBLIC), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const conteudo = String(req.body.conteudo || '').trim();
    if (!conteudo) {
      return res.status(422).json({
        erro: 'Escreva a mensagem antes de enviar.',
        erros: [{ campo: 'conteudo', mensagem: 'A mensagem não pode ficar em branco.' }],
      });
    }

    const msg = await enviarMensagemPublica(
      req.operador.tenantId, req.params.id,
      {
        operadorId: req.operador.id,
        conteudo,
        temAnexo: req.body.tem_anexo,
      }
    );

    await db.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, operador_id, observacao, visivel_cidadao)
       VALUES ($1, $2, 'mensagem_enviada', $3, $4, true)`,
      [req.operador.tenantId, req.params.id, req.operador.id,
        `Mensagem enviada ao cidadão: ${conteudo.slice(0, 120)}`]
    ).catch((e) => console.error('[historico mensagem]', e.message));

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Anotações internas ──────────────────────────────────────
router.post('/:id/internal-notes', requirePermission(PERMISSIONS.PROTOCOLOS_MESSAGE_INTERNAL), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const conteudo = String(req.body.conteudo || '').trim();
    if (!conteudo) {
      return res.status(422).json({
        erro: 'Escreva a anotação antes de salvar.',
        erros: [{ campo: 'conteudo', mensagem: 'A anotação não pode ficar em branco.' }],
      });
    }

    const anot = await criarAnotacaoInterna(
      req.operador.tenantId, req.params.id,
      {
        operadorId: req.operador.id,
        conteudo,
        tipo: req.body.tipo,
      }
    );

    // Registra que houve anotação, sem repetir o teor dela no histórico —
    // o conteúdo interno fica só na aba de anotações.
    await db.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, operador_id, observacao, visivel_cidadao)
       VALUES ($1, $2, 'anotacao_interna', $3, 'Anotação interna registrada', false)`,
      [req.operador.tenantId, req.params.id, req.operador.id]
    ).catch((e) => console.error('[historico anotacao]', e.message));

    res.status(201).json(anot);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Tramitar ────────────────────────────────────────────────
router.post('/:id/forward', requirePermission(PERMISSIONS.PROTOCOLOS_FORWARD), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    if (!req.body.setor_destino_id || !UUID_RE.test(req.body.setor_destino_id)) {
      return res.status(422).json({
        erro: 'Informe o setor de destino do encaminhamento.',
        erros: [{ campo: 'setor_destino_id', mensagem: 'Selecione o setor de destino.' }],
      });
    }

    // O setor precisa existir neste tenant — evita encaminhar para o vazio.
    const destino = await db.oneOrNone(
      'SELECT id, nome FROM departamentos WHERE id = $1 AND tenant_id = $2',
      [req.body.setor_destino_id, req.operador.tenantId]
    );
    if (!destino) return res.status(404).json({ erro: 'Setor de destino não encontrado' });

    const proto = await tramitarProtocolo(
      req.operador.tenantId, req.params.id,
      {
        tipo: 'encaminhamento',
        setorDestinoId: req.body.setor_destino_id,
        operadorId: req.operador.id,
        // O cliente envia "motivo"; "observacao" é aceito por compatibilidade.
        observacao: req.body.motivo || req.body.observacao || `Encaminhado para ${destino.nome}`,
        justificativa: req.body.justificativa || req.body.orientacao || null,
      }
    );
    res.json(proto);
  } catch (err) {
    console.error('[POST /forward]', err.message);
    res.status(500).json({ erro: err.message });
  }
});

router.post('/:id/receive', requirePermission(PERMISSIONS.PROTOCOLOS_RECEIVE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const proto = await tramitarProtocolo(
      req.operador.tenantId, req.params.id,
      {
        tipo: 'recebimento',
        operadorId: req.operador.id,
        observacao: req.body.observacao,
      }
    );
    res.json(proto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Atribuir responsável ────────────────────────────────────
router.post('/:id/assign', requirePermission(PERMISSIONS.PROTOCOLOS_ASSIGN), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const { responsavel_id } = req.body;
    const proto = await db.oneOrNone(
      `UPDATE protocolos SET responsavel_id = $1, atualizado_em = now()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [responsavel_id, req.params.id, req.operador.tenantId]
    );
    if (!proto) return res.status(404).json({ erro: 'Protocolo não encontrado' });

    if (responsavel_id) {
      await db.none(
        `INSERT INTO protocolo_participantes (protocolo_id, operador_id, tenant_id, papel)
         VALUES ($1, $2, $3, 'responsavel') ON CONFLICT DO NOTHING`,
        [req.params.id, responsavel_id, req.operador.tenantId]
      );
    }

    res.json(proto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Pendências ──────────────────────────────────────────────
router.post('/:id/pending-items', requirePermission(PERMISSIONS.PROTOCOLOS_PENDING_CREATE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const titulo = String(req.body.titulo || '').trim();
    if (!titulo) {
      return res.status(422).json({
        erro: 'Informe o que está sendo solicitado ao cidadão.',
        erros: [{ campo: 'titulo', mensagem: 'Descreva a pendência.' }],
      });
    }

    const pend = await criarPendencia(
      req.operador.tenantId, req.params.id,
      {
        titulo,
        descricao: req.body.descricao,
        tipo: req.body.tipo,
        prazoDias: req.body.prazo_dias,
        criadoPor: req.operador.id,
      }
    );

    await db.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, operador_id, observacao, visivel_cidadao)
       VALUES ($1, $2, 'pendencia_criada', $3, $4, true)`,
      [req.operador.tenantId, req.params.id, req.operador.id,
        `Pendência criada (${req.body.tipo || 'documento'}): ${titulo}`]
    ).catch((e) => console.error('[historico pendencia]', e.message));

    // Enquanto aguarda o cidadão, o protocolo não deve parecer parado no setor.
    await db.none(
      `UPDATE protocolos
       SET status_operacional = 'PENDENTE', status = 'pendente', atualizado_em = now()
       WHERE id = $1 AND tenant_id = $2
         AND status_operacional NOT IN ('CONCLUIDO','CANCELADO')`,
      [req.params.id, req.operador.tenantId]
    ).catch((e) => console.error('[status pendencia]', e.message));

    res.status(201).json(pend);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post('/pending-items/:pendenciaId/resolve', requirePermission(PERMISSIONS.PROTOCOLOS_PENDING_RESOLVE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.pendenciaId)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const pend = await resolverPendencia(req.operador.tenantId, req.params.pendenciaId);
    res.json(pend);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Documentos ──────────────────────────────────────────────
router.post('/:id/documents', requirePermission(PERMISSIONS.PROTOCOLOS_DOC_UPLOAD), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const doc = await registrarDocumento(
      req.operador.tenantId, req.params.id,
      {
        nomeAmigavel: req.body.nome_amigavel,
        nomeInterno: req.body.nome_interno,
        mimeType: req.body.mime_type,
        tamanhoBytes: req.body.tamanho_bytes,
        sha256: req.body.sha256,
        tipoDocumental: req.body.tipo_documental,
        status: req.body.status,
        nivelAcesso: req.body.nivel_acesso,
        origem: req.body.origem || 'interno',
        pendenciaId: req.body.pendencia_id,
        enviadoPor: req.operador.id,
        dataDocumento: req.body.data_documento,
        autor: req.body.autor,
        departamentoId: req.body.departamento_id,
      }
    );
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.patch('/:id/documents/:docId', requirePermission(PERMISSIONS.PROTOCOLOS_DOC_APPROVE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.docId)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const doc = await alterarStatusDocumento(
      req.operador.tenantId, req.params.docId,
      {
        status: req.body.status,
        rejeitadoMotivo: req.body.rejeitado_motivo,
        nivelAcesso: req.body.nivel_acesso,
        liberadoEm: req.body.liberado_em,
      }
    );

    // Liberar um documento ao cidadão muda o que sai da prefeitura: fica
    // registrado no histórico e na auditoria.
    const rotulo = {
      liberado_cidadao: 'Documento liberado ao cidadão',
      aprovado: 'Documento aprovado',
      rejeitado: 'Documento rejeitado',
      arquivado: 'Documento arquivado',
    }[req.body.status];

    if (rotulo) {
      await db.none(
        `INSERT INTO protocolo_movimentacoes
          (tenant_id, protocolo_id, tipo, operador_id, observacao)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.operador.tenantId, doc.protocolo_id,
          req.body.status === 'rejeitado' ? 'documento_rejeitado' : 'documento_aprovado',
          req.operador.id,
          `${rotulo}: ${doc.nome_amigavel}${req.body.rejeitado_motivo ? ` — ${req.body.rejeitado_motivo}` : ''}`]
      ).catch(() => {});

      await db.none(
        `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, entidade, entidade_id, ip)
         VALUES ($1, $2, $3, $4, 'protocolo_documento', $5, $6)`,
        [req.operador.tenantId, req.operador.id, `documento.${req.body.status}`,
          { documento: doc.nome_amigavel, motivo: req.body.rejeitado_motivo || null },
          doc.id, req.ip]
      ).catch(() => {});
    }

    res.json(doc);
  } catch (err) {
    // Erros de regra (status inválido, motivo ausente) são do cliente.
    const ehRegra = /inválido|Informe o motivo|não encontrado/i.test(err.message);
    res.status(ehRegra ? 400 : 500).json({ erro: err.message });
  }
});

router.get('/:id/documents', requirePermission(PERMISSIONS.PROTOCOLOS_DOC_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const docs = await listarDocumentosProtocolo(req.operador.tenantId, req.params.id);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Relacionamentos ─────────────────────────────────────────
router.post('/:id/relations', requirePermission(PERMISSIONS.PROTOCOLOS_LINK), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const rel = await vincularProtocolo(
      req.operador.tenantId, req.params.id,
      req.body.protocolo_destino_id, req.body.tipo
    );
    res.status(201).json(rel);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.get('/:id/relations', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const rels = await listarRelacionamentos(req.operador.tenantId, req.params.id);
    res.json(rels);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Histórico ───────────────────────────────────────────────
router.get('/:id/history', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const movs = await db.manyOrNone(
      `SELECT m.*, o.nome AS operador_nome,
              so.nome AS setor_origem_nome, sd.nome AS setor_destino_nome
       FROM protocolo_movimentacoes m
       LEFT JOIN operadores o ON o.id = m.operador_id
       LEFT JOIN departamentos so ON so.id = m.setor_origem_id
       LEFT JOIN departamentos sd ON sd.id = m.setor_destino_id
       WHERE m.protocolo_id = $1 AND m.tenant_id = $2
       ORDER BY m.criado_em DESC`,
      [req.params.id, req.operador.tenantId]
    );
    res.json(movs);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Credencial (gerar senha) ────────────────────────────────
router.post('/:id/access-credentials', requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const senha = await gerarCredencialAcesso(
      req.operador.tenantId, req.params.id,
      req.body.senha
    );
    res.json({ senha });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Enviar acesso WhatsApp ──────────────────────────────────
router.post('/:id/send-whatsapp-access', requirePermission(PERMISSIONS.PROTOCOLOS_MANAGE), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    // O telefone pode estar no cidadão (protocolo de balcão/portal) ou no
    // contato do WhatsApp — antes só o contato era consultado.
    const proto = await db.oneOrNone(
      `SELECT p.numero, p.id,
              COALESCE(cid.nome_social, cid.nome, co.nome) AS nome,
              COALESCE(cid.telefone, co.telefone) AS telefone
       FROM protocolos p
       LEFT JOIN cidadaos cid ON cid.id = p.cidadao_id
       LEFT JOIN contatos co ON co.id = p.contato_id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
      [req.params.id, req.operador.tenantId]
    );
    if (!proto) return res.status(404).json({ erro: 'Protocolo não encontrado' });

    const telefone = String(proto.telefone || '').replace(/\D/g, '');
    if (!telefone) {
      return res.status(422).json({
        erro: 'O solicitante deste protocolo não possui telefone cadastrado.',
      });
    }

    const senha = await gerarCredencialAcesso(req.operador.tenantId, proto.id);
    const conteudo = `Olá, ${proto.nome || 'cidadão'}. Sua solicitação foi registrada.\n\n`
      + `Protocolo: ${proto.numero}\nCódigo de acesso: ${senha}\n`
      + `Consulta: ${PORTAL_URL}\n\nGuarde estas informações para acompanhar o andamento.`;

    // Tenta o envio imediato; se falhar, a fila (worker) reprocessa.
    let entregue = false;
    const wa = req.app.locals?.whatsapp;
    if (wa) {
      try {
        await wa.sendText(req.operador.tenantId, `${telefone}@s.whatsapp.net`, conteudo);
        entregue = true;
      } catch (err) {
        console.error('[protocolo] Envio imediato falhou, enfileirando:', err.message);
      }
    }
    if (!entregue) {
      await enfileirarNotificacao(req.operador.tenantId, proto.id, {
        canal: 'whatsapp',
        destinatario: telefone,
        assunto: `Protocolo ${proto.numero}`,
        conteudo,
      });
    }

    await db.none(
      `INSERT INTO auditoria (tenant_id, operador_id, acao, detalhe, entidade, entidade_id, ip)
       VALUES ($1, $2, 'protocolo.acesso.reenviado', $3, 'protocolo', $4, $5)`,
      [req.operador.tenantId, req.operador.id,
        { canal: 'whatsapp', entregue, destinatario_mascarado: telefone.slice(-4).padStart(telefone.length, '*') },
        proto.id, req.ip]
    ).catch(() => {});

    // A senha não volta no corpo da resposta: ela segue apenas para o
    // destinatário pelo canal escolhido.
    res.json({ ok: true, entregue, canal: 'whatsapp' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Conversa → Protocolos ───────────────────────────────────
router.get('/conversation/:conversaId', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.conversaId)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const protocolos = await db.manyOrNone(
      `SELECT p.*, d.nome AS setor_atual_nome
       FROM protocolos p
       LEFT JOIN departamentos d ON d.id = p.setor_atual_id
       WHERE p.conversa_id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL
       ORDER BY p.aberto_em DESC`,
      [req.params.conversaId, req.operador.tenantId]
    );
    res.json(protocolos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Upload de arquivo ───────────────────────────────────────
router.post('/:id/documents/upload', requirePermission(PERMISSIONS.PROTOCOLOS_DOC_UPLOAD), uploadUnico('arquivo'), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

    const doc = await salvarArquivoProtocolo(
      req.operador.tenantId, req.params.id, req.file, req.operador.id,
      {
        // Anexo de servidor é interno por padrão; liberar ao cidadão é uma
        // ação explícita e auditada.
        nivelAcesso: req.body.nivel_acesso || 'restrito_setor',
        origem: 'interno',
        tipoDocumental: req.body.tipo_documental || null,
        pendenciaId: req.body.pendencia_id || null,
      }
    );

    await db.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, operador_id, observacao)
       VALUES ($1, $2, 'documento_anexado', $3, $4)`,
      [req.operador.tenantId, req.params.id, req.operador.id,
        `Documento anexado: ${doc.nome_amigavel}`]
    ).catch(() => {});

    res.status(201).json(doc);
  } catch (err) {
    if (err instanceof UploadInvalido) {
      return res.status(400).json({ erro: err.message });
    }
    console.error('[POST documents/upload]', err.message);
    res.status(500).json({ erro: 'Erro ao salvar o documento' });
  }
});

// ─── Download de arquivo ────────────────────────────────────
router.get('/documents/:docId/download', requirePermission(PERMISSIONS.PROTOCOLOS_DOC_DOWNLOAD), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.docId)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const result = await obterArquivoDocumento(req.operador.tenantId, req.params.docId);
    if (!result) return res.status(404).json({ erro: 'Documento não encontrado' });

    await db.none(
      `INSERT INTO protocolo_documento_downloads
        (tenant_id, documento_id, baixado_por, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.operador.tenantId, req.params.docId, req.operador.nome, req.ip, req.get('user-agent')]
    );

    res.set('Content-Type', result.doc.mime_type);
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(result.doc.nome_amigavel)}"`);
    res.send(result.buffer);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── Comprovante imprimível ──────────────────────────────────
// Documento público de abertura: só contém o que o cidadão pode ver.
// Nunca inclui anotações internas, auditoria ou o código de acesso.
router.get('/:id/receipt', requirePermission(PERMISSIONS.PROTOCOLOS_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }

    const p = await db.oneOrNone(
      `SELECT p.numero, p.assunto, p.descricao, p.origem, p.prioridade,
              p.aberto_em, p.prazo_em, p.status_operacional, p.externo,
              COALESCE(cid.nome_social, cid.nome, co.nome) AS solicitante,
              COALESCE(cid.cpf, cid.cnpj, co.cpf) AS documento,
              d.nome AS setor_nome, sv.nome AS servico_nome,
              t.nome AS orgao_nome
       FROM protocolos p
       LEFT JOIN cidadaos cid ON cid.id = p.cidadao_id
       LEFT JOIN contatos co ON co.id = p.contato_id
       LEFT JOIN departamentos d ON d.id = p.setor_atual_id
       LEFT JOIN protocolo_servicos sv ON sv.id = p.servico_id
       LEFT JOIN tenants t ON t.id = p.tenant_id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
      [req.params.id, req.operador.tenantId]
    );
    if (!p) return res.status(404).json({ erro: 'Protocolo não encontrado' });

    const dataBR = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
    const mascarar = (doc) => {
      const d = String(doc || '').replace(/\D/g, '');
      if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
      if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
      return d ? '—' : '—';
    };

    const urlConsulta = `${PORTAL_URL}/?protocolo=${encodeURIComponent(p.numero)}`;
    const qrDataUrl = await QRCode.toDataURL(urlConsulta, { width: 220, margin: 1 });

    const esc = (s) => String(s ?? '—').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const linha = (rotulo, valor) => `
      <tr><th>${esc(rotulo)}</th><td>${esc(valor)}</td></tr>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante — Protocolo ${esc(p.numero)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:0;padding:32px;background:#f5f5f5}
  .folha{max-width:760px;margin:0 auto;background:#fff;padding:40px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{font-size:12px;color:#555}
  .numero{font-family:ui-monospace,"JetBrains Mono",monospace;font-size:22px;font-weight:700;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{text-align:left;width:190px;padding:8px 12px 8px 0;font-size:12px;color:#555;font-weight:600;vertical-align:top}
  td{padding:8px 0;font-size:14px;border-bottom:1px solid #eee}
  .qr{text-align:center;padding:20px;border:1px dashed #bbb;border-radius:8px}
  .qr img{display:block;margin:0 auto 8px}
  .qr small{color:#555;font-size:11px;word-break:break-all}
  footer{margin-top:28px;padding-top:14px;border-top:1px solid #ddd;font-size:11px;color:#666;line-height:1.6}
  .acoes{max-width:760px;margin:0 auto 16px;text-align:right}
  button{font-size:13px;padding:8px 16px;border:1px solid #111;background:#111;color:#fff;border-radius:6px;cursor:pointer}
  @media print{body{background:#fff;padding:0}.folha{box-shadow:none;padding:0}.acoes{display:none}}
</style></head>
<body>
  <div class="acoes"><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
  <div class="folha">
    <header>
      <div>
        <h1>${esc(p.orgao_nome || 'Protocolo Digital')}</h1>
        <div class="sub">Comprovante de abertura de protocolo</div>
      </div>
      <div style="text-align:right">
        <div class="sub">Protocolo nº</div>
        <div class="numero">${esc(p.numero)}</div>
      </div>
    </header>

    <table>
      ${linha('Solicitante', p.solicitante || (p.externo === false ? 'Protocolo interno' : '—'))}
      ${p.documento ? linha('Documento', mascarar(p.documento)) : ''}
      ${linha('Assunto', p.assunto)}
      ${linha('Serviço', p.servico_nome)}
      ${linha('Descrição', p.descricao)}
      ${linha('Setor responsável', p.setor_nome)}
      ${linha('Situação', p.status_operacional)}
      ${linha('Origem', p.origem)}
      ${linha('Aberto em', dataBR(p.aberto_em))}
      ${linha('Prazo', p.prazo_em ? dataBR(p.prazo_em) : 'Sem prazo definido')}
    </table>

    <div class="qr">
      <img src="${qrDataUrl}" width="180" height="180" alt="QR Code para consulta do protocolo">
      <div style="font-size:12px;margin-bottom:4px">Acompanhe pelo portal do cidadão</div>
      <small>${esc(urlConsulta)}</small>
    </div>

    <footer>
      Documento gerado em ${dataBR(new Date())}. Para acompanhar o andamento, enviar documentos
      e receber respostas, acesse o portal informando o número do protocolo e o código de acesso
      recebido no momento da abertura. O código de acesso é pessoal e não consta neste comprovante.
    </footer>
  </div>
</body></html>`);
  } catch (err) {
    console.error('[GET /protocols/:id/receipt]', err.message);
    res.status(500).json({ erro: 'Erro ao gerar comprovante' });
  }
});

// ─── Auditoria ────────────────────────────────────────────────
router.get('/:id/audit', requirePermission(PERMISSIONS.AUDIT_VIEW), async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }
    const rows = await db.manyOrNone(
      `SELECT a.*, o.nome AS operador_nome
       FROM auditoria a
       LEFT JOIN operadores o ON o.id = a.operador_id
       WHERE a.entidade_id = $1 AND a.tenant_id = $2
       ORDER BY a.criado_em DESC
       LIMIT 100`,
      [req.params.id, req.operador.tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
