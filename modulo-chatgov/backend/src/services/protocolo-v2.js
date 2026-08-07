import db from '../db.js';
import { randomBytes } from 'crypto';

// ──────────────────────────────────────────────
// Numeração de protocolo (transacional)
// ──────────────────────────────────────────────

async function gerarNumeroProtocoloNoContexto(conn, tenantId) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');

  const row = await conn.one(
    `INSERT INTO protocolo_sequencias (tenant_id, ano, mes, ultimo_numero)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (tenant_id, ano, mes)
     DO UPDATE SET ultimo_numero = protocolo_sequencias.ultimo_numero + 1
     RETURNING ultimo_numero AS seq`,
    [tenantId, ano, Number(mes)]
  );

  const seq = String(row.seq).padStart(6, '0');
  return `${ano}-${mes}-${seq}`;
}

export async function gerarNumeroProtocolo(tenantId) {
  return db.tx((t) => gerarNumeroProtocoloNoContexto(t, tenantId));
}

// ──────────────────────────────────────────────
// Criação de protocolo
// ──────────────────────────────────────────────

export async function criarProtocolo(tenantId, {
  conversaId, contatoId, cidadaoId, departamentoId, operadorId,
  assunto, descricao, categoria, categoriaId, servicoId, tipoId, origem, prioridade,
  nivelAcesso, externo, prazoDias, prazo, slaRegraId,
  campos = [],
  mensagensSelecionadas = [],
  tags = [],
  observacaoInterna = null,
}) {
  return db.tx(async (t) => {
    const numero = await gerarNumeroProtocoloNoContexto(t, tenantId);

    let prazoEm = null;
    if (prazo) {
      try {
        const d = new Date(prazo);
        if (!isNaN(d.getTime())) prazoEm = d.toISOString();
      } catch {}
    }
    if (!prazoEm && prazoDias) {
      prazoEm = new Date(Date.now() + prazoDias * 24 * 60 * 60 * 1000).toISOString();
    }

    const proto = await t.one(
      `INSERT INTO protocolos (
        tenant_id, uuid_publico, numero, conversa_id, contato_id, cidadao_id,
        departamento_id, setor_atual_id, operador_id, responsavel_id,
        assunto, descricao, categoria, categoria_id, servico_id, tipo_id,
        origem, status, status_operacional, prioridade,
        nivel_acesso, externo, prazo_em, prazo_original_em, sla_regra_id,
        aberto_em, atualizado_em
      ) VALUES (
        $1, gen_random_uuid(), $2, $3, $4, $5,
        $6, $6, $7, $7,
        $8, $9, $10, $11, $12, $13,
        $14, 'aberto', 'ABERTO', $15,
        $16, $17, $18, $18, $19,
        now(), now()
      ) RETURNING *`,
      [
        tenantId, numero, conversaId || null, contatoId || null, cidadaoId || null,
        departamentoId || null, operadorId || null,
        assunto || 'Atendimento geral', descricao || null,
        categoria || null, categoriaId || null, servicoId || null, tipoId || null,
        origem || 'whatsapp', prioridade || 'NORMAL',
        nivelAcesso || 'restrito_cidadao', externo !== false,
        prazoEm, slaRegraId || null,
      ]
    );

    // Movimentação de abertura
    await t.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, setor_destino_id, operador_id,
         status_anterior, status_posterior, observacao, criado_em)
       VALUES ($1, $2, 'abertura', $3, $4, NULL, 'ABERTO', $5, now())`,
      [tenantId, proto.id, departamentoId || null, operadorId || null,
        `Protocolo aberto via ${origem || 'whatsapp'}${assunto ? ': ' + assunto : ''}`
      ]
    );

    // Evento de status
    await t.none(
      `INSERT INTO eventos_status
        (tenant_id, entidade, entidade_id, status_anterior, novo_status,
         operador_id, origem, ip)
       VALUES ($1, 'protocolo', $2, NULL, 'ABERTO', $3, $4, NULL)`,
      [tenantId, proto.id, operadorId || null, origem || 'whatsapp']
    );

    // Campos do formulário
    for (const campo of campos) {
      await t.none(
        `INSERT INTO protocolo_campo_respostas
          (tenant_id, protocolo_id, campo_id, valor)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, proto.id, campo.campo_id, campo.valor]
      );
    }

    // Vincula conversa se informada
    if (conversaId) {
      await t.none(
        `UPDATE conversas SET protocolo_id = $1
         WHERE id = $2 AND tenant_id = $3`,
        [proto.id, conversaId, tenantId]
      );
    }

    // Mensagens selecionadas da conversa
    if (conversaId && mensagensSelecionadas.length > 0) {
      for (const msgId of mensagensSelecionadas) {
        await t.none(
          `UPDATE mensagens SET protocolo_id = $1
           WHERE id = $2 AND conversa_id = $3 AND tenant_id = $4`,
          [proto.id, msgId, conversaId, tenantId]
        );
      }
    }

    // Participante
    if (operadorId) {
      await t.none(
        `INSERT INTO protocolo_participantes (protocolo_id, operador_id, tenant_id, papel)
         VALUES ($1, $2, $3, 'responsavel') ON CONFLICT DO NOTHING`,
        [proto.id, operadorId, tenantId]
      );
    }

    // Tags
    if (tags.length > 0) {
      for (const tagName of tags) {
        const tag = typeof tagName === 'string' ? tagName.trim() : String(tagName).trim();
        if (!tag) continue;
        let etiqueta = await t.oneOrNone(
          `SELECT id FROM protocolo_etiquetas WHERE nome = $1 AND tenant_id = $2`,
          [tag, tenantId]
        );
        if (!etiqueta) {
          etiqueta = await t.one(
            `INSERT INTO protocolo_etiquetas (id, tenant_id, nome, ativo) VALUES (gen_random_uuid(), $1, $2, true) RETURNING id`,
            [tenantId, tag]
          );
        }
        await t.none(
          `INSERT INTO protocolo_etiqueta_relacoes (protocolo_id, etiqueta_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [proto.id, etiqueta.id, tenantId]
        );
      }
    }

    // Observação interna
    if (observacaoInterna) {
      await t.none(
        `INSERT INTO protocolo_anotacoes (tenant_id, protocolo_id, operador_id, tipo, conteudo, criado_em)
         VALUES ($1, $2, $3, 'anotacao', $4, now())`,
        [tenantId, proto.id, operadorId, observacaoInterna]
      );
    }

    return proto;
  });
}

// ──────────────────────────────────────────────
// Geração de senha de acesso
// ──────────────────────────────────────────────

function gerarSenhaAcesso(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let senha = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    senha += chars[bytes[i] % chars.length];
  }
  return senha;
}

export async function gerarCredencialAcesso(tenantId, protocoloId, senhaPlana) {
  const bcrypt = await import('bcrypt');
  const senha = senhaPlana || gerarSenhaAcesso();
  const hash = await bcrypt.default.hash(senha, 10);

  await db.none(
    `INSERT INTO protocolo_credenciais
      (tenant_id, protocolo_id, acesso_hash, tipo, tentativas_restantes)
     VALUES ($1, $2, $3, 'senha', 5)
     ON CONFLICT (tenant_id, protocolo_id)
     DO UPDATE SET acesso_hash = $3, tentativas_restantes = 5,
                   bloqueado_ate = NULL, redefinido_em = now()`,
    [tenantId, protocoloId, hash]
  );

  return senha;
}

export async function validarCredencial(tenantId, protocoloId, senha) {
  const bcrypt = await import('bcrypt');
  const cred = await db.oneOrNone(
    `SELECT * FROM protocolo_credenciais
     WHERE tenant_id = $1 AND protocolo_id = $2`,
    [tenantId, protocoloId]
  );
  if (!cred) return { valido: false, motivo: 'credencial_nao_encontrada' };
  if (cred.bloqueado_ate && new Date(cred.bloqueado_ate) > new Date()) {
    return { valido: false, motivo: 'bloqueado', bloqueado_ate: cred.bloqueado_ate };
  }
  const ok = await bcrypt.default.compare(senha, cred.acesso_hash);
  if (!ok) {
    const restantes = cred.tentativas_restantes - 1;
    if (restantes <= 0) {
      await db.none(
        `UPDATE protocolo_credenciais
         SET tentativas_restantes = 0,
             bloqueado_ate = now() + interval '30 minutes'
         WHERE id = $1`,
        [cred.id]
      );
    } else {
      await db.none(
        `UPDATE protocolo_credenciais SET tentativas_restantes = $1 WHERE id = $2`,
        [restantes, cred.id]
      );
    }
    return { valido: false, motivo: 'senha_invalida', tentativas_restantes: restantes };
  }
  await db.none(
    `UPDATE protocolo_credenciais SET tentativas_restantes = 5, bloqueado_ate = NULL WHERE id = $1`,
    [cred.id]
  );
  return { valido: true };
}

/**
 * Resolve qual protocolo corresponde a um número + código de acesso.
 *
 * A numeração é sequencial por tenant, então o mesmo número existe em vários
 * municípios ao mesmo tempo. No portal de domínio compartilhado, escolher o
 * primeiro candidato faria a validação falhar contra o protocolo errado —
 * quem desambigua é o código de acesso, não o número.
 *
 * Só decrementa tentativas das credenciais efetivamente testadas e, quando o
 * código não confere em nenhuma, penaliza todos os candidatos para que a
 * proteção contra força bruta continue valendo.
 */
export async function resolverProtocoloPorNumero(numero, senha, { tenantId = null } = {}) {
  const bcrypt = await import('bcrypt');

  const candidatos = await db.manyOrNone(
    `SELECT p.id, p.tenant_id, p.uuid_publico, c.id AS cred_id,
            c.acesso_hash, c.tentativas_restantes, c.bloqueado_ate, c.expira_em
     FROM protocolos p
     JOIN tenants t ON t.id = p.tenant_id AND t.ativo = true
     JOIN protocolo_credenciais c ON c.protocolo_id = p.id AND c.tenant_id = p.tenant_id
     WHERE p.numero = $1 AND p.deleted_at IS NULL
       AND ($2::uuid IS NULL OR p.tenant_id = $2)`,
    [numero, tenantId]
  );

  if (candidatos.length === 0) return { valido: false, motivo: 'nao_encontrado' };

  const agora = new Date();
  const testaveis = candidatos.filter((c) => !(c.bloqueado_ate && new Date(c.bloqueado_ate) > agora));

  if (testaveis.length === 0) {
    return { valido: false, motivo: 'bloqueado', bloqueado_ate: candidatos[0].bloqueado_ate };
  }

  for (const cand of testaveis) {
    const confere = await bcrypt.default.compare(senha, cand.acesso_hash);
    if (!confere) continue;

    if (cand.expira_em && new Date(cand.expira_em) < agora) {
      return { valido: false, motivo: 'expirado' };
    }

    await db.none(
      `UPDATE protocolo_credenciais
       SET tentativas_restantes = 5, bloqueado_ate = NULL WHERE id = $1`,
      [cand.cred_id]
    );
    return {
      valido: true,
      protocoloId: cand.id,
      tenantId: cand.tenant_id,
      uuidPublico: cand.uuid_publico,
    };
  }

  // Não conferiu em nenhum candidato: consome uma tentativa de cada um.
  const ids = testaveis.map((c) => c.cred_id);
  await db.none(
    `UPDATE protocolo_credenciais
     SET tentativas_restantes = GREATEST(tentativas_restantes - 1, 0),
         bloqueado_ate = CASE WHEN tentativas_restantes - 1 <= 0
                              THEN now() + interval '30 minutes' ELSE bloqueado_ate END
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  const restantes = Math.max(Math.min(...testaveis.map((c) => c.tentativas_restantes)) - 1, 0);
  return { valido: false, motivo: 'senha_invalida', tentativas_restantes: restantes };
}

// ──────────────────────────────────────────────
// Sessão pública
// ──────────────────────────────────────────────

export async function criarSessaoPublica(tenantId, protocoloId, cidadaoContaId, ip, userAgent) {
  const { v4: uuidv4 } = await import('uuid');
  const token = uuidv4();
  const row = await db.one(
    `INSERT INTO protocolo_sessoes_acesso
      (tenant_id, protocolo_id, cidadao_conta_id, token, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, protocoloId, cidadaoContaId || null, token, ip || null, userAgent || null]
  );
  return row;
}

export async function validarSessaoPublica(tenantId, token) {
  let query, params;
  if (tenantId) {
    query = `SELECT * FROM protocolo_sessoes_acesso
     WHERE tenant_id = $1 AND token = $2 AND expira_em > now()`;
    params = [tenantId, token];
  } else {
    query = `SELECT * FROM protocolo_sessoes_acesso
     WHERE token = $1 AND expira_em > now()`;
    params = [token];
  }
  const row = await db.oneOrNone(query, params);
  return row;
}

// ──────────────────────────────────────────────
// Consultas
// ──────────────────────────────────────────────

export async function listarProtocolos(tenantId, {
  status, departamentoId, responsavelId, busca, origem, prioridade,
  prazoAte, atrasados, proximosPrazo, semResponsavel, comPendencia,
  setorId, servicoId, categoria, externo,
  limite = 30, pagina = 1, offset: offsetExplicito,
} = {}) {
  const params = [tenantId];
  let where = 'p.tenant_id = $1 AND p.deleted_at IS NULL';
  let idx = 2;

  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    where += ` AND p.status_operacional = ANY($${idx++})`;
    params.push(statuses);
  }
  if (departamentoId) {
    where += ` AND p.departamento_id = $${idx++}`;
    params.push(departamentoId);
  }
  if (setorId) {
    where += ` AND p.setor_atual_id = $${idx++}`;
    params.push(setorId);
  }
  if (responsavelId) {
    where += ` AND p.responsavel_id = $${idx++}`;
    params.push(responsavelId);
  }
  if (origem) {
    where += ` AND p.origem = $${idx++}`;
    params.push(origem);
  }
  if (prioridade) {
    where += ` AND p.prioridade = $${idx++}`;
    params.push(prioridade);
  }
  if (servicoId) {
    where += ` AND p.servico_id = $${idx++}`;
    params.push(servicoId);
  }
  if (categoria) {
    where += ` AND p.categoria = $${idx++}`;
    params.push(categoria);
  }
  if (externo !== undefined) {
    where += ` AND p.externo = $${idx++}`;
    params.push(externo);
  }
  if (atrasados) {
    where += ` AND p.prazo_em < now() AND p.status_operacional NOT IN ('CONCLUIDO','CANCELADO')`;
  }
  if (proximosPrazo) {
    // Vence nas próximas 48h e ainda não venceu.
    where += ` AND p.prazo_em >= now() AND p.prazo_em <= now() + interval '48 hours'
               AND p.status_operacional NOT IN ('CONCLUIDO','CANCELADO')`;
  }
  if (semResponsavel) {
    where += ` AND p.responsavel_id IS NULL`;
  }
  if (comPendencia) {
    where += ` AND EXISTS (SELECT 1 FROM protocolo_pendencias pp
                           WHERE pp.protocolo_id = p.id AND pp.status = 'pendente')`;
  }
  if (prazoAte) {
    where += ` AND p.prazo_em <= $${idx++}`;
    params.push(prazoAte);
  }
  if (busca) {
    where += ` AND (
      p.numero ILIKE $${idx}
      OR p.assunto ILIKE $${idx}
      OR p.descricao ILIKE $${idx}
      OR EXISTS (
        SELECT 1 FROM contatos c WHERE c.id = p.contato_id
        AND (c.nome ILIKE $${idx} OR c.telefone ILIKE $${idx} OR c.cpf ILIKE $${idx})
      )
      OR EXISTS (
        SELECT 1 FROM cidadaos cd WHERE cd.id = p.cidadao_id
        AND (cd.nome ILIKE $${idx} OR cd.nome_social ILIKE $${idx}
             OR cd.telefone ILIKE $${idx} OR cd.cpf ILIKE $${idx}
             OR cd.cnpj ILIKE $${idx} OR cd.email ILIKE $${idx})
      )
      OR EXISTS (
        SELECT 1 FROM departamentos dp WHERE dp.id = p.setor_atual_id AND dp.nome ILIKE $${idx}
      )
      OR EXISTS (
        SELECT 1 FROM operadores opr WHERE opr.id = p.responsavel_id AND opr.nome ILIKE $${idx}
      )
      OR EXISTS (
        SELECT 1 FROM protocolo_servicos sve WHERE sve.id = p.servico_id AND sve.nome ILIKE $${idx}
      )
    )`;
    params.push(`%${busca}%`);
    idx++;
  }

  // Total real da consulta filtrada — não do que coube na página.
  const totalRow = await db.one(
    `SELECT COUNT(*)::int AS total FROM protocolos p WHERE ${where}`,
    params
  );

  const offset = offsetExplicito !== undefined && offsetExplicito !== null
    ? Math.max(0, Number(offsetExplicito) || 0)
    : (pagina - 1) * limite;
  params.push(limite, offset);

  const rows = await db.manyOrNone(
    `SELECT p.*, co.nome AS contato_nome, co.telefone AS contato_telefone, co.cpf AS contato_cpf,
            cid.nome AS cidadao_nome, cid.nome_social AS cidadao_nome_social,
            cid.cpf AS cidadao_cpf, cid.cnpj AS cidadao_cnpj,
            cid.telefone AS cidadao_telefone,
            COALESCE(cid.nome_social, cid.nome, co.nome) AS solicitante_nome,
            COALESCE(cid.cpf, cid.cnpj, co.cpf) AS solicitante_documento,
            d.nome AS departamento_nome, d.cor AS departamento_cor,
            s.nome AS setor_atual_nome,
            o.nome AS operador_nome, r.nome AS responsavel_nome,
            sv.nome AS servico_nome,
            (SELECT COUNT(*)::int FROM protocolo_pendencias pp
             WHERE pp.protocolo_id = p.id AND pp.status = 'pendente') AS pendencias_abertas,
            (SELECT COUNT(*)::int FROM protocolo_documentos pd
             WHERE pd.protocolo_id = p.id AND pd.status = 'aguardando_analise') AS docs_novos,
            (SELECT mv.criado_em FROM protocolo_movimentacoes mv
             WHERE mv.protocolo_id = p.id ORDER BY mv.criado_em DESC LIMIT 1) AS ultima_movimentacao_em,
            (SELECT mv.tipo FROM protocolo_movimentacoes mv
             WHERE mv.protocolo_id = p.id ORDER BY mv.criado_em DESC LIMIT 1) AS ultima_movimentacao_tipo,
            (SELECT COUNT(*)::int FROM protocolo_mensagens pm
             WHERE pm.protocolo_id = p.id AND pm.direcao = 'entrada' AND pm.lida = false) AS msgs_nao_lidas
     FROM protocolos p
     LEFT JOIN cidadaos cid ON cid.id = p.cidadao_id
     LEFT JOIN contatos co ON co.id = p.contato_id
     LEFT JOIN departamentos d ON d.id = p.departamento_id
     LEFT JOIN departamentos s ON s.id = p.setor_atual_id
     LEFT JOIN operadores o ON o.id = p.operador_id
     LEFT JOIN operadores r ON r.id = p.responsavel_id
     LEFT JOIN protocolo_servicos sv ON sv.id = p.servico_id
     WHERE ${where}
     ORDER BY p.atualizado_em DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return { data: rows, total: totalRow.total, limite, offset };
}

export async function consultarProtocoloDetalhado(tenantId, protocoloId) {
  const proto = await db.oneOrNone(
    `SELECT p.*, co.nome AS contato_nome, co.telefone AS contato_telefone,
            co.cpf AS contato_cpf,
            d.nome AS departamento_nome, d.cor AS departamento_cor,
            s.nome AS setor_atual_nome,
            o.nome AS operador_nome, r.nome AS responsavel_nome,
            sv.nome AS servico_nome, sv.descricao AS servico_descricao,
            tp.nome AS tipo_nome,
            cid.nome AS cidadao_nome, cid.cpf AS cidadao_cpf
     FROM protocolos p
     LEFT JOIN contatos co ON co.id = p.contato_id
     LEFT JOIN departamentos d ON d.id = p.departamento_id
     LEFT JOIN departamentos s ON s.id = p.setor_atual_id
     LEFT JOIN operadores o ON o.id = p.operador_id
     LEFT JOIN operadores r ON r.id = p.responsavel_id
     LEFT JOIN protocolo_servicos sv ON sv.id = p.servico_id
     LEFT JOIN protocolo_tipos tp ON tp.id = p.tipo_id
      LEFT JOIN cidadaos cid ON cid.id = p.cidadao_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [protocoloId, tenantId]
  );
  if (!proto) return null;

  const [
    movimentacoes, mensagens, anotacoes, documentos,
    pendencias, credencial,
  ] = await Promise.all([
    db.manyOrNone(
      `SELECT m.*, o.nome AS operador_nome, so.nome AS setor_origem_nome,
              sd.nome AS setor_destino_nome
       FROM protocolo_movimentacoes m
       LEFT JOIN operadores o ON o.id = m.operador_id
       LEFT JOIN departamentos so ON so.id = m.setor_origem_id
       LEFT JOIN departamentos sd ON sd.id = m.setor_destino_id
       WHERE m.protocolo_id = $1
       ORDER BY m.criado_em DESC`,
      [protocoloId]
    ),
    db.manyOrNone(
      `SELECT m.*, o.nome AS operador_nome
       FROM protocolo_mensagens m
       LEFT JOIN operadores o ON o.id = m.operador_id
       WHERE m.protocolo_id = $1
       ORDER BY m.criado_em ASC`,
      [protocoloId]
    ),
    db.manyOrNone(
      `SELECT a.*, o.nome AS operador_nome
       FROM protocolo_anotacoes a
       LEFT JOIN operadores o ON o.id = a.operador_id
       WHERE a.protocolo_id = $1
       ORDER BY a.criado_em DESC`,
      [protocoloId]
    ),
    db.manyOrNone(
      `SELECT d.*, dv.sha256 AS versao_sha256, dv.tamanho_bytes AS versao_tamanho,
              o.nome AS enviado_por_nome
       FROM protocolo_documentos d
       LEFT JOIN protocolo_documento_versoes dv ON dv.id = d.versao_atual_id
       LEFT JOIN operadores o ON o.id = d.enviado_por
       WHERE d.protocolo_id = $1
       ORDER BY d.criado_em DESC`,
      [protocoloId]
    ),
    db.manyOrNone(
      `SELECT pp.*, o.nome AS criado_por_nome
       FROM protocolo_pendencias pp
       LEFT JOIN operadores o ON o.id = pp.criado_por
       WHERE pp.protocolo_id = $1
       ORDER BY pp.criado_em DESC`,
      [protocoloId]
    ),
    db.oneOrNone(
      `SELECT 1 AS tem_senha, tentativas_restantes, bloqueado_ate
       FROM protocolo_credenciais
       WHERE protocolo_id = $1 AND tenant_id = $2`,
      [protocoloId, tenantId]
    ),
  ]);

  return {
    ...proto,
    movimentacoes,
    mensagens,
    anotacoes,
    documentos,
    pendencias,
    tem_credencial: !!credencial,
  };
}

// ──────────────────────────────────────────────
// Tramitação
// ──────────────────────────────────────────────

export async function tramitarProtocolo(tenantId, protocoloId, {
  tipo, setorDestinoId, operadorId, observacao, justificativa,
  statusAnterior, statusPosterior,
}) {
  return db.tx(async (t) => {
    const proto = await t.oneOrNone(
      'SELECT * FROM protocolos WHERE id = $1 AND tenant_id = $2',
      [protocoloId, tenantId]
    );
    if (!proto) throw new Error('Protocolo não encontrado');

    const atual = statusAnterior || proto.status_operacional;
    const novo = statusPosterior || atual;

    await t.none(
      `INSERT INTO protocolo_movimentacoes
        (tenant_id, protocolo_id, tipo, setor_origem_id, setor_destino_id,
         operador_id, status_anterior, status_posterior, observacao, justificativa, criado_em)
       VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, now())`,
      [tenantId, protocoloId, tipo, proto.setor_atual_id, setorDestinoId || null,
        operadorId, atual, novo, observacao || null, justificativa || null]
    );

    // Os valores são passados como parâmetros: interpolá-los direto no SQL
    // quebrava com UUID (o setor vinha sem aspas) e abria espaço para injeção.
    const sets = ['atualizado_em = now()'];
    const params = [protocoloId, tenantId];
    const push = (coluna, valor) => {
      params.push(valor);
      sets.push(`${coluna} = $${params.length}`);
    };

    if (setorDestinoId) push('setor_atual_id', setorDestinoId);

    if (tipo === 'conclusao') {
      push('status', 'concluido');
      push('status_operacional', 'CONCLUIDO');
      sets.push('resolvido_em = now()');
    }
    if (tipo === 'cancelamento') {
      push('status', 'cancelado');
      push('status_operacional', 'CANCELADO');
      sets.push('cancelado_em = now()');
    }
    if (tipo === 'reabertura') {
      push('status', 'em_andamento');
      push('status_operacional', 'EM_ANDAMENTO');
      sets.push('reaberto_em = now()');
    }

    const updated = await t.one(
      `UPDATE protocolos SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      params
    );

    return updated;
  });
}

