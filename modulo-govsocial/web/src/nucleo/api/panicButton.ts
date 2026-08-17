import { http } from "@/nucleo/http/clienteHttp";
import type {
  PanicButtonOut,
  PanicButtonListItem,
  PanicButtonHistoryItem,
  PanicButtonActivateBody,
  PanicButtonResolveBody,
} from "@/tipos/panicButton";

export const servicoPanicButton = {
  ativar: (body: PanicButtonActivateBody) =>
    http.post<PanicButtonOut>("/panic-button/activate", body),

  atender: (panicId: string, notes?: string) =>
    http.post<PanicButtonOut>(`/panic-button/${panicId}/attend`, { notes }),

  resolver: (panicId: string, body: PanicButtonResolveBody) =>
    http.post<PanicButtonOut>(`/panic-button/${panicId}/resolve`, body),

  listarAtivos: () =>
    http.get<PanicButtonListItem[]>("/panic-button/active"),

  historico: (limit = 100, offset = 0) =>
    http.get<PanicButtonHistoryItem[]>(
      `/panic-button/history?limit=${limit}&offset=${offset}`,
    ),
};
