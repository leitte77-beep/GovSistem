"use client";

/**
 * O sino da topbar. A contagem chega em tempo real (SSE); quando muda, a
 * lista é recarregada. Ao abrir, marca como lidas e leva ao pedido.
 */

import clsx from "clsx";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api, type Notificacao } from "@/lib/api";
import { relativo } from "@/lib/formato";
import { useTempoReal } from "@/lib/tempoReal";

const ROTULO: Record<string, string> = {
  PEDIDO_ASSUMIDO: "Tarefa assumida",
  PEDIDO_TRANSFERIDO: "Tarefa transferida",
  PEDIDO_DEVOLVIDO: "Tarefa devolvida",
  COMPLEMENTO_SOLICITADO: "Complemento solicitado",
  PRAZO_ALTERADO: "Prazo alterado",
  MENCAO: "Você foi mencionado",
  RESUMO_DIARIO: "Resumo do dia",
  TAREFA_RECEBIDA: "Tarefa no seu setor",
  TAREFA_LIBERADA: "Tarefa voltou para a fila",
};

export function Notificacoes() {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  async function carregar() {
    try {
      const dados = await api.notificacoes();
      setItens(dados.itens);
      setNaoLidas(dados.nao_lidas);
    } catch {
      /* silencioso: o sino não pode derrubar a tela */
    }
  }

  const { naoLidas: aoVivo } = useTempoReal();
  useEffect(() => {
    carregar();
  }, [aoVivo]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function alternar() {
    const abrindo = !aberto;
    setAberto(abrindo);
    if (abrindo && naoLidas > 0) {
      try {
        const dados = await api.marcarLidas();
        setItens(dados.itens);
        setNaoLidas(dados.nao_lidas);
      } catch {
        /* ignora */
      }
    }
  }

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={alternar}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-transparent text-ink-muted transition-colors hover:border-line hover:bg-canvas hover:text-ink"
        aria-label="Notificações"
      >
        <Bell size={19} aria-hidden />
        {naoLidas > 0 && (
          <span className="absolute right-1 top-1 grid h-4 animate-fade-subir min-w-4 place-items-center rounded-full bg-estado-atrasado px-1 text-[10px] font-semibold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute -right-12 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-line bg-elevated shadow-pop animate-fade-subir sm:right-0">
          <p className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink">
            Avisos
          </p>
          {itens.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Nada novo por aqui.
            </p>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
              {itens.map((n) => {
                const conteudo = (
                  <>
                    <p className="text-sm text-ink">{n.texto}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {ROTULO[n.tipo] ?? n.tipo} · {relativo(n.created_at)}
                    </p>
                  </>
                );
                return (
                  <li
                    key={n.id}
                    className={clsx("px-4 py-3", !n.lida_em && "bg-brand-50/40")}
                  >
                    {n.pedido_id ? (
                      <Link
                        href={`/pedidos/${n.pedido_id}`}
                        onClick={() => setAberto(false)}
                        className="block hover:opacity-80"
                      >
                        {conteudo}
                      </Link>
                    ) : (
                      conteudo
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
