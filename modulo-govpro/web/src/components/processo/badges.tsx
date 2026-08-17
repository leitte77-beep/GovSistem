import Badge, { type BadgeTone } from "../Badge";
import { SITUACAO_LABEL, SITUACAO_TONE } from "@/lib/format";

export function SituacaoBadge({ situacao }: { situacao: string }) {
  return (
    <Badge tone={(SITUACAO_TONE[situacao] as BadgeTone) || "neutral"}>
      {SITUACAO_LABEL[situacao] || situacao}
    </Badge>
  );
}

export function NivelAcessoBadge({ nivel }: { nivel: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    PUBLICO: { tone: "success", label: "Público" },
    RESTRITO: { tone: "warning", label: "Restrito" },
    SIGILOSO: { tone: "error", label: "Sigiloso" },
  };
  const item = map[nivel] || { tone: "neutral" as BadgeTone, label: nivel };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function SituacaoDocumentoBadge({ situacao }: { situacao: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    RASCUNHO: { tone: "neutral", label: "Rascunho" },
    ASSINADO: { tone: "success", label: "Assinado" },
    PUBLICADO: { tone: "primary", label: "Publicado" },
    DESENTRANHADO: { tone: "error", label: "Desentranhado" },
  };
  const item = map[situacao] || { tone: "neutral" as BadgeTone, label: situacao };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
