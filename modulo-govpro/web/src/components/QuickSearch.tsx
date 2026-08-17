"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ProcessoOut } from "@/types/govpro";
import { SituacaoBadge } from "@/components/processo/badges";

export default function QuickSearch() {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProcessoOut[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (termo.trim().length < 3) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const timeout = setTimeout(() => {
      api
        .buscarGlobal(termo.trim())
        .then((r) => {
          setResultados(r.slice(0, 8));
          setAberto(true);
        })
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [termo]);

  useEffect(() => {
    const onClickFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  const irParaBusca = () => {
    if (termo.trim().length < 3) return;
    router.push(`/busca?q=${encodeURIComponent(termo.trim())}`);
    setAberto(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]"
          aria-hidden="true"
        >
          search
        </span>
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          onKeyDown={(e) => e.key === "Enter" && irParaBusca()}
          placeholder="Buscar processo por NUP ou assunto…"
          aria-label="Busca rápida de processos"
          className="w-full h-10 pl-10 pr-3 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm focus:ring-2 focus:ring-primary"
        />
      </div>

      {aberto && (termo.trim().length >= 3) && (
        <div className="absolute mt-2 w-full bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {buscando ? (
            <div className="px-4 py-3 text-body-sm text-on-surface-variant">Buscando…</div>
          ) : resultados.length === 0 ? (
            <div className="px-4 py-3 text-body-sm text-on-surface-variant">Nenhum processo encontrado.</div>
          ) : (
            <>
              <div className="px-4 pt-3 pb-1 text-label-md font-label-md text-on-surface-variant uppercase">
                Processos
              </div>
              <ul>
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => {
                        router.push(`/processos/${p.id}`);
                        setAberto(false);
                        setTermo("");
                      }}
                      className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-surface-container-low transition-colors"
                    >
                      <span className="font-mono text-body-sm text-primary flex-shrink-0">{p.nup}</span>
                      <span className="flex-1 text-body-sm text-on-surface truncate">{p.especificacao}</span>
                      <SituacaoBadge situacao={p.situacao} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={irParaBusca}
                className="w-full text-left px-4 py-2 text-label-md font-label-md text-primary hover:bg-surface-container-low transition-colors border-t border-outline-variant"
              >
                Ver todos os resultados
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
