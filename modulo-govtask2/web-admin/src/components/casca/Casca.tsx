"use client";

/**
 * Casca do GovTask: sidebar (recolhível) + topbar + conteúdo; no celular, a
 * sidebar vira gaveta e a navegação principal desce para uma barra inferior
 * ao alcance do polegar.
 */

import clsx from "clsx";
import { ChevronsLeft, ChevronsRight, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Topbar } from "@/components/casca/Topbar";
import { itemAtivo, menuDo, type ItemNav } from "@/components/casca/navegacao";
import { ROTULO_PERFIL, iniciais, useSessao } from "@/lib/sessao";

const CHAVE_RECOLHIDA = "govtask_sidebar_recolhida";
const FUNDO_RAIL = "bg-gradient-to-b from-[#0A1222] to-[#060B17]";

function Marca({ recolhida }: { recolhida?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="relative">
        <span
          className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 opacity-70 blur-[3px]"
          aria-hidden
        />
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 font-display text-sm font-extrabold text-brand-900">
          GT
        </span>
      </span>
      {!recolhida && (
        <span className="leading-tight">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-[15px] font-bold tracking-wide text-white">GovTask</span>
            <span className="rounded border border-amber-400/30 bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300">
              PRO
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Gabinete digital
          </span>
        </span>
      )}
    </Link>
  );
}

function LinkNav({
  item,
  recolhida,
  aoNavegar,
}: {
  item: ItemNav;
  recolhida?: boolean;
  aoNavegar?: () => void;
}) {
  const caminho = usePathname();
  const busca = useSearchParams();
  const ativo = itemAtivo(item.href, caminho, busca.toString());
  const Icone = item.icone;
  return (
    <Link
      href={item.href}
      onClick={aoNavegar}
      title={recolhida ? item.rotulo : undefined}
      aria-current={ativo ? "page" : undefined}
      className={clsx(
        "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all duration-200",
        recolhida && "justify-center px-0",
        ativo
          ? "border-blue-400/40 bg-gradient-to-r from-blue-600/90 to-blue-700/80 font-semibold text-white shadow-[0_0_24px_-4px_rgba(37,99,235,0.45)]"
          : "border-transparent text-slate-300 hover:border-white/[.06] hover:bg-white/[.06] hover:text-white"
      )}
    >
      <span
        className={clsx(
          "grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors",
          ativo
            ? "bg-white/20 text-white"
            : "bg-slate-800/80 text-slate-400 group-hover:bg-slate-700/80 group-hover:text-slate-200"
        )}
      >
        <Icone size={15} aria-hidden />
      </span>
      {!recolhida && <span className="truncate">{item.rotulo}</span>}
    </Link>
  );
}

