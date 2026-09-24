import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

export async function criarReuniao(tenantId, operadorId, dados) {
  const link = dados.link_reuniao || gerarLinkPlaceholder(dados.plataforma);
  return db.one(
    `INSERT INTO reunioes (tenant_id, titulo, pauta, organizador_id, canal_id, plataforma, link_reuniao, id_evento_externo, inicio, fim, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [tenantId, dados.titulo, dados.pauta || '', operadorId, dados.canal_id || null,
     dados.plataforma || 'google_meet', link, dados.id_evento_externo || null,
     dados.inicio, dados.fim, dados.inicio <= new Date().toISOString() ? 'em_andamento' : 'agendada']
  );
}

export async function getReuniao(tenantId, reuniaoId) {
  const reuniao = await db.oneOrNone(
    `SELECT r.*, o.nome as organizador_nome, ci.nome as canal_nome
     FROM reunioes r
     LEFT JOIN operadores o ON o.id = r.organizador_id
     LEFT JOIN canais_internos ci ON ci.id = r.canal_id
     WHERE r.id = $1 AND r.tenant_id = $2`,
    [reuniaoId, tenantId]
  );
  if (!reuniao) return null;
  reuniao.participantes = await db.manyOrNone(
    `SELECT o.id, o.nome, o.email, pr.confirmado
     FROM participantes_reuniao pr
     JOIN operadores o ON o.id = pr.operador_id
     WHERE pr.reuniao_id = $1`,
    [reuniaoId]
  );
  return reuniao;
}

export async function listarReunioes(tenantId, operadorId, filtros = {}) {
  let query = `SELECT r.*, o.nome as organizador_nome
     FROM reunioes r
     LEFT JOIN operadores o ON o.id = r.organizador_id
     WHERE r.tenant_id = $1
       AND EXISTS (SELECT 1 FROM participantes_reuniao pr WHERE pr.reuniao_id = r.id AND pr.operador_id = $2)`;
  const params = [tenantId, operadorId];
  if (filtros.status) { params.push(filtros.status); query += ` AND r.status = $${params.length}`; }
  if (filtros.plataforma) { params.push(filtros.plataforma); query += ` AND r.plataforma = $${params.length}`; }
  query += ' ORDER BY r.inicio DESC LIMIT 100';
  return db.manyOrNone(query, params);
}

export async function atualizarReuniao(tenantId, reuniaoId, dados) {
  return db.oneOrNone(
    `UPDATE reunioes SET titulo = COALESCE($1, titulo), pauta = COALESCE($2, pauta),
            inicio = COALESCE($3, inicio), fim = COALESCE($4, fim),
            plataforma = COALESCE($5, plataforma), status = COALESCE($6, status)
     WHERE id = $7 AND tenant_id = $8 RETURNING *`,
    [dados.titulo || null, dados.pauta || null, dados.inicio || null, dados.fim || null,
     dados.plataforma || null, dados.status || null, reuniaoId, tenantId]
  );
}

export async function cancelarReuniao(tenantId, reuniaoId, operadorId) {
  const reuniao = await db.oneOrNone('SELECT * FROM reunioes WHERE id = $1 AND tenant_id = $2', [reuniaoId, tenantId]);
  if (!reuniao) return null;
  return db.one(
    `UPDATE reunioes SET status = 'cancelada' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [reuniaoId, tenantId]
  );
}

export async function adicionarParticipante(tenantId, reuniaoId, operadorId) {
  return db.none(
    'INSERT INTO participantes_reuniao (reuniao_id, operador_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [reuniaoId, operadorId]
  );
}

export async function removerParticipante(tenantId, reuniaoId, operadorId) {
  return db.none(
    'DELETE FROM participantes_reuniao WHERE reuniao_id = $1 AND operador_id = $2',
    [reuniaoId, operadorId]
  );
}

export async function confirmarPresenca(tenantId, reuniaoId, operadorId) {
  return db.none(
    'UPDATE participantes_reuniao SET confirmado = true WHERE reuniao_id = $1 AND operador_id = $2',
    [reuniaoId, operadorId]
  );
}

