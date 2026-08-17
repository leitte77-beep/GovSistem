import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import type { DashboardActivityItem } from "@/tipos/dashboard";
import { mapearAtividade, formatarTempoRelativo, formatarTempoAbsoluto } from "@/nucleo/atividade/mapeadorAtividade";

const ICONE_POR_CATEGORIA: Record<string, string> = {
  config: "settings",
  acesso: "login",
  cadastro: "person_add",
  atendimento: "support_agent",
  beneficio: "volunteer_activism",
  encaminhamento: "forward",
  scfv: "groups",
  prontuario: "folder_open",
  unidade: "apartment",
  profissional: "badge",
  rma: "description",
  importacao: "upload_file",
  geral: "circle",
};

const COR_POR_CATEGORIA: Record<string, string> = {
  config: "bg-amber/10 text-amber",
  acesso: "bg-sky/10 text-sky-600",
  cadastro: "bg-emerald/10 text-emerald-600",
  atendimento: "bg-primary-soft text-primary",
  beneficio: "bg-evt-beneficio/10 text-evt-beneficio",
  encaminhamento: "bg-evt-encaminhamento/10 text-evt-encaminhamento",
  scfv: "bg-evt-scfv/10 text-evt-scfv",
  prontuario: "bg-amber/10 text-amber",
  unidade: "bg-sensitive/10 text-sensitive",
  profissional: "bg-focus/10 text-focus",
  rma: "bg-surface-container-high text-ink-soft",
  importacao: "bg-surface-container-high text-ink-soft",
  geral: "bg-surface-container-high text-ink-soft",
};

export function ActivityItem({
  item,
  isLast,
}: {
  item: DashboardActivityItem;
  isLast: boolean;
}) {
  const mapeada = mapearAtividade(item);
  const tempoRelativo = formatarTempoRelativo(item.data);
  const tempoAbsoluto = formatarTempoAbsoluto(item.data);
  const corBadge = COR_POR_CATEGORIA[item.categoria] ?? COR_POR_CATEGORIA.geral;
  const icone = ICONE_POR_CATEGORIA[item.categoria] ?? ICONE_POR_CATEGORIA.geral;

  const ariaLabel = `${mapeada.actor} ${mapeada.action}${mapeada.subject ? ` — ${mapeada.subject}` : ""} — ${tempoRelativo}.${mapeada.to ? " Abrir registro." : ""}`;

  const conteudo = (
    <div className="flex gap-4 items-start relative group">
      {!isLast && (
        <div className="absolute left-[11px] top-8 bottom-[-24px] w-[2px] bg-surface-container-high" />
      )}
      <div
        className={`w-6 h-6 rounded-full border-4 border-white z-10 shadow-sm flex items-center justify-center shrink-0 ${corBadge}`}
      >
        <span className="material-symbols-outlined !text-[14px]">{icone}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-label-md text-ink leading-tight">
          <span className="font-semibold">{mapeada.actor}</span>{" "}
          {mapeada.action}
        </p>
        {mapeada.subject && (
          <p className="text-[13px] text-ink-soft mt-0.5 leading-snug line-clamp-1">
            {mapeada.subject}
          </p>
        )}
        <p className="text-[12px] text-ink-soft mt-1 flex items-center gap-1.5">
          <Clock aria-hidden className="h-3 w-3" />
          <time dateTime={item.data} title={tempoAbsoluto}>
            {tempoRelativo}
          </time>
        </p>
      </div>
    </div>
  );

  if (mapeada.to) {
    return (
      <Link
        to={mapeada.to}
        className="block rounded-lg -mx-2 px-2 py-1 hover:bg-surface-container-lowest/50 transition-colors focus-visible:outline-focus"
        aria-label={ariaLabel}
      >
        {conteudo}
      </Link>
    );
  }

  return (
    <div
      className="rounded-lg -mx-2 px-2 py-1"
      aria-label={ariaLabel}
    >
      {conteudo}
    </div>
  );
}
