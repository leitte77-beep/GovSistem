import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

export async function listarProjetos(tenantId, operadorId) {
  return db.manyOrNone(
    `SELECT p.*,
            (SELECT COUNT(*)::int FROM tarefas t WHERE t.projeto_id = p.id) as total_tarefas,
            (SELECT COUNT(*)::int FROM tarefas t WHERE t.projeto_id = p.id AND t.concluida_em IS NOT NULL) as tarefas_concluidas
     FROM projetos p
     WHERE p.tenant_id = $1 AND p.ativo = true
     ORDER BY p.criado_em DESC`,
    [tenantId]
  );
}

export async function criarProjeto(tenantId, operadorId, dados) {
  return db.one(
    `INSERT INTO projetos (tenant_id, nome, descricao, setor_id, criado_por, cor, grupo_chat_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [tenantId, dados.nome, dados.descricao || '', dados.setor_id || null, operadorId, dados.cor || '#2563EB', dados.grupo_chat_id || null]
  );
}

export async function getKanban(tenantId, projetoId) {
  const projeto = await db.oneOrNone(
    'SELECT * FROM projetos WHERE id = $1 AND tenant_id = $2',
    [projetoId, tenantId]
  );
  if (!projeto) return null;
  const colunas = await db.manyOrNone(
    'SELECT * FROM colunas WHERE projeto_id = $1 AND tenant_id = $2 ORDER BY ordem',
    [projetoId, tenantId]
  );
  for (const col of colunas) {
    col.tarefas = await db.manyOrNone(
      `SELECT t.*,
              (SELECT json_agg(json_build_object('id', o.id, 'nome', o.nome))
               FROM tarefa_responsaveis tr JOIN operadores o ON o.id = tr.operador_id WHERE tr.tarefa_id = t.id) as responsaveis,
              (SELECT COUNT(*)::int FROM checklist_itens ci WHERE ci.tarefa_id = t.id) as total_checklist,
              (SELECT COUNT(*)::int FROM checklist_itens ci WHERE ci.tarefa_id = t.id AND ci.concluido = true) as checklist_concluido
       FROM tarefas t
       WHERE t.coluna_id = $1 AND t.tenant_id = $2
       ORDER BY t.ordem_coluna`,
      [col.id, tenantId]
    );
  }
  return { projeto, colunas };
}

export async function criarColuna(tenantId, projetoId, dados) {
  const maxOrdem = await db.oneOrNone(
    'SELECT COALESCE(MAX(ordem), -1) as m FROM colunas WHERE projeto_id = $1 AND tenant_id = $2',
    [projetoId, tenantId]
  );
  return db.one(
    `INSERT INTO colunas (tenant_id, projeto_id, nome, ordem, cor, limite_wip)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tenantId, projetoId, dados.nome, (maxOrdem?.m || 0) + 1, dados.cor || '#6B7280', dados.limite_wip || null]
  );
}

export async function atualizarColuna(tenantId, colunaId, dados) {
  return db.oneOrNone(
    `UPDATE colunas SET nome = COALESCE($1, nome), cor = COALESCE($2, cor), limite_wip = $3, ordem = COALESCE($4, ordem)
     WHERE id = $5 AND tenant_id = $6 RETURNING *`,
    [dados.nome || null, dados.cor || null, dados.limite_wip ?? null, dados.ordem ?? null, colunaId, tenantId]
  );
}

