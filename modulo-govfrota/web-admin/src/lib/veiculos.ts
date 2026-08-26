// Utilidades da área de Veículos: tipos amigáveis, situação (badges),
// formatadores pt-BR, lotação por tipo de organização e validação de placa.

export const TIPOS_VEICULO: Record<string, string> = {
  CARRO: "Carro",
  CAMINHONETE: "Caminhonete",
  UTILITARIO: "Utilitário",
  CAMINHAO: "Caminhão",
  ONIBUS: "Ônibus",
  MICRO_ONIBUS: "Micro-ônibus",
  VAN: "Van",
  MOTOCICLETA: "Motocicleta",
  TRATOR: "Trator",
  MAQUINA: "Máquina",
  EQUIPAMENTO: "Equipamento",
  OUTRO: "Outro",
};

export const TIPOS_VEICULO_LISTA = Object.entries(TIPOS_VEICULO);

// Tipos que naturalmente usam horímetro (máquinas, tratores, equipamentos).
export const TIPOS_HORIMETRO = new Set(["MAQUINA", "TRATOR", "EQUIPAMENTO"]);

export interface SituacaoInfo {
  label: string;
  classe: string;
  cor: string; // bolinha do badge
}

export const SITUACOES: Record<string, SituacaoInfo> = {
  DISPONIVEL: { label: "Disponível", classe: "bg-green-50 text-[#067647]", cor: "bg-green-500" },
  EM_USO: { label: "Em uso", classe: "bg-blue-50 text-[#1D4ED8]", cor: "bg-blue-500" },
  EM_MANUTENCAO: { label: "Em manutenção", classe: "bg-orange-50 text-[#B54708]", cor: "bg-orange-500" },
  INDISPONIVEL: { label: "Indisponível", classe: "bg-gray-100 text-gray-600", cor: "bg-gray-400" },
  BAIXADO: { label: "Baixado", classe: "bg-red-50 text-[#B42318]", cor: "bg-red-500" },
};

export const SITUACOES_LISTA = Object.entries(SITUACOES);

export function nomeTipo(tipo: string | null | undefined): string {
  return TIPOS_VEICULO[tipo || ""] || tipo?.replace(/_/g, " ") || "—";
}

export function situacaoInfo(situacao: string): SituacaoInfo {
  return SITUACOES[situacao] ?? SITUACOES.DISPONIVEL;
}

export function formatarKm(km: number): string {
  return `${km.toLocaleString("pt-BR")} km`;
}

export function formatarHorimetro(h: number | string | null | undefined): string {
  if (h === null || h === undefined || h === "") return "—";
  const num = Number(h);
  return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

export function formatarConsumo(consumo: number | string | null | undefined): string {
  if (consumo === null || consumo === undefined || consumo === "") return "—";
  const num = Number(consumo);
  if (isNaN(num) || num <= 0) return "Dados insuficientes";
  return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/L`;
}

export function formatarMoeda(valor: number | string | null | undefined): string {
  const num = Number(valor || 0);
  if (isNaN(num)) return "—";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function formatarData(data: string | null | undefined, horaMeioDia = false): string {
  if (!data) return "—";
  const d = new Date(data.length === 10 && horaMeioDia ? data + "T12:00" : data);
  if (isNaN(d.getTime())) return data;
  return d.toLocaleDateString("pt-BR");
}

export interface PlacaInfo {
  valida: boolean;
  normalizada: string;
}

// Normaliza e valida placa no padrão antigo (ABC1234) ou Mercosul (ABC1D23).
export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/[- ]/g, "").trim();
}

export function placaValida(placa: string): boolean {
  const p = normalizarPlaca(placa);
  return /^[A-Z]{3}[0-9]{4}$/.test(p) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p);
}

// Rótulos de lotação conforme o tipo de organização (público vs privado).
export function camposLotacao(tipoOrganizacao: string): { chave: string; label: string; opcional: boolean }[] {
  if (tipoOrganizacao === "PRIVADO") {
    return [
      { chave: "filial", label: "Filial", opcional: true },
      { chave: "departamento", label: "Departamento", opcional: true },
      { chave: "unidade", label: "Unidade", opcional: true },
      { chave: "centro_custo", label: "Centro de custo", opcional: true },
    ];
  }
  // Público (padrão)
  return [
    { chave: "unidade", label: "Unidade / Secretaria", opcional: true },
    { chave: "departamento", label: "Departamento", opcional: true },
    { chave: "centro_custo", label: "Centro de custo", opcional: true },
  ];
}
