import db from '../db.js';

// ============================================================
// AGENDA PESSOAL DO ATENDENTE
// ============================================================
// Regra que atravessa o arquivo inteiro: todo item pertence a um operador, e
// nenhuma consulta lê item de outro operador. O tenant_id entra junto em toda
// cláusula porque o operador_id sozinho já seria suficiente — mas se um id
// vazar de outro tenant, a consulta tem que voltar vazia, não o item.

const TIPOS = ['compromisso', 'tarefa', 'lembrete'];
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'];
const STATUS = ['pendente', 'em_andamento', 'concluida', 'cancelada'];
const STATUS_ABERTOS = ['pendente', 'em_andamento'];

// Colunas devolvidas ao front. Enumeradas em vez de `i.*` para que uma coluna
// nova (agenda compartilhada, anexos) não vaze sem alguém decidir por isso.
const CAMPOS = `
  i.id, i.tipo, i.titulo, i.descricao, i.inicio, i.fim, i.dia_todo,
  i.prioridade, i.status, i.categoria,
  i.conversa_id, i.contato_id, i.protocolo_id,
  i.concluido_em, i.observacao_final, i.criado_em, i.atualizado_em`;

// O item vem com o rótulo do que ele aponta para o front não ter que buscar
// conversa/contato/protocolo um a um só para escrever "Conversa #2026-...".
const JOINS = `
  FROM agenda_itens i
  LEFT JOIN contatos c   ON c.id = i.contato_id
  LEFT JOIN protocolos p ON p.id = i.protocolo_id`;
const CAMPOS_VINCULO = `, c.nome AS contato_nome, c.telefone AS contato_telefone, p.numero AS protocolo_numero`;

class AgendaError extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.name = 'AgendaError';
    this.status = status;
  }
}

function validarEnum(valor, permitidos, campo, padrao) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  if (!permitidos.includes(valor)) throw new AgendaError(`${campo} inválido: ${valor}`);
  return valor;
}

function validarData(valor, campo, obrigatorio = false) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new AgendaError(`${campo} é obrigatório`);
    return null;
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new AgendaError(`${campo} inválido`);
  return d.toISOString();
}

// ------------------------------------------------------------
// Leitura
// ------------------------------------------------------------

/**
 * Lista itens do operador numa janela de tempo.
 * Sem `fim`, devolve tudo a partir de `inicio` — usado pela agenda completa.
 */