export async function criarTarefa(tenantId, operadorId, dados) {
  const maxOrdem = await db.oneOrNone(
    'SELECT COALESCE(MAX(ordem_coluna), -1) as m FROM tarefas WHERE coluna_id = $1 AND tenant_id = $2',
    [dados.coluna_id, tenantId]
  );
  const tarefa = await db.one(
    `INSERT INTO tarefas (tenant_id, titulo, descricao, projeto_id, coluna_id, ordem_coluna,
                          criada_por, prioridade, prazo, mensagem_origem_id, tarefa_pai_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [tenantId, dados.titulo, dados.descricao || '', dados.projeto_id, dados.coluna_id,
     (maxOrdem?.m || 0) + 1, operadorId, dados.prioridade || 'media',
     dados.prazo || null, dados.mensagem_origem_id || null, dados.tarefa_pai_id || null]
  );
  if (dados.responsaveis && Array.isArray(dados.responsaveis)) {
    for (const opId of dados.responsaveis) {
      await db.none(
        'INSERT INTO tarefa_responsaveis (tarefa_id, operador_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [tarefa.id, opId]
      );
    }
  }
  return tarefa;
}

export async function getTarefa(tenantId, tarefaId) {
  const tarefa = await db.oneOrNone(
    `SELECT t.*, p.nome as projeto_nome, c.nome as coluna_nome
     FROM tarefas t
     JOIN projetos p ON p.id = t.projeto_id
     JOIN colunas c ON c.id = t.coluna_id
     WHERE t.id = $1 AND t.tenant_id = $2`,
    [tarefaId, tenantId]
  );
  if (!tarefa) return null;
  tarefa.responsaveis = await db.manyOrNone(
    `SELECT o.id, o.nome, o.email FROM tarefa_responsaveis tr
     JOIN operadores o ON o.id = tr.operador_id WHERE tr.tarefa_id = $1`,
    [tarefaId]
  );
  tarefa.checklist = await db.manyOrNone(
    'SELECT * FROM checklist_itens WHERE tarefa_id = $1 AND tenant_id = $2 ORDER BY ordem',
    [tarefaId, tenantId]
  );
  tarefa.comentarios = await db.manyOrNone(
    `SELECT ct.*, o.nome as autor_nome FROM comentarios_tarefa ct
     LEFT JOIN operadores o ON o.id = ct.autor_id
     WHERE ct.tarefa_id = $1 AND ct.tenant_id = $2 ORDER BY ct.criado_em ASC`,
    [tarefaId, tenantId]
  );
  tarefa.historico = await db.manyOrNone(
    `SELECT ht.*, o.nome as operador_nome FROM historico_tarefa ht
     LEFT JOIN operadores o ON o.id = ht.operador_id
     WHERE ht.tarefa_id = $1 AND ht.tenant_id = $2 ORDER BY ht.alterado_em DESC`,
    [tarefaId, tenantId]
  );
  return tarefa;
}

export async function atualizarTarefa(tenantId, tarefaId, operadorId, dados) {
  const anterior = await db.oneOrNone('SELECT * FROM tarefas WHERE id = $1 AND tenant_id = $2', [tarefaId, tenantId]);
  if (!anterior) return null;

  const campos = [];
  const vals = [];
  const historico = [];

  const mapear = { titulo: 'titulo', descricao: 'descricao', projeto_id: 'projeto_id', coluna_id: 'coluna_id', prioridade: 'prioridade', prazo: 'prazo', tarefa_pai_id: 'tarefa_pai_id' };
  for (const [campo, colDb] of Object.entries(mapear)) {
    if (dados[campo] !== undefined && String(dados[campo]) !== String(anterior[colDb])) {
      campos.push(`${colDb} = $${vals.length + 1}`);
      vals.push(dados[campo]);
      historico.push({ campo: colDb, anterior: String(anterior[colDb] || ''), novo: String(dados[campo] || '') });
    }
  }

  if (campos.length > 0) {
    vals.push(tarefaId, tenantId);
    await db.none(
      `UPDATE tarefas SET ${campos.join(', ')}, atualizada_em = now() WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length}`,
      vals
    );
    for (const h of historico) {
      await db.none(
        `INSERT INTO historico_tarefa (tenant_id, tarefa_id, operador_id, campo_alterado, valor_anterior, valor_novo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, tarefaId, operadorId, h.campo, h.anterior, h.novo]
      );
    }
  }

  if (dados.concluida && !anterior.concluida_em) {
    await db.none('UPDATE tarefas SET concluida_em = now(), atualizada_em = now() WHERE id = $1 AND tenant_id = $2', [tarefaId, tenantId]);
  }

  return getTarefa(tenantId, tarefaId);
}

