// ===== API da agenda pessoal =====

function getToken() {
  try {
    const saved = localStorage.getItem('chatgov_auth');
    if (!saved) return '';
    return JSON.parse(saved).token;
  } catch {
    return '';
  }
}

async function req(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = 'Erro na requisição';
    try { msg = (await res.json()).erro || msg; } catch {}
    throw new Error(msg);
  }
  try { return await res.json(); } catch { return {}; }
}

/**
 * Limites do dia de hoje no fuso do navegador.
 *
 * O servidor roda em UTC; se ele calculasse "hoje", às 21h de Rondônia a agenda
 * já teria virado para o dia seguinte. Por isso a janela é montada aqui e vai
 * junto na consulta.
 */
export function janelaDeHoje(base = new Date()) {
  const inicio = new Date(base);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);
  return { inicio, fim };
}

export async function fetchResumoAgenda({ dias = 7 } = {}) {
  const { inicio, fim } = janelaDeHoje();
  const qs = new URLSearchParams({
    hoje_inicio: inicio.toISOString(),
    hoje_fim: fim.toISOString(),
    dias: String(dias),
  });
  return req(`/api/agenda/resumo?${qs}`);
}

export async function fetchItensAgenda(filtros = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  return req(`/api/agenda/itens?${qs}`);
}

export async function criarItemAgenda(dados) {
  return req('/api/agenda/itens', 'POST', dados);
}

export async function atualizarItemAgenda(id, dados) {
  return req(`/api/agenda/itens/${id}`, 'PATCH', dados);
}

export async function concluirItemAgenda(id, observacao) {
  return req(`/api/agenda/itens/${id}/concluir`, 'POST', { observacao });
}

export async function reabrirItemAgenda(id) {
  return req(`/api/agenda/itens/${id}/reabrir`, 'POST');
}

export async function excluirItemAgenda(id) {
  return req(`/api/agenda/itens/${id}`, 'DELETE');
}

export async function fetchLembretesPendentes() {
  return req('/api/agenda/lembretes/pendentes');
}

/** Sem `adiarMin`, silencia o lembrete; com, reagenda para daqui a N minutos. */
export async function reconhecerLembrete(id, adiarMin) {
  return req(`/api/agenda/lembretes/${id}/reconhecer`, 'POST', { adiar_min: adiarMin });
}
