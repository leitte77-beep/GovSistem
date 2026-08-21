"use client";

import Link from "next/link";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  icon: string;
  /** Cor do ícone; o fundo do quadrado usa a mesma cor com baixa opacidade. */
  color: string;
  href?: string;
  className?: string;
};

/** Cartão de indicador: ícone pastel no topo, valor em destaque e rótulo abaixo. */
export function StatCard({ label, value, icon, color, href, className }: StatCardProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icons = LucideIcons as any;
  const IconComponent = Icons[icon];

  const content = (
    <div
      className={cn(
        "bg-white border border-[#E4E7EC] rounded-xl p-4 h-full transition-all duration-200",
        href && "hover:shadow-elevated hover:border-[#D0D5DD]",
        className
      )}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: `${color}1a` }}
      >
        {IconComponent && <IconComponent className="w-[18px] h-[18px]" style={{ color }} />}
      </div>
      <p className="text-[22px] leading-tight font-bold text-[#101828] tabular-nums truncate">{value}</p>
      <p className="text-[13px] text-[#667085] mt-1 truncate">{label}</p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}