export async function moverTarefa(tenantId, tarefaId, colunaId, novaOrdem, operadorId) {
  const anterior = await db.oneOrNone('SELECT * FROM tarefas WHERE id = $1 AND tenant_id = $2', [tarefaId, tenantId]);
  if (!anterior) return null;
  if (anterior.coluna_id !== colunaId) {
    await db.none(
      `INSERT INTO historico_tarefa (tenant_id, tarefa_id, operador_id, campo_alterado, valor_anterior, valor_novo)
       VALUES ($1, $2, $3, 'coluna_id', $4, $5)`,
      [tenantId, tarefaId, operadorId, anterior.coluna_id, colunaId]
    );
  }
  return db.one(
    `UPDATE tarefas SET coluna_id = $1, ordem_coluna = $2, atualizada_em = now()
     WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [colunaId, novaOrdem, tarefaId, tenantId]
  );
}

export async function adicionarChecklistItem(tenantId, tarefaId, texto) {
  const maxOrdem = await db.oneOrNone(
    'SELECT COALESCE(MAX(ordem), -1) as m FROM checklist_itens WHERE tarefa_id = $1 AND tenant_id = $2',
    [tarefaId, tenantId]
  );
  return db.one(
    `INSERT INTO checklist_itens (tenant_id, tarefa_id, texto, ordem) VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, tarefaId, texto, (maxOrdem?.m || 0) + 1]
  );
}

export async function toggleChecklistItem(tenantId, tarefaId, itemId, concluido) {
  return db.oneOrNone(
    'UPDATE checklist_itens SET concluido = $1 WHERE id = $2 AND tarefa_id = $3 AND tenant_id = $4 RETURNING *',
    [concluido, itemId, tarefaId, tenantId]
  );
}

export async function adicionarComentario(tenantId, tarefaId, operadorId, texto) {
  return db.one(
    `INSERT INTO comentarios_tarefa (tenant_id, tarefa_id, autor_id, texto) VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, tarefaId, operadorId, texto]
  );
}

export async function listarTarefas(tenantId, filtros = {}) {
  let query = `SELECT t.*, p.nome as projeto_nome, c.nome as coluna_nome
     FROM tarefas t
     JOIN projetos p ON p.id = t.projeto_id
     JOIN colunas c ON c.id = t.coluna_id
     WHERE t.tenant_id = $1`;
  const params = [tenantId];
  if (filtros.projeto_id) { params.push(filtros.projeto_id); query += ` AND t.projeto_id = $${params.length}`; }
  if (filtros.responsavel_id) { params.push(filtros.responsavel_id); query += ` AND EXISTS (SELECT 1 FROM tarefa_responsaveis tr WHERE tr.tarefa_id = t.id AND tr.operador_id = $${params.length})`; }
  if (filtros.prioridade) { params.push(filtros.prioridade); query += ` AND t.prioridade = $${params.length}`; }
  if (filtros.status === 'concluida') { query += ' AND t.concluida_em IS NOT NULL'; }
  else if (filtros.status === 'pendente') { query += ' AND t.concluida_em IS NULL'; }
  query += ' ORDER BY t.criada_em DESC LIMIT 200';
  return db.manyOrNone(query, params);
}

export async function minhasTarefas(tenantId, operadorId) {
  return db.manyOrNone(
    `SELECT t.*, p.nome as projeto_nome, c.nome as coluna_nome
     FROM tarefas t
     JOIN projetos p ON p.id = t.projeto_id
     JOIN colunas c ON c.id = t.coluna_id
     WHERE t.tenant_id = $1 AND t.concluida_em IS NULL
       AND EXISTS (SELECT 1 FROM tarefa_responsaveis tr WHERE tr.tarefa_id = t.id AND tr.operador_id = $2)
     ORDER BY t.prazo ASC NULLS LAST, t.prioridade DESC`,
    [tenantId, operadorId]
  );
}

export async function relatorioProdutividade(tenantId, inicio, fim) {
  return db.manyOrNone(
    `SELECT o.nome,
            COUNT(*) FILTER (WHERE t.concluida_em IS NOT NULL)::int as concluidas,
            COUNT(*)::int as total,
            AVG(EXTRACT(EPOCH FROM (t.concluida_em - t.criada_em))/3600)::numeric(10,1) as tempo_medio_horas,
            COUNT(*) FILTER (WHERE t.prazo IS NOT NULL AND t.prazo < now() AND t.concluida_em IS NULL)::int as atrasadas
     FROM tarefas t
     JOIN tarefa_responsaveis tr ON tr.tarefa_id = t.id
     JOIN operadores o ON o.id = tr.operador_id
     WHERE t.tenant_id = $1
       AND ($2::date IS NULL OR t.criada_em::date >= $2)
       AND ($3::date IS NULL OR t.criada_em::date <= $3)
     GROUP BY o.id, o.nome ORDER BY concluidas DESC`,
    [tenantId, inicio || null, fim || null]
  );
}
