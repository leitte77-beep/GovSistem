const PRIORIDADES = new Set(['informativo', 'importante', 'urgente']);
const PUBLICOS = new Set(['todos', 'setores']);

export function validarDadosAviso(dados = {}) {
  const titulo = String(dados.titulo || '').trim();
  const mensagem = String(dados.mensagem || '').trim();
  const prioridade = dados.prioridade || 'informativo';
  const publico = dados.publico || 'todos';
  const departamentos = Array.isArray(dados.departamento_ids) ? dados.departamento_ids.filter(Boolean) : [];
  if (!titulo) throw new Error('O título do aviso é obrigatório.');
  if (titulo.length > 120) throw new Error('O título deve ter no máximo 120 caracteres.');
  if (!mensagem) throw new Error('A mensagem do aviso é obrigatória.');
  if (mensagem.length > 2000) throw new Error('A mensagem deve ter no máximo 2.000 caracteres.');
  if (!PRIORIDADES.has(prioridade)) throw new Error('Prioridade de aviso inválida.');
  if (!PUBLICOS.has(publico)) throw new Error('Público do aviso inválido.');
  if (publico === 'setores' && departamentos.length === 0) {
    throw new Error('Selecione pelo menos um setor para este aviso.');
  }
}

export function normalizarAviso(dados = {}) {
  validarDadosAviso(dados);
  return {
    titulo: String(dados.titulo).trim(),
    mensagem: String(dados.mensagem).trim(),
    prioridade: dados.prioridade || 'informativo',
    publico: dados.publico || 'todos',
    exigeConfirmacao: dados.exige_confirmacao !== false,
    departamentoIds: dados.publico === 'setores'
      ? [...new Set((dados.departamento_ids || []).filter(Boolean))]
      : [],
    expiraEm: dados.expira_em || null,
  };
}

export function operadorEhDestinatario(aviso, operador) {
  if (!operador || operador.papel === 'admin') return false;
  if (aviso.publico === 'todos') return true;
  const setoresAviso = new Set(aviso.departamentoIds || aviso.departamento_ids || []);
  return (operador.departamentoIds || operador.departamento_ids || []).some((id) => setoresAviso.has(id));
}

export function avisoEstaPendente(aviso, agora = new Date()) {
  if (!aviso?.ativo) return false;
  if (aviso.expiraEm && new Date(aviso.expiraEm) <= agora) return false;
  if (aviso.exigeConfirmacao) return !aviso.confirmadoEm;
  return !aviso.lidoEm;
}

function selecionarAvisoCompleto(camposExtras = '') {
  return `SELECT a.id, a.titulo, a.mensagem, a.prioridade, a.publico,
                 a.exige_confirmacao, a.ativo, a.publicado_em, a.expira_em,
                 a.criado_em, a.atualizado_em, a.criado_por,
                 autor.nome AS autor_nome,
                 COALESCE(array_agg(DISTINCT ad.departamento_id::text)
                   FILTER (WHERE ad.departamento_id IS NOT NULL), '{}') AS departamento_ids,
                 COALESCE(array_agg(DISTINCT d.nome)
                   FILTER (WHERE d.nome IS NOT NULL), '{}') AS departamento_nomes
                 ${camposExtras}
          FROM avisos a
          LEFT JOIN operadores autor ON autor.id = a.criado_por
          LEFT JOIN aviso_departamentos ad ON ad.aviso_id = a.id
          LEFT JOIN departamentos d ON d.id = ad.departamento_id
         `;
}

export async function criarAviso(conn, { tenantId, autorId, dados }) {
  const aviso = normalizarAviso(dados);
  return conn.tx(async (tx) => {
    const criado = await tx.one(
      `INSERT INTO avisos
         (tenant_id, titulo, mensagem, prioridade, publico, exige_confirmacao,
          expira_em, criado_por, publicado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       RETURNING *`,
      [tenantId, aviso.titulo, aviso.mensagem, aviso.prioridade, aviso.publico,
        aviso.exigeConfirmacao, aviso.expiraEm, autorId],
    );
    for (const departamentoId of aviso.departamentoIds) {
      await tx.none(
        `INSERT INTO aviso_departamentos (aviso_id, departamento_id, tenant_id)
         SELECT $1, id, $3 FROM departamentos
         WHERE id = $2 AND tenant_id = $3 AND ativo = true
         ON CONFLICT DO NOTHING`,
        [criado.id, departamentoId, tenantId],
      );
    }
    return { ...criado, departamento_ids: aviso.departamentoIds };
  });
}

