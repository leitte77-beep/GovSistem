import db from '../db.js';

export async function buscarOuCriarCidadao(tenantId, {
  nome, nomeSocial, cpf, cnpj, dataNascimento, telefone, email,
  tipoPessoa, contatoId,
}) {
  let cidadao = null;

  if (contatoId) {
    try {
      cidadao = await db.oneOrNone(
        'SELECT * FROM cidadaos WHERE contato_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [contatoId, tenantId]
      );
    } catch { /* contatoId pode não existir na tabela contatos */ }
  }

  if (!cidadao && cpf) {
    cidadao = await db.oneOrNone(
      'SELECT * FROM cidadaos WHERE tenant_id = $1 AND cpf = $2 AND deleted_at IS NULL',
      [tenantId, cpf]
    );
  }

  if (!cidadao && telefone) {
    cidadao = await db.oneOrNone(
      'SELECT * FROM cidadaos WHERE tenant_id = $1 AND telefone = $2 AND deleted_at IS NULL',
      [tenantId, telefone]
    );
  }

  if (cidadao) {
    const updates = [];
    const params = [cidadao.id, tenantId];
    if (nome && nome !== cidadao.nome) {
      updates.push('nome = $3');
      params.push(nome);
    }
    if (nomeSocial !== undefined) {
      updates.push('nome_social = $' + (params.length + 1));
      params.push(nomeSocial);
    }
    if (cpf && cpf !== cidadao.cpf) {
      updates.push('cpf = $' + (params.length + 1));
      params.push(cpf);
    }
    if (telefone && telefone !== cidadao.telefone) {
      updates.push('telefone = $' + (params.length + 1));
      params.push(telefone);
    }
    if (email) {
      updates.push('email = $' + (params.length + 1));
      params.push(email);
    }
    if (contatoId && contatoId !== cidadao.contato_id) {
      updates.push('contato_id = $' + (params.length + 1));
      params.push(contatoId);
    }
    if (updates.length > 0) {
      updates.push('atualizado_em = now()');
      await db.none(
        `UPDATE cidadaos SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2`,
        params
      );
    }
    return db.oneOrNone('SELECT * FROM cidadaos WHERE id = $1', [cidadao.id]);
  }

  const novo = await db.one(
    `INSERT INTO cidadaos
      (tenant_id, contato_id, nome, nome_social, cpf, cnpj, data_nascimento,
       telefone, email, tipo_pessoa)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [tenantId, contatoId || null, nome || 'Não informado', nomeSocial || null,
      cpf || null, cnpj || null, dataNascimento || null,
      telefone || null, email || null, tipoPessoa || 'fisica']
  );

  return novo;
}

export async function buscarCidadaoPorId(tenantId, cidadaoId) {
  return db.oneOrNone(
    `SELECT c.*,
            (SELECT json_agg(json_build_object(
              'id', e.id, 'cep', e.cep, 'logradouro', e.logradouro,
              'numero', e.numero, 'complemento', e.complemento,
              'bairro', e.bairro, 'municipio', e.municipio, 'estado', e.estado
            )) FROM cidadao_enderecos e WHERE e.cidadao_id = c.id) AS enderecos
     FROM cidadaos c
     WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
    [cidadaoId, tenantId]
  );
}

export async function listarCidadaos(tenantId, { busca, limite = 30, pagina = 1 } = {}) {
  const params = [tenantId];
  let where = 'c.tenant_id = $1 AND c.deleted_at IS NULL';
  let idx = 2;

  if (busca) {
    where += ` AND (c.nome ILIKE $${idx} OR c.cpf ILIKE $${idx} OR c.telefone ILIKE $${idx} OR c.email ILIKE $${idx})`;
    params.push(`%${busca}%`);
    idx++;
  }

  const offset = (pagina - 1) * limite;
  params.push(limite, offset);

  return db.manyOrNone(
    `SELECT c.*,
            COUNT(DISTINCT p.id)::int AS total_protocolos
     FROM cidadaos c
     LEFT JOIN protocolos p ON p.contato_id = c.contato_id AND p.tenant_id = c.tenant_id
     WHERE ${where}
     GROUP BY c.id
     ORDER BY c.nome ASC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );
}

export async function criarEndereco(tenantId, cidadaoId, {
  cep, logradouro, numero, complemento, bairro, municipio, estado, principal,
}) {
  if (principal) {
    await db.none(
      `UPDATE cidadao_enderecos SET principal = false
       WHERE cidadao_id = $1 AND tenant_id = $2`,
      [cidadaoId, tenantId]
    );
  }

  return db.one(
    `INSERT INTO cidadao_enderecos
      (tenant_id, cidadao_id, cep, logradouro, numero, complemento, bairro, municipio, estado, principal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [tenantId, cidadaoId, cep, logradouro, numero || null, complemento || null,
      bairro, municipio, estado || 'SP', principal || false]
  );
}

// ──────────────────────────────────────────────
// Conta do cidadão (portal)
// ──────────────────────────────────────────────

export async function criarContaCidadao(tenantId, cidadaoId, email, senha) {
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.default.hash(senha, 10);

  const conta = await db.one(
    `INSERT INTO cidadao_contas
      (tenant_id, cidadao_id, email, senha_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, email) DO NOTHING
     RETURNING *`,
    [tenantId, cidadaoId, email.toLowerCase().trim(), hash]
  );
  return conta;
}

export async function autenticarCidadao(tenantId, email, senha) {
  const bcrypt = await import('bcrypt');
  const conta = await db.oneOrNone(
    `SELECT cc.*, c.nome, c.cpf, c.telefone
     FROM cidadao_contas cc
     JOIN cidadaos c ON c.id = cc.cidadao_id
     WHERE cc.tenant_id = $1 AND cc.email = $2 AND cc.conta_ativa = true`,
    [tenantId, email.toLowerCase().trim()]
  );
  if (!conta) return null;

  const ok = await bcrypt.default.compare(senha, conta.senha_hash);
  if (!ok) return null;

  await db.none(
    `UPDATE cidadao_contas SET ultimo_login_em = now() WHERE id = $1`,
    [conta.id]
  );

  return conta;
}

export async function listarProtocolosDoCidadao(tenantId, cidadaoId) {
  return db.manyOrNone(
    `SELECT p.*, d.nome AS setor_atual_nome,
            (SELECT COUNT(*)::int FROM protocolo_pendencias pp
             WHERE pp.protocolo_id = p.id AND pp.status = 'pendente') AS pendencias_abertas
     FROM protocolos p
     JOIN cidadaos c ON c.contato_id = p.contato_id
     LEFT JOIN departamentos d ON d.id = p.setor_atual_id
     WHERE c.id = $1 AND p.tenant_id = $2 AND p.externo = true AND p.deleted_at IS NULL
     ORDER BY p.aberto_em DESC`,
    [cidadaoId, tenantId]
  );
}
