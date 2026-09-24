export function deduplicateProviderEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event.providerMessageId || seen.has(event.providerMessageId)) return false;
    seen.add(event.providerMessageId);
    return true;
  });
}

export function assertInternalNoteDestination(destination) {
  if (destination !== 'interno') throw new Error('Nota interna nunca pode ser enviada ao provedor');
  return true;
}

export function canCreateOperationalConversation(block) {
  return !(block?.ativo && (!block.expiraEm || new Date(block.expiraEm) > new Date()));
}

export function canRetryMessage(message) {
  return message?.status === 'falhou' && Number(message.tentativas || 0) < 5;
}
