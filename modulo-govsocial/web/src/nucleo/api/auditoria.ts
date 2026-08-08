/**
 * Auditoria no cliente — registra tentativas de revelação de dado sensível.
 * A revelação efetiva é feita por endpoint dedicado (auditada no backend como
 * READ_SENSIVEL); este log serve de rastro local/telemetria sem conteúdo.
 */

type RevelacaoPii = {
  campo: "cpf" | "nis" | string;
  entityId: string;
  entityType: string;
};

export function logPiiReveal({ campo, entityId, entityType }: RevelacaoPii): void {
  // Sem o valor revelado, apenas o fato da revelação (sem PII no log).
  console.warn(
    `[auditoria] revelacao de campo sensivel: campo=${campo} entidade=${entityType} id=${entityId}`,
  );
}
