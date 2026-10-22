"use client";

import { useEffect, useState } from "react";
import { formatCount, trackEditionView } from "@/lib/view-counter";

/** Quantos acessos esta edição já teve (bloco "Dados técnicos"). */
export default function EditionViews({ editionId }: { editionId: string }) {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    if (!editionId) return;
    trackEditionView(editionId).then(setViews).catch(() => setViews(null));
  }, [editionId]);

  if (views === null) return null;
  return (
    <div className="space-y-1.5">
      <p className="font-bold uppercase tracking-wider text-slate-600 text-[10px]">Acessos a esta edição</p>
      <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-brand-accent">visibility</span>
        <p className="text-slate-800">
          <span className="text-base font-extrabold">{formatCount(views)}</span>{" "}
          {views === 1 ? "acesso" : "acessos"}
        </p>
      </div>
    </div>
  );
}