export async function listarItens(tenantId, operadorId, filtros = {}) {
  const cond = ['i.tenant_id = $1', 'i.operador_id = $2'];
  const vals = [tenantId, operadorId];

  if (filtros.inicio) { vals.push(validarData(filtros.inicio, 'inicio')); cond.push(`i.inicio >= $${vals.length}`); }
  if (filtros.fim)    { vals.push(validarData(filtros.fim, 'fim'));       cond.push(`i.inicio < $${vals.length}`); }

  if (filtros.status === 'abertos') {
    cond.push(`i.status = ANY('{${STATUS_ABERTOS.join(',')}}')`);
  } else if (filtros.status) {
    vals.push(validarEnum(filtros.status, STATUS, 'status'));
    cond.push(`i.status = $${vals.length}`);
  }

  if (filtros.tipo) {
    vals.push(validarEnum(filtros.tipo, TIPOS, 'tipo'));
    cond.push(`i.tipo = $${vals.length}`);
  }

  if (filtros.busca) {
    vals.push(`%${String(filtros.busca).trim()}%`);
    cond.push(`(i.titulo ILIKE $${vals.length} OR i.descricao ILIKE $${vals.length})`);
  }

  // Teto rígido: a tela inicial pede 5 itens, a agenda completa pagina. Nenhuma
  // chamada tem motivo para arrastar a agenda inteira do servidor.
  const limite = Math.min(Number(filtros.limite) || 100, 200);
  const offset = Math.max(Number(filtros.offset) || 0, 0);
  vals.push(limite, offset);

  const itens = await db.manyOrNone(
    `SELECT ${CAMPOS}${CAMPOS_VINCULO} ${JOINS}
     WHERE ${cond.join(' AND ')}
     ORDER BY i.inicio ${filtros.ordem === 'desc' ? 'DESC' : 'ASC'}, i.criado_em ASC
     LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals
  );
  return anexarLembretes(tenantId, itens);
}

/**
 * Resumo da tela inicial e do modal de login.
 *
 * A janela do "hoje" chega pronta do cliente (`hojeInicio`/`hojeFim`) em vez de
 * ser calculada aqui: o servidor roda em UTC e o servidor municipal está em
 * -03:00, então "hoje" calculado no backend erraria o dia nas primeiras e
 * últimas horas — justamente quando o atendente abre e fecha o expediente.
 */
export async function resumo(tenantId, operadorId, { hojeInicio, hojeFim, dias = 7 } = {}) {
  const ini = validarData(hojeInicio, 'hoje_inicio', true);
  const fim = validarData(hojeFim, 'hoje_fim', true);
  const janelaProximos = new Date(new Date(fim).getTime() + Math.min(Number(dias) || 7, 30) * 86400000).toISOString();

  const base = `SELECT ${CAMPOS}${CAMPOS_VINCULO} ${JOINS}
    WHERE i.tenant_id = $1 AND i.operador_id = $2
      AND i.status = ANY('{${STATUS_ABERTOS.join(',')}}')`;

  // As três faixas particionam a linha do tempo, sem sobreposição: o que ficou
  // para trás, o que é de hoje, o que vem depois. Um item aparece em exatamente
  // uma lista — repetir o mesmo compromisso em dois blocos da mesma tela é o
  // tipo de coisa que faz o atendente parar de confiar no painel.
  const [pendencias, hoje, proximos] = await Promise.all([
    db.manyOrNone(`${base} AND i.inicio < $3 ORDER BY i.inicio DESC LIMIT 50`, [tenantId, operadorId, ini]),
    db.manyOrNone(`${base} AND i.inicio >= $3 AND i.inicio < $4 ORDER BY i.dia_todo ASC, i.inicio ASC LIMIT 50`, [tenantId, operadorId, ini, fim]),
    db.manyOrNone(`${base} AND i.inicio >= $3 AND i.inicio < $4 ORDER BY i.inicio ASC LIMIT 50`, [tenantId, operadorId, fim, janelaProximos]),
  ]);

  // `anexarLembretes` preenche os próprios objetos, então as três listas já
  // saem completas desta única chamada.
  await anexarLembretes(tenantId, [...pendencias, ...hoje, ...proximos]);

  const agora = Date.now();
  return {
    pendencias,
    hoje,
    proximos,
    contadores: {
      hoje: hoje.length,
      proximos: proximos.length,
      // "Atrasado" = tudo que ficou para trás, mais o que já venceu dentro do
      // próprio dia de hoje. Derivado na leitura, nunca gravado.
      atrasados: pendencias.length + hoje.filter((i) => !i.dia_todo && new Date(i.inicio).getTime() < agora).length,
      urgentes: [...pendencias, ...hoje].filter((i) => i.prioridade === 'urgente').length,
    },
  };
}

export async function getItem(tenantId, operadorId, itemId) {
  const item = await db.oneOrNone(
    `SELECT ${CAMPOS}${CAMPOS_VINCULO} ${JOINS}
     WHERE i.id = $1 AND i.tenant_id = $2 AND i.operador_id = $3`,
    [itemId, tenantId, operadorId]
  );
  if (!item) return null;
  const [comLembretes] = await anexarLembretes(tenantId, [item]);
  return comLembretes;
}

// Uma consulta só para todos os itens da página, em vez de uma por item.
async function anexarLembretes(tenantId, itens) {
  if (!itens.length) return itens;
  const ids = itens.map((i) => i.id);
  const lembretes = await db.manyOrNone(
    `SELECT id, item_id, offset_min, disparar_em, disparado_em
     FROM agenda_lembretes
     WHERE tenant_id = $1 AND item_id = ANY($2::uuid[])
     ORDER BY disparar_em ASC`,
    [tenantId, ids]
  );
  const porItem = new Map();
  for (const l of lembretes) {
    if (!porItem.has(l.item_id)) porItem.set(l.item_id, []);
    porItem.get(l.item_id).push(l);
  }
  for (const item of itens) item.lembretes = porItem.get(item.id) || [];
  return itens;
}

// ------------------------------------------------------------
// Escrita
// ------------------------------------------------------------

function normalizarEntrada(dados) {
  const titulo = String(dados.titulo || '').trim();
  if (!titulo) throw new AgendaError('Título é obrigatório');
  if (titulo.length > 200) throw new AgendaError('Título muito longo (máx. 200)');

  const tipo = validarEnum(dados.tipo, TIPOS, 'tipo', 'compromisso');
  const inicio = validarData(dados.inicio, 'inicio', true);
  let fim = validarData(dados.fim, 'fim');
  if (fim && new Date(fim) < new Date(inicio)) {
    throw new AgendaError('A hora final não pode ser anterior à inicial');
  }
  // Tarefa e lembrete não têm duração; se vier `fim` num deles é lixo de
  // formulário e seria exibido como intervalo na agenda.
  if (tipo !== 'compromisso') fim = null;

  return {
    tipo,
    titulo,
    descricao: String(dados.descricao || '').trim(),
    inicio,
    fim,
    dia_todo: Boolean(dados.dia_todo),
    prioridade: validarEnum(dados.prioridade, PRIORIDADES, 'prioridade', 'normal'),
    status: validarEnum(dados.status, STATUS, 'status', 'pendente'),
    categoria: dados.categoria ? String(dados.categoria).trim().slice(0, 60) : null,
    conversa_id: dados.conversa_id || null,
    contato_id: dados.contato_id || null,
    protocolo_id: dados.protocolo_id || null,
  };
}

// Lembretes chegam como minutos de antecedência (`[0, 30, 1440]`). Aqui viram
// instantes absolutos, que é o que o polling consegue filtrar por índice.
function normalizarLembretes(lista, inicioISO) {
  if (!Array.isArray(lista)) return [];
  const base = new Date(inicioISO).getTime();
  const vistos = new Set();
  const out = [];
  for (const bruto of lista.slice(0, 5)) {
    const min = Number(bruto?.offset_min ?? bruto);
    if (!Number.isFinite(min) || min < 0 || min > 43200) continue; // teto: 30 dias
    if (vistos.has(min)) continue;
    vistos.add(min);
    out.push({ offset_min: min, disparar_em: new Date(base - min * 60000).toISOString() });
  }
  return out;
}

export async function criarItem(tenantId, operadorId, dados) {
  const d = normalizarEntrada(dados);
  const lembretes = normalizarLembretes(dados.lembretes, d.inicio);

  return db.tx(async (t) => {
    const item = await t.one(
      `INSERT INTO agenda_itens
         (tenant_id, operador_id, tipo, titulo, descricao, inicio, fim, dia_todo,
          prioridade, status, categoria, conversa_id, contato_id, protocolo_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [tenantId, operadorId, d.tipo, d.titulo, d.descricao, d.inicio, d.fim, d.dia_todo,
       d.prioridade, d.status, d.categoria, d.conversa_id, d.contato_id, d.protocolo_id]
    );
    item.lembretes = await gravarLembretes(t, tenantId, operadorId, item.id, lembretes);
    return item;
  });
}