// ──────────────────────────────────────────────
// Mensagens públicas
// ──────────────────────────────────────────────

export async function enviarMensagemPublica(tenantId, protocoloId, {
  operadorId, conteudo, temAnexo,
}) {
  const msg = await db.one(
    `INSERT INTO protocolo_mensagens
      (tenant_id, protocolo_id, direcao, operador_id, conteudo, tem_anexo)
     VALUES ($1, $2, 'saida', $3, $4, $5)
     RETURNING *`,
    [tenantId, protocoloId, operadorId || null, conteudo, temAnexo || false]
  );

  await db.none(
    `UPDATE protocolos SET atualizado_em = now() WHERE id = $1 AND tenant_id = $2`,
    [protocoloId, tenantId]
  );

  return msg;
}

export async function criarAnotacaoInterna(tenantId, protocoloId, {
  operadorId, conteudo, tipo,
}) {
  const anot = await db.one(
    `INSERT INTO protocolo_anotacoes
      (tenant_id, protocolo_id, operador_id, tipo, conteudo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, protocoloId, operadorId, tipo || 'anotacao', conteudo]
  );
  return anot;
}

// ──────────────────────────────────────────────
// Pendências
// ──────────────────────────────────────────────

export async function criarPendencia(tenantId, protocoloId, {
  titulo, descricao, tipo, prazoDias, criadoPor,
}) {
  const prazoEm = prazoDias
    ? new Date(Date.now() + prazoDias * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const pend = await db.one(
    `INSERT INTO protocolo_pendencias
      (tenant_id, protocolo_id, titulo, descricao, tipo, prazo_em, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, protocoloId, titulo, descricao || null, tipo || 'documento',
      prazoEm, criadoPor || null]
  );

  await db.none(
    `UPDATE protocolos SET status_operacional = 'PENDENTE',
           atualizado_em = now()
     WHERE id = $1 AND tenant_id = $2`,
    [protocoloId, tenantId]
  );

  return pend;
}

