import type { ComponentType } from "react";
import {
  CalendarClock,
  Gift,
  HandHeart,
  Home,
  Send,
  Users,
  FileText,
} from "lucide-react";
import type { CorChip } from "@/ui/Chip";

/**
 * Mapa central de tipos de evento da Trilha → cor semântica, glifo e rótulo
 * pt-BR (§2). Cores por serviço: PAIF, SCFV, PAEFI, MSE, Benefício,
 * Encaminhamento, Visita.
 */
export type TipoEvento =
  | "PAIF"
  | "SCFV"
  | "PAEFI"
  | "MSE"
  | "BENEFICIO"
  | "ENCAMINHAMENTO"
  | "VISITA"
  | "OUTRO";

type EstiloEvento = {
  cor: CorChip;
  glifo: ComponentType<{ className?: string }>;
  rotulo: string;
  /** classe de cor da borda/marcador na timeline (var CSS de token). */
  marcador: string;
};

const ESTILOS: Record<TipoEvento, EstiloEvento> = {
  PAIF: { cor: "paif", glifo: HandHeart, rotulo: "Atendimento PAIF", marcador: "bg-evt-paif" },
  SCFV: { cor: "scfv", glifo: Users, rotulo: "SCFV", marcador: "bg-evt-scfv" },
  PAEFI: { cor: "paefi", glifo: HandHeart, rotulo: "Atendimento PAEFI", marcador: "bg-evt-paefi" },
  MSE: { cor: "mse", glifo: FileText, rotulo: "Medida socioeducativa", marcador: "bg-evt-mse" },
  BENEFICIO: {
    cor: "beneficio",
    glifo: Gift,
    rotulo: "Benefício",
    marcador: "bg-evt-beneficio",
  },
  ENCAMINHAMENTO: {
    cor: "encaminhamento",
    glifo: Send,
    rotulo: "Encaminhamento",
    marcador: "bg-evt-encaminhamento",
  },
  VISITA: { cor: "visita", glifo: Home, rotulo: "Visita domiciliar", marcador: "bg-evt-visita" },
  OUTRO: { cor: "neutro", glifo: CalendarClock, rotulo: "Registro", marcador: "bg-ink-soft" },
};

/**
 * Deriva o tipo de evento a partir do código do serviço e do tipo de
 * atendimento (VISITA_DOMICILIAR tem tratamento próprio).
 */
export function tipoEventoDe(serviceCode: string, tipoAtendimento?: string): TipoEvento {
  if (tipoAtendimento === "VISITA_DOMICILIAR") return "VISITA";
  const c = serviceCode.toUpperCase();
  if (c.includes("PAIF")) return "PAIF";
  if (c.includes("SCFV")) return "SCFV";
  if (c.includes("PAEFI")) return "PAEFI";
  if (c.includes("MSE")) return "MSE";
  return "OUTRO";
}

export function estiloEvento(tipo: TipoEvento): EstiloEvento {
  return ESTILOS[tipo];
}