async function gravarLembretes(t, tenantId, operadorId, itemId, lembretes) {
  await t.none('DELETE FROM agenda_lembretes WHERE item_id = $1 AND tenant_id = $2', [itemId, tenantId]);
  if (!lembretes.length) return [];
  const criados = [];
  for (const l of lembretes) {
    criados.push(await t.one(
      `INSERT INTO agenda_lembretes (tenant_id, item_id, operador_id, offset_min, disparar_em)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, item_id, offset_min, disparar_em, disparado_em`,
      [tenantId, itemId, operadorId, l.offset_min, l.disparar_em]
    ));
  }
  return criados;
}

export async function atualizarItem(tenantId, operadorId, itemId, dados) {
  const atual = await db.oneOrNone(
    'SELECT * FROM agenda_itens WHERE id = $1 AND tenant_id = $2 AND operador_id = $3',
    [itemId, tenantId, operadorId]
  );
  if (!atual) throw new AgendaError('Compromisso não encontrado', 404);

  // Remarcar só o início tem que arrastar o fim junto, preservando a duração.
  // Sem isso, mover uma reunião de 14h–15h para as 16h deixaria o fim às 15h e
  // a edição seria recusada por "hora final anterior à inicial" — um erro que o
  // atendente não teria como entender, já que ele nem tocou na hora final.
  let fimAjustado = dados.fim !== undefined ? dados.fim : atual.fim;
  if (dados.fim === undefined && dados.inicio && atual.fim) {
    const delta = new Date(dados.inicio).getTime() - new Date(atual.inicio).getTime();
    if (Number.isFinite(delta) && delta !== 0) {
      fimAjustado = new Date(new Date(atual.fim).getTime() + delta).toISOString();
    }
  }

  // PATCH parcial: o que não veio no corpo mantém o valor atual. Passar o
  // registro atual pelo normalizador garante que a validação roda igual na
  // criação e na edição, sem duas listas de regras para divergir.
  const d = normalizarEntrada({
    tipo: dados.tipo ?? atual.tipo,
    titulo: dados.titulo ?? atual.titulo,
    descricao: dados.descricao ?? atual.descricao,
    inicio: dados.inicio ?? atual.inicio,
    fim: fimAjustado,
    dia_todo: dados.dia_todo ?? atual.dia_todo,
    prioridade: dados.prioridade ?? atual.prioridade,
    status: dados.status ?? atual.status,
    categoria: dados.categoria !== undefined ? dados.categoria : atual.categoria,
    conversa_id: dados.conversa_id !== undefined ? dados.conversa_id : atual.conversa_id,
    contato_id: dados.contato_id !== undefined ? dados.contato_id : atual.contato_id,
    protocolo_id: dados.protocolo_id !== undefined ? dados.protocolo_id : atual.protocolo_id,
  });

  return db.tx(async (t) => {
    const item = await t.one(
      `UPDATE agenda_itens SET
         tipo=$4, titulo=$5, descricao=$6, inicio=$7, fim=$8, dia_todo=$9,
         prioridade=$10, status=$11, categoria=$12,
         conversa_id=$13, contato_id=$14, protocolo_id=$15,
         atualizado_em = now()
       WHERE id=$1 AND tenant_id=$2 AND operador_id=$3
       RETURNING *`,
      [itemId, tenantId, operadorId, d.tipo, d.titulo, d.descricao, d.inicio, d.fim,
       d.dia_todo, d.prioridade, d.status, d.categoria, d.conversa_id, d.contato_id, d.protocolo_id]
    );

    // Mexer na data sem regravar os lembretes deixaria o aviso preso no horário
    // antigo — o compromisso muda para as 16h e o popup ainda toca às 13h30.
    const dataMudou = new Date(atual.inicio).getTime() !== new Date(d.inicio).getTime();
    if (dados.lembretes !== undefined) {
      item.lembretes = await gravarLembretes(t, tenantId, operadorId, itemId, normalizarLembretes(dados.lembretes, d.inicio));
    } else if (dataMudou) {
      const antigos = await t.manyOrNone('SELECT offset_min FROM agenda_lembretes WHERE item_id = $1', [itemId]);
      item.lembretes = await gravarLembretes(t, tenantId, operadorId, itemId, normalizarLembretes(antigos, d.inicio));
    } else {
      item.lembretes = await t.manyOrNone(
        'SELECT id, item_id, offset_min, disparar_em, disparado_em FROM agenda_lembretes WHERE item_id = $1 ORDER BY disparar_em',
        [itemId]
      );
    }
    return item;
  });
}

