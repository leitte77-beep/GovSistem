export type PiiRevealPayload = {
  campo: "cpf" | "nis";
  entityId: string;
  entityType: "familia" | "pessoa";
};

export async function logPiiReveal(payload: PiiRevealPayload): Promise<void> {
  // TODO(backend): POST /audit/pii-reveal — registra acesso a dado sigiloso
  if (import.meta.env.DEV) {
    console.debug("[auditoria] PII reveal solicitado:", payload);
  }
}
