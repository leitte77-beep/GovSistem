export const TIPO_ATENDIMENTO = [
  { valor: "INDIVIDUAL", rotulo: "Individual" },
  { valor: "FAMILIAR", rotulo: "Familiar" },
  { valor: "VISITA_DOMICILIAR", rotulo: "Visita domiciliar" },
  { valor: "GRUPO", rotulo: "Coletivo / grupo" },
];
export function rotuloDe(lista: { valor: string; rotulo: string }[], valorProcurado: string): string {
  const encontrado = lista.find((item) => item.valor === valorProcurado);
  return encontrado?.rotulo ?? valorProcurado ?? "";
}