export async function concluirItem(tenantId, operadorId, itemId, { observacao } = {}) {
  const item = await db.oneOrNone(
    `UPDATE agenda_itens SET
       status = 'concluida', concluido_em = now(), concluido_por = $3,
       observacao_final = $4, atualizado_em = now()
     WHERE id = $1 AND tenant_id = $2 AND operador_id = $3
     RETURNING *`,
    [itemId, tenantId, operadorId, observacao ? String(observacao).slice(0, 500) : null]
  );
  if (!item) throw new AgendaError('Compromisso não encontrado', 404);
  // Concluir cala os lembretes que ainda não tocaram: ninguém quer ser avisado
  // de algo que acabou de marcar como feito.
  await db.none(
    'UPDATE agenda_lembretes SET disparado_em = now() WHERE item_id = $1 AND disparado_em IS NULL',
    [itemId]
  );
  return item;
}

export async function reabrirItem(tenantId, operadorId, itemId) {
  const item = await db.oneOrNone(
    `UPDATE agenda_itens SET
       status = 'pendente', concluido_em = NULL, concluido_por = NULL,
       observacao_final = NULL, atualizado_em = now()
     WHERE id = $1 AND tenant_id = $2 AND operador_id = $3
     RETURNING *`,
    [itemId, tenantId, operadorId]
  );
  if (!item) throw new AgendaError('Compromisso não encontrado', 404);
  return item;
}

