export type IndicadorTerritorioItem = {
  territorio: string;
  total_familias: number;
  atendimentos_mes: number;
  beneficios_mes: number;
  taxa_atendimento: number;
  taxa_beneficio: number;
};

export type TendenciaSerieItem = {
  ano: number;
  mes: number;
  rotulo: string;
  atendimentos: number;
  beneficios: number;
};

export type TendenciaProjecaoItem = {
  ano: number;
  mes: number;
  rotulo: string;
  atendimentos_projetados: number;
  projetado: boolean;
};

export type TendenciaResponse = {
  serie: TendenciaSerieItem[];
  projecao: TendenciaProjecaoItem[];
  tendencia_geral: "crescente" | "decrescente" | "estavel";
};

export type MapaCalorItem = {
  territorio: string;
  bairro: string;
  centroide_lat: number | null;
  centroide_lng: number | null;
  total_familias: number;
  intensidade: number;
  inseguranca_alimentar?: number;
  beneficiarios_pbf?: number;
};

export type PiramideEtariaItem = {
  faixa: string;
  masculino: number;
  feminino: number;
};

export type DistribuicaoItem = {
  rotulo: string;
  valor: string;
  total: number;
  percentual: number;
};

export type PerfilPopulacionalResponse = {
  total_pessoas: number;
  piramide_etaria: PiramideEtariaItem[];
  sexo: DistribuicaoItem[];
  raca_cor: DistribuicaoItem[];
  escolaridade: DistribuicaoItem[];
};

export type AnomaliaItem = {
  tipo: "atendimento" | "beneficio";
  ano: number;
  mes: number;
  rotulo: string;
  valor: number;
  media_esperada: number;
  desvio_padrao: number;
  severidade: "alta" | "media";
};