export async function listarAvisosAdministracao(conn, tenantId) {
  return conn.manyOrNone(
    `${selecionarAvisoCompleto(`,
       (SELECT COUNT(DISTINCT o.id)::int FROM operadores o
        WHERE o.tenant_id = a.tenant_id AND o.ativo = true AND o.papel <> 'admin'
          AND (a.publico = 'todos' OR EXISTS (
            SELECT 1 FROM operador_departamentos od
            JOIN aviso_departamentos alvo ON alvo.departamento_id = od.departamento_id
            WHERE alvo.aviso_id = a.id AND od.operador_id = o.id
          ))) AS total_destinatarios,
       (SELECT COUNT(*)::int FROM aviso_leituras al WHERE al.aviso_id = a.id AND al.lido_em IS NOT NULL) AS total_lidos,
       (SELECT COUNT(*)::int FROM aviso_leituras al WHERE al.aviso_id = a.id AND al.confirmado_em IS NOT NULL) AS total_confirmados`)}
     WHERE a.tenant_id = $1
     GROUP BY a.id, autor.nome
     ORDER BY a.publicado_em DESC, a.criado_em DESC`,
    [tenantId],
  );
}

export async function listarDestinatariosAviso(conn, { tenantId, avisoId }) {
  return conn.manyOrNone(
    `SELECT o.id, o.nome, o.email, o.papel,
            COALESCE(array_agg(DISTINCT d.nome) FILTER (WHERE d.nome IS NOT NULL), '{}') AS departamentos,
            leitura.lido_em, leitura.confirmado_em
     FROM avisos a
     JOIN operadores o ON o.tenant_id = a.tenant_id AND o.ativo = true AND o.papel <> 'admin'
     LEFT JOIN operador_departamentos od ON od.operador_id = o.id AND od.tenant_id = o.tenant_id
     LEFT JOIN departamentos d ON d.id = od.departamento_id
     LEFT JOIN aviso_leituras leitura ON leitura.aviso_id = a.id AND leitura.operador_id = o.id
     WHERE a.id = $2 AND a.tenant_id = $1
       AND (a.publico = 'todos' OR EXISTS (
         SELECT 1 FROM aviso_departamentos alvo
         JOIN operador_departamentos membro ON membro.departamento_id = alvo.departamento_id
         WHERE alvo.aviso_id = a.id AND membro.operador_id = o.id AND membro.tenant_id = $1
       ))
     GROUP BY o.id, leitura.lido_em, leitura.confirmado_em
     ORDER BY leitura.confirmado_em NULLS FIRST, leitura.lido_em NULLS FIRST, o.nome`,
    [tenantId, avisoId],
  );
}

export async function listarAvisosPendentes(conn, { tenantId, operadorId, papel }) {
  if (papel === 'admin') return [];
  return conn.manyOrNone(
    `${selecionarAvisoCompleto(', leitura.lido_em, leitura.confirmado_em')}
     LEFT JOIN aviso_leituras leitura
       ON leitura.aviso_id = a.id AND leitura.operador_id = $2
     WHERE a.tenant_id = $1 AND a.ativo = true
       AND a.publicado_em <= now()
       AND (a.expira_em IS NULL OR a.expira_em > now())
       AND (a.publico = 'todos' OR EXISTS (
         SELECT 1 FROM aviso_departamentos alvo
         JOIN operador_departamentos od ON od.departamento_id = alvo.departamento_id
         WHERE alvo.aviso_id = a.id AND od.operador_id = $2 AND od.tenant_id = $1
       ))
       AND ((a.exige_confirmacao = true AND leitura.confirmado_em IS NULL)
         OR (a.exige_confirmacao = false AND leitura.lido_em IS NULL))
     GROUP BY a.id, autor.nome, leitura.lido_em, leitura.confirmado_em
     ORDER BY CASE a.prioridade WHEN 'urgente' THEN 0 WHEN 'importante' THEN 1 ELSE 2 END,
              a.publicado_em`,
    [tenantId, operadorId],
  );
}