export async function excluirItem(tenantId, operadorId, itemId) {
  const r = await db.result(
    'DELETE FROM agenda_itens WHERE id = $1 AND tenant_id = $2 AND operador_id = $3',
    [itemId, tenantId, operadorId]
  );
  if (!r.rowCount) throw new AgendaError('Compromisso não encontrado', 404);
  return { ok: true };
}

// ------------------------------------------------------------
// Lembretes
// ------------------------------------------------------------

/**
 * Lembretes que já venceram e ainda não foram reconhecidos.
 *
 * Não marca nada como disparado: quem reconhece é o usuário, ao fechar, adiar
 * ou concluir. Se o navegador cair antes disso, o lembrete volta na próxima
 * abertura — perder um aviso é pior do que repeti-lo.
 */
export async function lembretesPendentes(tenantId, operadorId) {
  return db.manyOrNone(
    `SELECT l.id, l.item_id, l.offset_min, l.disparar_em,
            i.titulo, i.descricao, i.tipo, i.inicio, i.fim, i.dia_todo,
            i.prioridade, i.conversa_id, i.protocolo_id,
            c.nome AS contato_nome, p.numero AS protocolo_numero
     FROM agenda_lembretes l
     JOIN agenda_itens i ON i.id = l.item_id
     LEFT JOIN contatos c   ON c.id = i.contato_id
     LEFT JOIN protocolos p ON p.id = i.protocolo_id
     WHERE l.tenant_id = $1 AND l.operador_id = $2
       AND l.disparado_em IS NULL
       AND l.disparar_em <= now()
       AND i.status = ANY('{${STATUS_ABERTOS.join(',')}}')
     ORDER BY l.disparar_em ASC
     LIMIT 20`,
    [tenantId, operadorId]
  );
}

/**
 * Reconhece um lembrete. Com `adiarMin`, reagenda em vez de silenciar —
 * é o "Adiar 10 min" do popup.
 */
export async function reconhecerLembrete(tenantId, operadorId, lembreteId, { adiarMin } = {}) {
  const min = Number(adiarMin);
  if (Number.isFinite(min) && min > 0) {
    if (min > 43200) throw new AgendaError('Adiamento máximo é de 30 dias');
    const l = await db.oneOrNone(
      `UPDATE agenda_lembretes
         SET disparar_em = now() + ($4 || ' minutes')::interval, disparado_em = NULL
       WHERE id = $1 AND tenant_id = $2 AND operador_id = $3
       RETURNING id, item_id, offset_min, disparar_em, disparado_em`,
      [lembreteId, tenantId, operadorId, String(min)]
    );
    if (!l) throw new AgendaError('Lembrete não encontrado', 404);
    return l;
  }

  const l = await db.oneOrNone(
    `UPDATE agenda_lembretes SET disparado_em = now()
     WHERE id = $1 AND tenant_id = $2 AND operador_id = $3
     RETURNING id, item_id, offset_min, disparar_em, disparado_em`,
    [lembreteId, tenantId, operadorId]
  );
  if (!l) throw new AgendaError('Lembrete não encontrado', 404);
  return l;
}

export { AgendaError };
