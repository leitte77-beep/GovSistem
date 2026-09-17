/** Helpers puros do formulário de demanda (§113, §114).
 *
 * Ficam fora do componente para poderem ser testados sem renderizar a tela.
 */

/** Remove chaves vazias para não enviar `""` (que o servidor recusaria como UUID
 * ou data inválida). `false` é preservado: é um valor, não ausência. */
export function semVazios(objeto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== "" && v !== undefined && v !== null),
  );
}

/** Data-only (`YYYY-MM-DD`) vira fim do dia, no fuso da organização, para que o
 * prazo não seja interpretado como meia-noite e já nasca vencido (§198). */
export function fimDoDia(data: string): string | undefined {
  return data ? `${data}T23:59:59` : undefined;
}
