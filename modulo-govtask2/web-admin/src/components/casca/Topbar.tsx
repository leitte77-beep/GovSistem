"use client";

/**
 * Topbar: busca global (atalho "/" ou Ctrl+K), indicador ao vivo, tema,
 * avisos e o usuário. No celular, abre a gaveta do menu.
 */

import clsx from "clsx";
import { LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { EtiquetaSituacao } from "@/components/Etiquetas";
import { Notificacoes } from "@/components/Notificacoes";
import { api, encerrarSessao, SAAS_URL, type PedidoLinha } from "@/lib/api";
import { ROTULO_PERFIL, iniciais, useSessao } from "@/lib/sessao";
import { useTema } from "@/lib/tema";
import { useTempoReal } from "@/lib/tempoReal";

function AoVivo() {
  const { conectado } = useTempoReal();
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const relogio = new Date(agora).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span
      className={clsx(
        "hidden items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
        conectado
          ? "border-estado-concluido/20 bg-estado-concluido/10 text-estado-concluido"
          : "border-line bg-ink/[.05] text-ink-faint"
      )}
      title={conectado ? "Atualizando em tempo real" : "Reconectando…"}
    >
      <span className="relative flex h-2 w-2">
        {conectado && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-estado-concluido opacity-60" />
        )}
        <span
          className={clsx(
            "relative inline-flex h-2 w-2 rounded-full",
            conectado ? "bg-estado-concluido" : "bg-ink-faint"
          )}
        />
      </span>
      {conectado ? "Ao vivo" : "Offline"}
      <span className="font-mono text-[10px] font-normal opacity-70">{relogio}</span>
    </span>
  );
}

function BuscaGlobal() {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<PedidoLinha[]>([]);
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      const digitando = ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !digitando)) {
        e.preventDefault();
        campo.current?.focus();
      }
    }
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    window.addEventListener("keydown", atalho);
    document.addEventListener("mousedown", fora);
    return () => {
      window.removeEventListener("keydown", atalho);
      document.removeEventListener("mousedown", fora);
    };
  }, []);

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) {
      setItens([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .listar({ q, tamanho: 6 })
        .then((r) => {
          setItens(r.itens);
          setFoco(0);
        })
        .catch(() => setItens([]));
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  function ir(p?: PedidoLinha) {
    setAberto(false);
    if (p) router.push(`/pedidos/${p.id}`);
    else if (termo.trim()) router.push(`/pedidos?q=${encodeURIComponent(termo.trim())}`);
    campo.current?.blur();
  }

  return (
    <div ref={caixa} className="relative min-w-0 flex-1 sm:max-w-md">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        ref={campo}
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setFoco((f) => Math.min(f + 1, itens.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFoco((f) => Math.max(f - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            ir(foco < itens.length ? itens[foco] : undefined);
          } else if (e.key === "Escape") {
            setAberto(false);
            campo.current?.blur();
          }
        }}
        placeholder="Buscar pedido, número, protocolo, deputado…"
        aria-label="Buscar pedidos"
        className="h-10 w-full rounded-xl border border-line bg-canvas pl-9 pr-20 text-sm text-ink placeholder:text-ink-faint transition-all focus:border-brand focus:bg-paper focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <div className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 md:flex">
        <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-faint">
          ⌘K
        </kbd>
        <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-faint">
          /
        </kbd>
      </div>

      {aberto && termo.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-card border border-line bg-elevated shadow-pop animate-fade-subir">
          {itens.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-ink-muted">Nada encontrado.</p>
          ) : (
            <ul className="divide-y divide-line">
              {itens.map((p, i) => (
                <li key={p.id}>
                  <button
                    onMouseEnter={() => setFoco(i)}
                    onClick={() => ir(p)}
                    className={clsx(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                      foco === i && "bg-brand-50"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="numero">{p.numero}</span>
                      <span className="block truncate text-sm text-ink">{p.titulo}</span>
                    </span>
                    <EtiquetaSituacao situacao={p.situacao} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => ir()}
            onMouseEnter={() => setFoco(itens.length)}
            className={clsx(
              "w-full border-t border-line px-4 py-2.5 text-left text-sm text-brand",
              foco === itens.length && "bg-brand-50"
            )}
          >
            Ver todos os resultados para “{termo.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}

function MenuUsuario() {
  const { eu, perfil } = useSessao();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  if (!eu) return null;
  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 via-brand to-brand-800 text-xs font-bold text-white ring-2 ring-paper transition hover:scale-105"
        aria-label="Conta"
      >
        {iniciais(eu.nome)}
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-card border border-line bg-elevated shadow-pop animate-fade-subir">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{eu.nome}</p>
            <p className="truncate text-xs text-ink-muted">{eu.email}</p>
            <p className="mt-1.5 inline-flex rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              {ROTULO_PERFIL[perfil]}
            </p>
          </div>
          <button
            onClick={() => {
              encerrarSessao();
              window.location.href = SAAS_URL;
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas"
          >
            <LogOut size={15} aria-hidden /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const [tema, alternarTema] = useTema();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 shadow-sm backdrop-blur-md print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-btn text-ink-soft hover:bg-canvas lg:hidden"
          onClick={aoAbrirMenu}
          aria-label="Abrir menu"
        >
          <Menu size={20} aria-hidden />
        </button>
        <Link href="/" className="shrink-0 font-display text-lg font-medium text-ink sm:hidden">
          GovTask
        </Link>
        <div className="hidden min-w-0 flex-1 sm:flex">
          <BuscaGlobal />
        </div>
        <div className="flex-1 sm:hidden" />
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <AoVivo />
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
          <Link
            href="/pedidos"
            className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted hover:bg-canvas sm:hidden"
            aria-label="Buscar"
          >
            <Search size={19} aria-hidden />
          </Link>
          <button
            onClick={alternarTema}
            className="grid h-10 w-10 place-items-center rounded-xl border border-transparent text-ink-muted transition-colors hover:border-line hover:bg-canvas hover:text-ink"
            aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            title={tema === "dark" ? "Tema claro" : "Tema escuro"}
          >
            {tema === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Notificacoes />
          <MenuUsuario />
        </div>
      </div>
    </header>
  );
}
