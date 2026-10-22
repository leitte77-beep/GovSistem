"use client";

import { useEffect, useState } from "react";
import { formatCount, trackPortalVisit } from "@/lib/view-counter";

/** Total de visitas ao portal desta prefeitura (fica ao lado do menu). */
export default function VisitCounter({ className = "" }: { className?: string }) {
  const [visits, setVisits] = useState<number | null>(null);

  useEffect(() => {
    trackPortalVisit().then(setVisits).catch(() => setVisits(null));
  }, []);

  if (visits === null) return null;
  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-bold text-slate-600 ${className}`}
      title="Total de visitas ao Diário Oficial"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-500">visibility</span>
      <span>
        {formatCount(visits)} <span className="font-semibold">{visits === 1 ? "visita" : "visitas"}</span>
      </span>
    </span>
  );
}