export async function registrarLeituraAviso(conn, {
  tenantId, operadorId, avisoId, confirmado = false,
}) {
  return conn.oneOrNone(
    `INSERT INTO aviso_leituras (tenant_id, aviso_id, operador_id, lido_em, confirmado_em)
     SELECT $1, a.id, $2, now(), CASE WHEN $4 THEN now() ELSE NULL END
     FROM avisos a
     JOIN operadores o ON o.id = $2 AND o.tenant_id = a.tenant_id
       AND o.ativo = true AND o.papel <> 'admin'
     WHERE a.id = $3 AND a.tenant_id = $1 AND a.ativo = true
       AND (a.expira_em IS NULL OR a.expira_em > now())
       AND (a.publico = 'todos' OR EXISTS (
         SELECT 1 FROM aviso_departamentos alvo
         JOIN operador_departamentos od ON od.departamento_id = alvo.departamento_id
         WHERE alvo.aviso_id = a.id AND od.operador_id = o.id AND od.tenant_id = $1
       ))
     ON CONFLICT (aviso_id, operador_id) DO UPDATE SET
       lido_em = COALESCE(aviso_leituras.lido_em, now()),
       confirmado_em = CASE WHEN $4 THEN COALESCE(aviso_leituras.confirmado_em, now())
                             ELSE aviso_leituras.confirmado_em END
     RETURNING *`,
    [tenantId, operadorId, avisoId, confirmado],
  );
}

export async function atualizarAviso(conn, { tenantId, avisoId, dados }) {
  const aviso = normalizarAviso(dados);
  return conn.tx(async (tx) => {
    const atualizado = await tx.oneOrNone(
      `UPDATE avisos SET titulo = $1, mensagem = $2, prioridade = $3,
         publico = $4, exige_confirmacao = $5, expira_em = $6,
         ativo = COALESCE($7, ativo), publicado_em = now(), atualizado_em = now()
       WHERE id = $8 AND tenant_id = $9 RETURNING *`,
      [aviso.titulo, aviso.mensagem, aviso.prioridade, aviso.publico,
        aviso.exigeConfirmacao, aviso.expiraEm, dados.ativo ?? null, avisoId, tenantId],
    );
    if (!atualizado) return null;
    await tx.none('DELETE FROM aviso_departamentos WHERE aviso_id = $1 AND tenant_id = $2', [avisoId, tenantId]);
    for (const departamentoId of aviso.departamentoIds) {
      await tx.none(
        `INSERT INTO aviso_departamentos (aviso_id, departamento_id, tenant_id)
         SELECT $1, id, $3 FROM departamentos WHERE id = $2 AND tenant_id = $3 AND ativo = true
         ON CONFLICT DO NOTHING`,
        [avisoId, departamentoId, tenantId],
      );
    }
    await tx.none('DELETE FROM aviso_leituras WHERE aviso_id = $1 AND tenant_id = $2', [avisoId, tenantId]);
    return { ...atualizado, departamento_ids: aviso.departamentoIds };
  });
}

export async function definirAvisoAtivo(conn, { tenantId, avisoId, ativo, republicar = false }) {
  return conn.tx(async (tx) => {
    const aviso = await tx.oneOrNone(
      `UPDATE avisos SET ativo = $1,
         publicado_em = CASE WHEN $2 THEN now() ELSE publicado_em END,
         atualizado_em = now()
       WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [ativo, republicar, avisoId, tenantId],
    );
    if (aviso && republicar) {
      await tx.none('DELETE FROM aviso_leituras WHERE aviso_id = $1 AND tenant_id = $2', [avisoId, tenantId]);
    }
    return aviso;
  });
}