export async function resolverPendencia(tenantId, pendenciaId) {
  const pend = await db.oneOrNone(
    `UPDATE protocolo_pendencias
     SET status = 'resolvida', resolvido_em = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [pendenciaId, tenantId]
  );
  if (!pend) throw new Error('Pendência não encontrada');

  const abertas = await db.oneOrNone(
    `SELECT COUNT(*)::int AS cnt FROM protocolo_pendencias
     WHERE protocolo_id = $1 AND status = 'pendente'`,
    [pend.protocolo_id]
  );
  if (abertas && abertas.cnt === 0) {
    await db.none(
      `UPDATE protocolos SET status_operacional = 'EM_ANDAMENTO',
             atualizado_em = now()
       WHERE id = $1 AND tenant_id = $2`,
      [pend.protocolo_id, tenantId]
    );
  }

  return pend;
}

// ──────────────────────────────────────────────
// Documentos
// ──────────────────────────────────────────────

export async function registrarDocumento(tenantId, protocoloId, {
  nomeAmigavel, nomeInterno, mimeType, tamanhoBytes, sha256,
  tipoDocumental, status, nivelAcesso, origem, pendenciaId,
  enviadoPor, dataDocumento, autor, departamentoId,
}) {
  const doc = await db.one(
    `INSERT INTO protocolo_documentos
      (tenant_id, protocolo_id, pendencia_id, nome_amigavel, nome_interno,
       mime_type, tamanho_bytes, sha256, tipo_documental, status,
       nivel_acesso, origem, enviado_por, data_documento, autor,
       departamento_id, versao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1)
     RETURNING *`,
    [tenantId, protocoloId, pendenciaId || null, nomeAmigavel, nomeInterno,
      mimeType, tamanhoBytes, sha256 || null, tipoDocumental || null,
      status || 'recebido', nivelAcesso || 'restrito_cidadao',
      origem || 'interno', enviadoPor || null, dataDocumento || null,
      autor || null, departamentoId || null]
  );

  await db.none(
    `INSERT INTO protocolo_documento_versoes
      (tenant_id, documento_id, versao, nome_interno, tamanho_bytes, sha256, criado_por)
     VALUES ($1, $2, 1, $3, $4, $5, $6)`,
    [tenantId, doc.id, nomeInterno, tamanhoBytes, sha256 || null, enviadoPor || null]
  );

  // Atualiza versao_atual_id
  const versao = await db.oneOrNone(
    `SELECT id FROM protocolo_documento_versoes
     WHERE documento_id = $1 AND versao = 1`,
    [doc.id]
  );
  if (versao) {
    await db.none(
      `UPDATE protocolo_documentos SET versao_atual_id = $1 WHERE id = $2`,
      [versao.id, doc.id]
    );
  }

  await db.none(
    `UPDATE protocolos SET atualizado_em = now() WHERE id = $1 AND tenant_id = $2`,
    [protocoloId, tenantId]
  );

  return doc;
}

const STATUS_DOC_VALIDOS = Object.freeze([
  'recebido', 'aguardando_analise', 'aprovado', 'rejeitado',
  'liberado_cidadao', 'arquivado',
]);

export async function alterarStatusDocumento(tenantId, documentoId, {
  status, rejeitadoMotivo, liberadoEm, nivelAcesso,
}) {
  if (status && !STATUS_DOC_VALIDOS.includes(status)) {
    throw new Error(`Status de documento inválido: ${status}`);
  }
  if (status === 'rejeitado' && !String(rejeitadoMotivo || '').trim()) {
    throw new Error('Informe o motivo da rejeição do documento.');
  }

  const sets = ['atualizado_em = now()'];
  const params = [documentoId, tenantId];
  const push = (coluna, valor) => {
    params.push(valor);
    sets.push(`${coluna} = $${params.length}`);
  };

  if (status) push('status', status);
  // Só sobrescreve o motivo quando ele é informado — antes, qualquer mudança
  // de status apagava a justificativa de uma rejeição anterior.
  if (rejeitadoMotivo !== undefined) push('rejeitado_motivo', rejeitadoMotivo || null);
  if (nivelAcesso) push('nivel_acesso', nivelAcesso);

  // Liberar ao cidadão precisa carimbar a data e garantir que o documento
  // fique de fato visível — sem isso ele ficava "liberado" mas inacessível.
  if (status === 'liberado_cidadao') {
    sets.push('liberado_em = COALESCE(liberado_em, now())');
    if (!nivelAcesso) push('nivel_acesso', 'restrito_cidadao');
  } else if (liberadoEm) {
    push('liberado_em', liberadoEm);
  }

  const doc = await db.oneOrNone(
    `UPDATE protocolo_documentos
     SET ${sets.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    params
  );
  if (!doc) throw new Error('Documento não encontrado');

  return doc;
}

// Critério único de "documento visível ao cidadão" — usado tanto na
// listagem quanto no download, para que não divirjam.
export const SQL_DOC_VISIVEL_CIDADAO = `
  d.nivel_acesso IN ('publico','restrito_cidadao')
  AND d.status IN ('liberado_cidadao','aprovado')
`;

export async function listarDocumentosProtocolo(tenantId, protocoloId, { publicos = false } = {}) {
  let where = 'd.protocolo_id = $2 AND d.tenant_id = $1';
  if (publicos) {
    where += ` AND ${SQL_DOC_VISIVEL_CIDADAO}`;
  }

  // nome_interno é o caminho físico no storage e nunca deve sair para o
  // portal; na visão pública devolvemos apenas o que a tela precisa.
  const colunas = publicos
    ? `d.id, d.protocolo_id, d.nome_amigavel, d.mime_type, d.tamanho_bytes,
       d.tipo_documental, d.status, d.versao, d.criado_em, d.liberado_em`
    : `d.*, o.nome AS enviado_por_nome`;

  return db.manyOrNone(
    `SELECT ${colunas}
     FROM protocolo_documentos d
     LEFT JOIN operadores o ON o.id = d.enviado_por
     WHERE ${where}
     ORDER BY d.criado_em DESC`,
    [tenantId, protocoloId]
  );
}

export function documentoVisivelAoCidadao(doc) {
  if (!doc) return false;
  return ['publico', 'restrito_cidadao'].includes(doc.nivel_acesso)
    && ['liberado_cidadao', 'aprovado'].includes(doc.status);
}

// ──────────────────────────────────────────────
// Status e SLA
// ──────────────────────────────────────────────

export async function atualizarStatusProtocolo(tenantId, protocoloId, {
  statusOperacional, operadorId, justificativa, observacao,
}) {
  const proto = await db.oneOrNone(
    `SELECT * FROM protocolos WHERE id = $1 AND tenant_id = $2`,
    [protocoloId, tenantId]
  );
  if (!proto) throw new Error('Protocolo não encontrado');

  const anterior = proto.status_operacional;

  const updates = {
    status_operacional: statusOperacional,
    atualizado_em: new Date().toISOString(),
  };

  if (statusOperacional === 'CONCLUIDO') {
    updates.resolvido_em = new Date().toISOString();
    updates.status = 'concluido';
  } else if (statusOperacional === 'CANCELADO') {
    updates.cancelado_em = new Date().toISOString();
    updates.status = 'cancelado';
  }

  const setClauses = [];
  const params = [protocoloId, tenantId];
  let idx = 3;

  for (const [k, v] of Object.entries(updates)) {
    setClauses.push(`${k} = $${idx++}`);
    params.push(v);
  }

  const updated = await db.oneOrNone(
    `UPDATE protocolos SET ${setClauses.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    params
  );

  await db.none(
    `INSERT INTO eventos_status
      (tenant_id, entidade, entidade_id, status_anterior, novo_status, operador_id, justificativa)
     VALUES ($1, 'protocolo', $2, $3, $4, $5, $6)`,
    [tenantId, protocoloId, anterior, statusOperacional, operadorId || null, justificativa || null]
  );

  return updated;
}

// ──────────────────────────────────────────────
// Relacionamentos
// ──────────────────────────────────────────────

export async function vincularProtocolo(tenantId, protocoloOrigemId, protocoloDestinoId, tipo) {
  const rel = await db.one(
    `INSERT INTO protocolo_relacoes
      (tenant_id, protocolo_origem_id, protocolo_destino_id, tipo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, protocolo_origem_id, protocolo_destino_id, tipo) DO NOTHING
     RETURNING *`,
    [tenantId, protocoloOrigemId, protocoloDestinoId, tipo || 'complementar']
  );
  return rel;
}

export async function listarRelacionamentos(tenantId, protocoloId) {
  return db.manyOrNone(
    `SELECT r.*, p.numero AS protocolo_destino_numero, p.assunto AS protocolo_destino_assunto,
            p.status_operacional AS protocolo_destino_status
     FROM protocolo_relacoes r
     JOIN protocolos p ON p.id = r.protocolo_destino_id
     WHERE r.protocolo_origem_id = $1 AND r.tenant_id = $2
     UNION ALL
     SELECT r.*, p.numero AS protocolo_destino_numero, p.assunto AS protocolo_destino_assunto,
            p.status_operacional AS protocolo_destino_status
     FROM protocolo_relacoes r
     JOIN protocolos p ON p.id = r.protocolo_origem_id
     WHERE r.protocolo_destino_id = $1 AND r.tenant_id = $2
     ORDER BY criado_em DESC`,
    [protocoloId, tenantId]
  );
}

// ──────────────────────────────────────────────
// Notificações (enfileiramento)
// ──────────────────────────────────────────────

export async function enfileirarNotificacao(tenantId, protocoloId, {
  canal, destinatario, templateId, assunto, conteudo,
}) {
  const notif = await db.one(
    `INSERT INTO protocolo_notificacoes
      (tenant_id, protocolo_id, canal, destinatario, template_id, assunto, conteudo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, protocoloId, canal, destinatario, templateId || null, assunto || null, conteudo]
  );
  return notif;
}

export async function listarNotificacoesPendentes(tenantId, limite = 50) {
  return db.manyOrNone(
    `SELECT * FROM protocolo_notificacoes
     WHERE tenant_id = $1 AND status_envio = 'pendente'
     ORDER BY criado_em ASC
     LIMIT $2`,
    [tenantId, limite]
  );
}

export async function atualizarStatusNotificacao(notifId, { statusEnvio, provedorId, falhaDetalhe }) {
  return db.none(
    `UPDATE protocolo_notificacoes
     SET status_envio = $1, provedor_id = $2, falha_detalhe = $3,
         tentativas = tentativas + 1, ultima_tentativa_em = now(),
         enviado_em = CASE WHEN $1 = 'enviado' THEN now() ELSE enviado_em END
     WHERE id = $4`,
    [statusEnvio, provedorId || null, falhaDetalhe || null, notifId]
  );
}

// ──────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────

export async function dashboardProtocolos(tenantId, { departamentoId } = {}) {
  const params = [tenantId];
  let filtroDepto = '';
  if (departamentoId) {
    filtroDepto = ' AND (p.departamento_id = $2 OR p.setor_atual_id = $2)';
    params.push(departamentoId);
  }

  const [totais, porStatus, porOrigem, porSetor, atrasados, tempoMedio] = await Promise.all([
    db.one(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.status_operacional NOT IN ('CONCLUIDO','CANCELADO','ARQUIVADO'))::int AS abertos,
        COUNT(*) FILTER (WHERE p.status_operacional = 'ABERTO')::int AS aguardando_triagem,
        COUNT(*) FILTER (WHERE p.status_operacional = 'EM_ANDAMENTO')::int AS em_andamento,
        COUNT(*) FILTER (WHERE p.status_operacional = 'PENDENTE')::int AS pendentes,
        COUNT(*) FILTER (WHERE p.status_operacional IN ('CONCLUIDO','CANCELADO'))::int AS concluidos,
        COUNT(*) FILTER (WHERE p.prazo_em < now() AND p.status_operacional NOT IN ('CONCLUIDO','CANCELADO','ARQUIVADO'))::int AS atrasados
       FROM protocolos p
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL${filtroDepto}`,
      params
    ),
    db.manyOrNone(
      `SELECT p.status_operacional AS status, COUNT(*)::int AS total
       FROM protocolos p
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL${filtroDepto}
       GROUP BY p.status_operacional
       ORDER BY total DESC`,
      params
    ),
    db.manyOrNone(
      `SELECT p.origem, COUNT(*)::int AS total
       FROM protocolos p
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL${filtroDepto}
       GROUP BY p.origem
       ORDER BY total DESC`,
      params
    ),
    db.manyOrNone(
      `SELECT d.nome AS setor, COUNT(*)::int AS total
       FROM protocolos p
       LEFT JOIN departamentos d ON d.id = p.setor_atual_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL${filtroDepto}
       GROUP BY d.nome
       ORDER BY total DESC
       LIMIT 10`,
      params
    ),
    db.manyOrNone(
      `SELECT p.id, p.numero, p.assunto, p.prazo_em,
              d.nome AS setor_atual_nome, r.nome AS responsavel_nome
       FROM protocolos p
       LEFT JOIN departamentos d ON d.id = p.setor_atual_id
       LEFT JOIN operadores r ON r.id = p.responsavel_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
         AND p.prazo_em < now()
         AND p.status_operacional NOT IN ('CONCLUIDO','CANCELADO','ARQUIVADO')
         ${filtroDepto}
       ORDER BY p.prazo_em ASC
       LIMIT 20`,
      params
    ),
    db.one(
      `SELECT
        AVG(EXTRACT(EPOCH FROM (p.resolvido_em - p.aberto_em))/3600)::numeric(10,1) AS horas_medio
       FROM protocolos p
       WHERE p.tenant_id = $1 AND p.resolvido_em IS NOT NULL${filtroDepto}`,
      params
    ),
  ]);

  return { totais, porStatus, porOrigem, porSetor, atrasados, tempoMedio };
}
