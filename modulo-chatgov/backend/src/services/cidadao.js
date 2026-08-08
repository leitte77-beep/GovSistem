import db from '../db.js';
import crypto from 'crypto';

function gerarCodigo() {
  return crypto.randomInt(100000, 999999).toString();
}

export async function buscarOuCriarCidadao(tenantId, {
  nome, nomeSocial, cpf, cnpj, dataNascimento, telefone, email,
  tipoPessoa, contatoId, casarPorEmail = false,
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

  // Só no cadastro do portal: e-mail é o identificador da conta, então casar
  // por ele evita duplicar quem já apareceu por outro canal. Em solicitação
  // avulsa não vale, porque a família costuma compartilhar um e-mail.
  if (!cidadao && casarPorEmail && email) {
    cidadao = await db.oneOrNone(
      'SELECT * FROM cidadaos WHERE tenant_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL ORDER BY criado_em LIMIT 1',
      [tenantId, email]
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

export async function buscarContaPorEmail(tenantId, email) {
  return db.oneOrNone(
    'SELECT * FROM cidadao_contas WHERE tenant_id = $1 AND email = $2',
    [tenantId, (email || '').toLowerCase().trim()]
  );
}

// Devolve null quando o e-mail já tem conta (o DO NOTHING não retorna linha).
// db.one estourava nesse caso e virava 500 no lugar de "e-mail já cadastrado".
export async function criarContaCidadao(tenantId, cidadaoId, email, senha) {
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.default.hash(senha, 10);

  const conta = await db.oneOrNone(
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

// O vínculo principal é `p.cidadao_id`; o contato só entra como reforço, para
// alcançar protocolos abertos pelo WhatsApp. O JOIN por contato sozinho deixava
// a lista vazia para quem se cadastrou pelo portal (contato_id nulo).
export async function listarProtocolosDoCidadao(tenantId, cidadaoId) {
  return db.manyOrNone(
    `SELECT p.*, d.nome AS setor_atual_nome, sv.nome AS servico_nome,
            (SELECT COUNT(*)::int FROM protocolo_pendencias pp
             WHERE pp.protocolo_id = p.id AND pp.status = 'pendente') AS pendencias_abertas
     FROM protocolos p
     JOIN cidadaos c ON c.id = $1 AND c.tenant_id = $2
     LEFT JOIN departamentos d ON d.id = p.setor_atual_id
     LEFT JOIN protocolo_servicos sv ON sv.id = p.servico_id
     WHERE p.tenant_id = $2 AND p.externo = true AND p.deleted_at IS NULL
       AND (p.cidadao_id = c.id OR (c.contato_id IS NOT NULL AND p.contato_id = c.contato_id))
     ORDER BY p.aberto_em DESC`,
    [cidadaoId, tenantId]
  );
}

// ──────────────────────────────────────────────
// Recuperação de senha
// ──────────────────────────────────────────────

export async function gerarTokenRecuperacaoSenha(tenantId, email) {
  const conta = await db.oneOrNone(
    `SELECT cc.*, c.nome FROM cidadao_contas cc
     JOIN cidadaos c ON c.id = cc.cidadao_id
     WHERE cc.tenant_id = $1 AND cc.email = $2 AND cc.conta_ativa = true AND cc.deleted_at IS NULL`,
    [tenantId, email.toLowerCase().trim()]
  );
  if (!conta) return null;

  const token = gerarCodigo();
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

  await db.none(
    `UPDATE cidadao_contas SET reset_token = $1, reset_token_expira_em = $2, atualizado_em = now()
     WHERE id = $3`,
    [token, expiraEm, conta.id]
  );

  return { email: conta.email, nome: conta.nome, token, expiraEm };
}

export async function redefinirSenhaComToken(tenantId, email, token, novaSenha) {
  if (!novaSenha || novaSenha.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }

  const conta = await db.oneOrNone(
    `SELECT * FROM cidadao_contas
     WHERE tenant_id = $1 AND email = $2 AND reset_token = $3
       AND reset_token_expira_em > now() AND conta_ativa = true AND deleted_at IS NULL`,
    [tenantId, email.toLowerCase().trim(), token]
  );
  if (!conta) throw new Error('Código inválido ou expirado. Solicite um novo.');

  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.default.hash(novaSenha, 10);

  await db.none(
    `UPDATE cidadao_contas
     SET senha_hash = $1, reset_token = NULL, reset_token_expira_em = NULL, atualizado_em = now()
     WHERE id = $2`,
    [hash, conta.id]
  );

  return { ok: true };
}