export async function getReunioesLembrete(tenantId) {
  const agora = new Date();
  const quinzeMin = new Date(agora.getTime() + 15 * 60000);
  const vinteQuatroH = new Date(agora.getTime() + 24 * 3600000);
  return db.manyOrNone(
    `SELECT r.* FROM reunioes r
     WHERE r.tenant_id = $1 AND r.status = 'agendada'
       AND (r.inicio BETWEEN $2 AND $3 OR r.inicio BETWEEN $2 AND $4)`,
    [tenantId, agora.toISOString(), quinzeMin.toISOString(), vinteQuatroH.toISOString()]
  );
}

export async function getTarefasVencidas(tenantId) {
  return db.manyOrNone(
    `SELECT t.*, p.nome as projeto_nome FROM tarefas t
     JOIN projetos p ON p.id = t.projeto_id
     WHERE t.tenant_id = $1 AND t.concluida_em IS NULL AND t.prazo IS NOT NULL AND t.prazo < now()`,
    [tenantId]
  );
}

export async function getTarefasProximoPrazo(tenantId) {
  const agora = new Date();
  const vinteQuatroH = new Date(agora.getTime() + 24 * 3600000);
  return db.manyOrNone(
    `SELECT t.* FROM tarefas t
     WHERE t.tenant_id = $1 AND t.concluida_em IS NULL
       AND t.prazo IS NOT NULL AND t.prazo BETWEEN $2 AND $3`,
    [tenantId, agora.toISOString(), vinteQuatroH.toISOString()]
  );
}

export async function getCalendario(tenantId, operadorId, inicio, fim) {
  const reunioes = await db.manyOrNone(
    `SELECT r.id, r.titulo, r.inicio, r.fim, r.plataforma, r.link_reuniao, r.status, 'reuniao' as tipo
     FROM reunioes r
     JOIN participantes_reuniao pr ON pr.reuniao_id = r.id
     WHERE r.tenant_id = $1 AND pr.operador_id = $2 AND r.status != 'cancelada'
       AND r.inicio >= $3 AND r.fim <= $4`,
    [tenantId, operadorId, inicio, fim]
  );
  const tarefas = await db.manyOrNone(
    `SELECT t.id, t.titulo, t.prazo as inicio, t.prazo as fim, t.prioridade, 'tarefa' as tipo
     FROM tarefas t
     JOIN tarefa_responsaveis tr ON tr.tarefa_id = t.id
     WHERE t.tenant_id = $1 AND tr.operador_id = $2 AND t.concluida_em IS NULL
       AND t.prazo IS NOT NULL AND t.prazo >= $3 AND t.prazo <= $4`,
    [tenantId, operadorId, inicio, fim]
  );
  const eventos = await db.manyOrNone(
    `SELECT * FROM eventos_calendario
     WHERE tenant_id = $1 AND inicio >= $3 AND fim <= $4
       AND (setor_id IS NULL OR setor_id IN (SELECT od.departamento_id FROM operador_departamentos od JOIN departamentos d ON d.id = od.departamento_id AND d.ativo = true WHERE od.operador_id = $2))`,
    [tenantId, operadorId, inicio, fim]
  );
  return [...reunioes, ...tarefas, ...eventos];
}

export async function criarEventoCalendario(tenantId, operadorId, dados) {
  return db.one(
    `INSERT INTO eventos_calendario (tenant_id, titulo, descricao, local, inicio, fim, dia_todo, recorrencia, setor_id, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [tenantId, dados.titulo, dados.descricao || '', dados.local || null, dados.inicio, dados.fim,
     dados.dia_todo || false, dados.recorrencia || null, dados.setor_id || null, operadorId]
  );
}

export async function solicitarAusencia(tenantId, operadorId, dados) {
  return db.one(
    `INSERT INTO ausencias (tenant_id, operador_id, tipo, inicio, fim, motivo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tenantId, operadorId, dados.tipo || 'ferias', dados.inicio, dados.fim, dados.motivo || null]
  );
}

export async function aprovarAusencia(tenantId, ausenciaId, aprovadorId, aprovado) {
  return db.oneOrNone(
    `UPDATE ausencias SET status = $1, aprovado_por = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`,
    [aprovado ? 'aprovado' : 'rejeitado', aprovadorId, ausenciaId, tenantId]
  );
}

function gerarLinkPlaceholder(plataforma) {
  const id = uuidv4().slice(0, 8);
  if (plataforma === 'teams') return `https://teams.microsoft.com/l/meetup-join/${id}`;
  return `https://meet.google.com/${id}`;
}
