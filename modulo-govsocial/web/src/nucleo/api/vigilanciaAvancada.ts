import { http } from "@/nucleo/http/clienteHttp";
import type {
  IndicadorTerritorioItem,
  TendenciaResponse,
  MapaCalorItem,
  PerfilPopulacionalResponse,
  AnomaliaItem,
} from "@/tipos/vigilanciaAvancada";

export const servicoVigilanciaAvancada = {
  indicadoresTerritorio: (mes: number, ano: number) =>
    http.get<IndicadorTerritorioItem[]>(
      `/vigilancia/indicadores-territorio?mes=${mes}&ano=${ano}`,
    ),

  tendencias: (meses = 12) =>
    http.get<TendenciaResponse>(`/vigilancia/tendencias?meses=${meses}`),

  mapaCalor: (tipo: "vulnerabilidade" | "densidade" = "vulnerabilidade") =>
    http.get<MapaCalorItem[]>(`/vigilancia/mapa-calor?tipo=${tipo}`),

  perfilPopulacional: () =>
    http.get<PerfilPopulacionalResponse>("/vigilancia/perfil-populacional"),

  anomalias: () =>
    http.get<AnomaliaItem[]>("/vigilancia/anomalias"),
};
