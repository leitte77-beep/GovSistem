import { http } from "@/nucleo/http/clienteHttp";
import type {
  FaceOut,
  FaceVerificarOut,
  FacePendenteOut,
  FaceCadastrarBody,
  FaceVerificarBody,
} from "@/tipos/reconhecimentoFacial";

export const servicoReconhecimentoFacial = {
  cadastrar: (body: FaceCadastrarBody) =>
    http.post<FaceOut>("/facial/cadastrar", body),

  verificar: (body: FaceVerificarBody) =>
    http.post<FaceVerificarOut>("/facial/verificar", body),

  listarPendentes: () =>
    http.get<FacePendenteOut[]>("/facial/pendentes"),

  desativar: (personId: string) =>
    http.delete<void>(`/facial/${personId}`),
};
