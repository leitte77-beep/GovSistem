/**
 * Chave de idempotência para mutações críticas (entrega de benefício,
 * fechamento de RMA — §14). Enviada no header `Idempotency-Key`.
 */
export function novaChaveIdempotencia(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback para ambientes antigos (máquinas de prefeitura).
  return "idem-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
