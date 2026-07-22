import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";
import { Skeleton } from "@/ui/Skeleton";
import type { KPICardProps } from "@/tipos/dashboard";
import { textos } from "@/i18n/textos";

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const h = 28;
  const w = 60;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      className="opacity-50 group-hover:opacity-80 transition-opacity shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeltaBadge({ delta }: { delta: NonNullable<KPICardProps["delta"]> }) {
  const Icon = delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;
  const cor =
    delta.direction === "up"
      ? "text-emerald-600"
      : delta.direction === "down"
        ? "text-red-500"
        : "text-ink-soft";

  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold", cor)}>
      <Icon aria-hidden className="h-3 w-3" />
      {delta.percent !== undefined && <span>{delta.percent}%</span>}
      <span className="text-ink-soft font-normal">{delta.label}</span>
    </span>
  );
}

export function KPICard({
  label,
  value,
  hint,
  delta,
  sparkline,
  accent = false,
  to,
  loading = false,
  error = false,
  showDecoration = true,
}: KPICardProps) {
  const classes = clsx(
    "glass-card rounded-2xl p-6 transition-all duration-300 group",
    to
      ? "hover:translate-y-[-4px] block focus-visible:outline-focus"
      : "block",
    accent && "ring-1 ring-primary/20 shadow-lg shadow-primary/5",
  );

  const hasSparkline =
    Array.isArray(sparkline) &&
    sparkline.length >= 2 &&
    Math.max(...sparkline) !== Math.min(...sparkline);

  // KILL-SWITCH: showDecoration=false zera QUALQUER conteúdo do canto direito.
  const exibeNoCanto = showDecoration && hasSparkline;

  const conteudo = (
    <>
      {loading ? (
        <Skeleton variante="cartao" />
      ) : error ? (
        <>
          <p className="font-label-sm text-ink-soft mb-1">{label}</p>
          <span className="font-titulo font-bold text-2xl tabular-nums text-ink-soft/50" title={textos.kpi.indisponivel}>
            --
          </span>
        </>
      ) : (
        <>
          <div className="flex justify-between items-start mb-4">
            <p className="font-label-sm text-ink-soft">{label}</p>
            {exibeNoCanto && <MiniSparkline data={sparkline} />}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={clsx(
                "font-titulo font-bold tabular-nums",
                accent ? "text-2xl" : "text-2xl",
                "text-ink",
              )}
            >
              {value}
            </span>
          </div>
          {value === 0 && hint ? (
            <span className="text-[11px] text-ink-soft block mt-1">{hint}</span>
          ) : delta ? (
            <div className="mt-2">
              <DeltaBadge delta={delta} />
            </div>
          ) : null}
        </>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={`${label}: ${value}. Abrir listagem.`}>
        {conteudo}
      </Link>
    );
  }

  return <div className={classes}>{conteudo}</div>;
}
