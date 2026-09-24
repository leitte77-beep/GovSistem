export function normalizarMsg(msg) {
  if (!msg) return msg;
  return {
    ...msg,
    mediaUrl: msg.media_url || msg.mediaUrl || null,
    mediaMime: msg.media_mime || msg.mediaMime || '',
    media_url: msg.media_url || msg.mediaUrl || null,
    media_mime: msg.media_mime || msg.mediaMime || '',
    respondendoA: msg.respondendo_a || msg.respondendoA || null,
    respondendo_a: msg.respondendo_a || msg.respondendoA || null,
    criadoEm: msg.criado_em || msg.criadoEm || null,
    criado_em: msg.criado_em || msg.criadoEm || null,
    editadaEm: msg.editada_em || msg.editadaEm || null,
    editada_em: msg.editada_em || msg.editadaEm || null,
    remetenteId: msg.remetente_id || msg.remetenteId || null,
    remetente_id: msg.remetente_id || msg.remetenteId || null,
    remetenteNome: msg.remetente_nome || msg.remetenteNome || '',
    remetente_nome: msg.remetente_nome || msg.remetenteNome || '',
    encaminhada_de: msg.encaminhada_de || msg.encaminhadaDe || null,
    encaminhadaDe: msg.encaminhada_de || msg.encaminhadaDe || null,
  };
}

export function normalizarMensagens(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizarMsg);
}

export function normalizarCanal(c) {
  if (!c) return c;
  return {
    ...c,
    naoLidas: c.nao_lidas || c.naoLidas || 0,
    nao_lidas: c.nao_lidas || c.naoLidas || 0,
    ultimaMensagem: c.ultima_mensagem || c.ultimaMensagem || null,
    ultima_mensagem: c.ultima_mensagem || c.ultimaMensagem || null,
  };
}