function Lateral({
  recolhida,
  aoNavegar,
  aoRecolher,
}: {
  recolhida?: boolean;
  aoNavegar?: () => void;
  aoRecolher?: () => void;
}) {
  const { eu, perfil } = useSessao();
  const menu = menuDo(perfil, Boolean(eu?.pode_gerir_usuarios));
  const capacidades = [
    eu?.pode_criar && "Criar",
    eu?.pode_encaminhar && "Encaminhar",
    eu?.pode_trabalhar && "Executar",
    eu?.pode_gerir_usuarios && "Administrar",
  ].filter(Boolean) as string[];

  return (
    <div className="relative flex h-full flex-col">
      {/* Brilho ambiente no topo da sidebar */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-600/10 via-blue-500/5 to-transparent"
        aria-hidden
      />

      <div className={clsx("relative flex items-center pt-5", recolhida ? "justify-center px-2" : "px-5")}>
        <Marca recolhida={recolhida} />
      </div>

      {eu?.pode_criar && (
        <Link
          href="/pedidos/novo"
          onClick={aoNavegar}
          title="Novo pedido"
          className={clsx(
            "relative mt-6 inline-flex items-center justify-center gap-2 rounded-btn bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 text-sm font-bold text-brand-900 shadow-[0_8px_20px_-8px_rgba(245,158,11,0.6)] transition hover:from-amber-300 hover:to-amber-400",
            recolhida ? "mx-auto h-10 w-10 p-0" : "mx-4"
          )}
        >
          <Plus size={17} aria-hidden />
          {!recolhida && "Novo pedido"}
        </Link>
      )}

      <nav className={clsx("relative mt-7 flex-1 space-y-1.5 overflow-y-auto", recolhida ? "px-2" : "px-3.5")}>
        {!recolhida && (
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
              {ROTULO_PERFIL[perfil]}
            </span>
            <span className="flex items-center gap-1.5 rounded border border-blue-400/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {eu?.setor ?? "Online"}
            </span>
          </div>
        )}
        {menu.trabalho.map((item) => (
          <LinkNav key={item.href} item={item} recolhida={recolhida} aoNavegar={aoNavegar} />
        ))}
        {menu.admin.length > 0 && (
          <>
            {!recolhida && (
              <p className="px-3 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                Administração
              </p>
            )}
            {recolhida && <div className="my-3 border-t border-white/10" />}
            {menu.admin.map((item) => (
              <LinkNav key={item.href} item={item} recolhida={recolhida} aoNavegar={aoNavegar} />
            ))}
          </>
        )}
      </nav>

      {!recolhida && capacidades.length > 0 && (
        <div className="relative mx-4 mb-2 rounded-xl border border-white/10 bg-gradient-to-br from-white/[.07] to-white/[.02] p-3.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/45">Seu acesso</span>
            <span className="font-semibold text-amber-300">{ROTULO_PERFIL[perfil]}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {capacidades.map((c) => (
              <span
                key={c}
                className="rounded-md border border-white/10 bg-white/[.05] px-1.5 py-0.5 text-[10px] font-medium text-white/60"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {eu && (
        <div className={clsx("relative border-t border-white/10", recolhida ? "p-2" : "p-4")}>
          <div className={clsx("flex items-center gap-3", recolhida && "justify-center")}>
            <span className="relative">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-700 text-xs font-bold text-white ring-2 ring-white/10"
                title={eu.nome}
              >
                {iniciais(eu.nome)}
              </span>
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#08101F]"
                aria-hidden
              />
            </span>
            {!recolhida && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-white">{eu.nome}</span>
                <span className="block truncate text-[11px] text-white/45">
                  {ROTULO_PERFIL[perfil]}
                  {eu.setor ? ` · ${eu.setor[0]}${eu.setor.slice(1).toLowerCase()}` : ""}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
      {aoRecolher && (
        <button
          onClick={aoRecolher}
          className="relative flex items-center justify-center gap-2 border-t border-white/10 py-2.5 text-xs text-white/45 transition-colors hover:text-white"
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
        >
          {recolhida ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!recolhida && "Recolher"}
        </button>
      )}
    </div>
  );
}

function BarraInferior() {
  const { eu, perfil } = useSessao();
  const caminho = usePathname();
  const busca = useSearchParams();
  const itens = menuDo(perfil, false).trabalho.slice(0, eu?.pode_criar ? 4 : 5);
  const metade = Math.ceil(itens.length / 2);

  function Item({ item }: { item: ItemNav }) {
    const ativo = itemAtivo(item.href, caminho, busca.toString());
    const Icone = item.icone;
    return (
      <Link
        href={item.href}
        aria-current={ativo ? "page" : undefined}
        className={clsx(
          "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-medium transition-colors",
          ativo ? "text-brand" : "text-ink-muted"
        )}
      >
        <Icone size={21} aria-hidden strokeWidth={ativo ? 2.3 : 1.8} />
        {item.curto ?? item.rotulo}
      </Link>
    );
  }

  return (
    <nav
      className="pb-seguro fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-line bg-paper/95 px-1 pt-1 backdrop-blur lg:hidden print:hidden"
      aria-label="Navegação principal"
    >
      {itens.slice(0, metade).map((i) => (
        <Item key={i.href} item={i} />
      ))}
      {eu?.pode_criar && (
        <Link
          href="/pedidos/novo"
          className="-mt-5 mx-1 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand text-white shadow-pop ring-4 ring-canvas"
          aria-label="Novo pedido"
        >
          <Plus size={24} aria-hidden />
        </Link>
      )}
      {itens.slice(metade).map((i) => (
        <Item key={i.href} item={i} />
      ))}
    </nav>
  );
}

export function Casca({ children }: { children: React.ReactNode }) {
  const [gaveta, setGaveta] = useState(false);
  const [recolhida, setRecolhida] = useState(false);
  const caminho = usePathname();

  useEffect(() => {
    try {
      setRecolhida(localStorage.getItem(CHAVE_RECOLHIDA) === "1");
    } catch {
      /* sem storage: começa expandida */
    }
  }, []);

  useEffect(() => setGaveta(false), [caminho]);

  function alternarRecolhida() {
    setRecolhida((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, r ? "0" : "1");
      } catch {
        /* ignora */
      }
      return !r;
    });
  }

  return (
    <div
      className={clsx(
        "min-h-screen lg:grid print:block",
        recolhida ? "lg:grid-cols-[4.5rem_1fr]" : "lg:grid-cols-[16.5rem_1fr]"
      )}
    >
      <aside className={clsx("sticky top-0 hidden h-screen lg:block print:hidden", FUNDO_RAIL)}>
        <Suspense>
          <Lateral recolhida={recolhida} aoRecolher={alternarRecolhida} />
        </Suspense>
      </aside>

      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button
            className="absolute inset-0 bg-[#050912]/70 backdrop-blur-sm"
            onClick={() => setGaveta(false)}
            aria-label="Fechar menu"
          />
          <div className={clsx("absolute inset-y-0 left-0 w-72 animate-fade-subir shadow-pop", FUNDO_RAIL)}>
            <button
              className="botao absolute right-2 top-3 px-2 text-white/70"
              onClick={() => setGaveta(false)}
              aria-label="Fechar"
            >
              <X size={18} aria-hidden />
            </button>
            <Suspense>
              <Lateral aoNavegar={() => setGaveta(false)} />
            </Suspense>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <Topbar aoAbrirMenu={() => setGaveta(true)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7 print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <Suspense>
        <BarraInferior />
      </Suspense>
    </div>
  );
}
