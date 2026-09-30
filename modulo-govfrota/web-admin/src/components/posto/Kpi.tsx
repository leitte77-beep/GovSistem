import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const TONS = {
  azul: { card: "border-surface-border bg-white", ico: "bg-[#EFF6FF] text-[#1D4ED8]" },
  amarelo: { card: "border-[#F5D98B] bg-[#FFFBEF]", ico: "bg-[#FFF4D6] text-[#805600]" },
  vermelho: { card: "border-[#FDA29B] bg-[#FFF6F5]", ico: "bg-[#FFDAD6] text-[#BA1A1A]" },
  verde: { card: "border-surface-border bg-white", ico: "bg-[#E7F8EC] text-[#106D34]" },
  neutro: { card: "border-surface-border bg-white", ico: "bg-[#F3F4F6] text-text-subtle" },
};

export function Kpi({
  icon: Icon, rotulo, valor, nota, tom = "azul", href,
}: { icon: LucideIcon; rotulo: string; valor: string; nota?: string; tom?: keyof typeof TONS; href?: string }) {
  const t = TONS[tom];
  const corpo = (
    <>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.ico}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-meta text-text-subtle">{rotulo}</p>
        <p className="truncate text-lg font-semibold tabular-nums text-text-title">{valor}</p>
        {nota && <p className="truncate text-meta text-text-subtle">{nota}</p>}
      </div>
    </>
  );
  const c = `flex items-center gap-3 rounded-card border p-4 shadow-card ${t.card}`;
  return href ? <Link href={href} className={`${c} transition hover:shadow-elevated`}>{corpo}</Link> : <div className={c}>{corpo}</div>;
}
