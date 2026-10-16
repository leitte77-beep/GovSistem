"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ArrowLeft, ArrowRight, BarChart3, CalendarDays, Car, ChevronDown, ClipboardCheck, Clock, Download, FileCode, FileSignature,
  FileSpreadsheet, FileText, Fuel, IdCard, Landmark, LayoutGrid, Loader2, Menu, Printer, Search, ShieldCheck, Star, Users,
  Warehouse, Wrench, X, type LucideIcon,
} from "lucide-react";
import { api, RelatorioCatalogo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequirePermission } from "@/components/RequirePermission";
import { AbaAbastecimentos, FILTROS_VAZIOS, FiltrosAbastecimento } from "@/components/relatorios/AbaAbastecimentos";
import { RelCNH, RelConsumo, RelEstoque, RelManutencoes, RelPrestacao, RelSecretarias } from "@/components/relatorios/AbasProprias";
import {
  FILTROS_GENERICOS_VAZIOS,
  FiltrosGenericos,
  parametros,
  RelatorioGenerico,
} from "@/components/relatorios/RelatorioGenerico";

type Aba = "secretarias" | "abastecimentos" | "consumo" | "estoque" | "manutencoes" | "cnh";
/** Relatório escolhido: a página inicial, uma tela própria, um do catálogo ("cat:chave") ou a prestação de contas. */
type Sel = "inicio" | Aba | `cat:${string}` | "prestacao";

const CATEGORIAS = ["Combustível", "Controle", "Frota", "Pessoas", "Secretarias", "Auditoria"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Atalhos de período: [início, fim] em AAAA-MM-DD (fuso do navegador). */
function periodo(tipo: "hoje" | "7d" | "mes" | "mes_passado" | "ano"): [string, string] {
  const h = new Date();
  if (tipo === "hoje") return [iso(h), iso(h)];
  if (tipo === "7d") return [iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), iso(h)];
  if (tipo === "mes") return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)];
  if (tipo === "mes_passado") return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))];
  return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)];
}

const CAT: Record<string, { Icone: LucideIcon; cor: string; fundo: string; texto: string }> = {
  "Combustível": { Icone: Fuel, cor: "#16A34A", fundo: "bg-[#E7F8EC]", texto: "text-[#106D34]" },
  Controle: { Icone: ClipboardCheck, cor: "#7C3AED", fundo: "bg-[#F4F3FF]", texto: "text-[#5925DC]" },
  Frota: { Icone: Car, cor: "#1D4ED8", fundo: "bg-[#EFF4FF]", texto: "text-[#1D4ED8]" },
  Pessoas: { Icone: Users, cor: "#0891B2", fundo: "bg-[#ECFDFF]", texto: "text-[#0E7090]" },
  Secretarias: { Icone: Landmark, cor: "#B54708", fundo: "bg-[#FFF4D6]", texto: "text-[#B54708]" },
  Auditoria: { Icone: ShieldCheck, cor: "#475467", fundo: "bg-[#F2F4F7]", texto: "text-[#475467]" },
};
const catInfo = (c?: string) => CAT[c ?? ""] ?? CAT.Auditoria;

/** Ícone próprio de cada relatório (os do catálogo herdam o da categoria). */
const ICONE_SEL: Partial<Record<string, LucideIcon>> = {
  abastecimentos: Fuel, estoque: Warehouse, consumo: BarChart3, manutencoes: Wrench, cnh: IdCard, secretarias: Landmark, prestacao: FileSignature,
};

const FORMATOS = [
  { f: "pdf", rotulo: "PDF", dica: "Pronto para imprimir e assinar", Icone: FileText },
  { f: "xlsx", rotulo: "Excel (XLSX)", dica: "Para editar, filtrar e somar", Icone: FileSpreadsheet },
  { f: "csv", rotulo: "CSV", dica: "Para importar em outros sistemas", Icone: Download },
  { f: "xml", rotulo: "XML", dica: "Arquivo estruturado (abastecimentos)", Icone: FileCode },
] as const;

const CHAVE_SEL = "govfrota_relatorio_sel";
const CHAVE_FAV = "govfrota_relatorio_favoritos";
const CHAVE_REC = "govfrota_relatorio_recentes";
const dataBR = (v: string) => (v ? v.split("-").reverse().join("/") : "…");

const ATALHOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["ano", "Este ano"]] as const;

function lerLista(chave: string): string[] {
  try { return JSON.parse(localStorage.getItem(chave) || "[]"); } catch { return []; }
}
function gravarLista(chave: string, v: string[]) {
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* ignora */ }
}

type ItemMenu = { sel: Sel; titulo: string; categoria: string; descricao: string; org?: boolean };

export default function RelatoriosPage() {
  const { restrito, user } = useAuth();
  const [sel, setSelEstado] = useState<Sel>("inicio");
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState<string | null>(null);
  const [menuExportar, setMenuExportar] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [recentes, setRecentes] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const refExportar = useRef<HTMLDivElement>(null);

  function setSel(v: Sel) {
    setSelEstado(v);
    setGaveta(false);
    setTotal(null);
    try { localStorage.setItem(CHAVE_SEL, v); } catch { /* ignora */ }
    if (v !== "inicio") {
      const r = [v, ...lerLista(CHAVE_REC).filter((x) => x !== v)].slice(0, 5);
      gravarLista(CHAVE_REC, r);
      setRecentes(r);
    }
    window.scrollTo?.({ top: 0 });
  }
  function alternarFavorito(v: string) {
    const f = favoritos.includes(v) ? favoritos.filter((x) => x !== v) : [...favoritos, v];
    gravarLista(CHAVE_FAV, f);
    setFavoritos(f);
  }
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_SEL) as Sel | null;
      if (salvo) setSelEstado(salvo);
    } catch { /* ignora */ }
    setFavoritos(lerLista(CHAVE_FAV));
    setRecentes(lerLista(CHAVE_REC));
  }, []);
  useEffect(() => {
    if (!menuExportar) return;
    const fechar = (e: MouseEvent) => { if (!refExportar.current?.contains(e.target as Node)) setMenuExportar(false); };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [menuExportar]);

  const aba = (sel.startsWith("cat:") || sel === "prestacao" || sel === "inicio" ? null : sel) as Aba | null;
  const [catalogo, setCatalogo] = useState<RelatorioCatalogo[]>([]);
  const [filtrosGen, setFiltrosGen] = useState<FiltrosGenericos>(FILTROS_GENERICOS_VAZIOS);
  const defCat = sel.startsWith("cat:") ? catalogo.find((c) => c.chave === sel.slice(4)) ?? null : null;
  const [[dataInicio, dataFim], setPeriodo] = useState<[string, string]>(() => periodo("mes"));
  const [filtrosAbast, setFiltrosAbast] = useState<FiltrosAbastecimento>(FILTROS_VAZIOS);
  const [publico, setPublico] = useState(true);
  const onTotal = useCallback((n: number | null) => setTotal(n), []);

  useEffect(() => {
    api.getConfiguracoes().then((c) => setPublico(c.tipo_organizacao !== "PRIVADO")).catch(() => {});
    api.catalogoRelatorios().then(setCatalogo).catch(() => setCatalogo([]));
  }, []);

  function exportar(endpoint: string, formato: "csv" | "xlsx" | "pdf" | "xml") {
    const params = new URLSearchParams({ formato });
    if (defCat) {
      Object.entries(parametros(defCat, dataInicio, dataFim, filtrosGen)).forEach(([k, v]) => params.set(k, v));
    } else if (endpoint.startsWith("/")) {
      params.set("inicio", dataInicio);
      params.set("fim", dataFim);
      if (filtrosGen.unidade_id) params.set("unidade_id", filtrosGen.unidade_id);
    } else {
      if (dataInicio) params.set("data_inicio", dataInicio);
      if (dataFim) params.set("data_fim", dataFim);
    }
    if (endpoint === "abastecimentos") Object.entries(filtrosAbast).forEach(([k, v]) => v && params.set(k, v));
    setMenuExportar(false);
    setExportando(formato);
    const token = localStorage.getItem("govfrota_access_token");
    const base = endpoint.startsWith("/") ? `/api/govfrota${endpoint}` : `/api/govfrota/relatorios/${endpoint}`;
    fetch(`${base}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Falha na exportação");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${endpoint.replace(/^\//, "").replace(/\//g, "-")}_${dataInicio}_a_${dataFim}.${formato}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .then(() => toast.success("Relatório baixado."))
      .catch(() => toast.error("Falha na exportação."))
      .finally(() => setExportando(null));
  }

  const endpointDaAba: Record<Aba, string> = {
    secretarias: "secretarias",
    abastecimentos: "abastecimentos",
    consumo: "veiculos/consumo",
    estoque: "estoque",
    manutencoes: "manutencoes",
    cnh: "motoristas/cnh",
  };
  const endpointSel = aba ? endpointDaAba[aba] : defCat ? `catalogo/${defCat.chave}` : "/secretaria/prestacao-contas";

  // Telas próprias + catálogo da API, agrupados por categoria.
  const menu: ItemMenu[] = useMemo(() => {
    const proprios: ItemMenu[] = [
      { sel: "abastecimentos", titulo: "Abastecimentos", categoria: "Combustível", descricao: "Todos os abastecimentos do período, com filtros por veículo, motorista, posto e nota." },
      { sel: "estoque", titulo: "Estoque dos tanques", categoria: "Combustível", org: true, descricao: "Nível atual de cada tanque próprio e entradas dos últimos 30 dias." },
      { sel: "consumo", titulo: "Consumo por veículo", categoria: "Frota", descricao: "Km rodados, litros, consumo médio e custo por km de cada veículo." },
      { sel: "manutencoes", titulo: "Manutenções", categoria: "Frota", descricao: "Manutenções solicitadas no período, com oficina, situação e valor." },
      { sel: "cnh", titulo: "Validade das CNHs", categoria: "Pessoas", org: true, descricao: "Motoristas com CNH vencida ou perto de vencer." },
      { sel: "secretarias", titulo: publico ? "Gasto por secretaria" : "Gasto por centro de custo", categoria: "Secretarias", descricao: "Quanto cada unidade gastou em combustível e manutenção, e sua participação no total." },
      { sel: "prestacao", titulo: "Prestação de contas (PDF)", categoria: "Secretarias", descricao: "Combustível e manutenção do período, comparativos, pendências, gráficos e QR code de verificação, pronto para assinatura." },
    ];
    // Estoque e CNHs são da organização toda — fora do alcance de quem vê só a secretaria.
    return [
      ...proprios.filter((p) => !(restrito && p.org)),
      ...catalogo.map((c) => ({ sel: `cat:${c.chave}` as Sel, titulo: c.titulo, categoria: c.categoria, descricao: c.descricao })),
    ];
  }, [publico, restrito, catalogo]);

  const atual = menu.find((m) => m.sel === sel);
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? menu.filter((m) => `${m.titulo} ${m.descricao}`.toLowerCase().includes(termo)) : menu;
  const formatos = FORMATOS.filter((x) => (x.f !== "csv" || sel !== "prestacao") && (x.f !== "xml" || endpointSel === "abastecimentos"));
  const iconeDe = (m?: ItemMenu) => (m && ICONE_SEL[m.sel]) || catInfo(m?.categoria).Icone;
  const IconeAtual = iconeDe(atual);
  const infoAtual = catInfo(atual?.categoria);
  const porSel = (v: string) => menu.find((m) => m.sel === v);
  const usaPeriodo = sel !== "estoque" && sel !== "cnh" && (!defCat || defCat.filtros.includes("periodo") || defCat.filtros.includes("fim"));

  const resumoFiltros = useMemo(() => {
    const partes: string[] = [];
    if (usaPeriodo) partes.push(`${dataBR(dataInicio)} a ${dataBR(dataFim)}`);
    const n = aba === "abastecimentos"
      ? Object.entries(filtrosAbast).filter(([k, v]) => v && k !== "agrupar_por").length
      : defCat || sel === "prestacao" ? Object.values(filtrosGen).filter(Boolean).length : 0;
    if (n) partes.push(`${n} filtro(s) aplicado(s)`);
    return partes.join(" · ") || "Sem filtros";
  }, [usaPeriodo, dataInicio, dataFim, aba, filtrosAbast, filtrosGen, defCat, sel]);

  /* Lista de relatórios — usada na barra lateral e na gaveta do celular. */
  const ListaRelatorios = (
    <div className="space-y-5 p-3">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar relatório…" aria-label="Buscar relatório"
          className="w-full rounded-xl border border-surface-border bg-surface-bg py-2.5 pl-9 pr-3 text-body-sm outline-none focus:border-primary focus:bg-white" />
      </div>

      <button onClick={() => setSel("inicio")}
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-body-sm font-medium transition-colors ${sel === "inicio" ? "bg-primary text-white" : "text-text-body hover:bg-surface-bg"}`}>
        <LayoutGrid size={16} /> Visão geral
      </button>

      {!termo && favoritos.some(porSel) && (
        <Grupo titulo="Favoritos" Icone={Star}>
          {favoritos.map(porSel).filter(Boolean).map((m) => <ItemLista key={m!.sel} m={m!} />)}
        </Grupo>
      )}

      {CATEGORIAS.map((cat) => {
        const itens = visiveis.filter((m) => m.categoria === cat);
        if (!itens.length) return null;
        return (
          <Grupo key={cat} titulo={cat} Icone={catInfo(cat).Icone} contador={itens.length} cor={catInfo(cat).texto}>
            {itens.map((m) => <ItemLista key={m.sel} m={m} />)}
          </Grupo>
        );
      })}
      {termo && visiveis.length === 0 && <p className="px-2 py-4 text-center text-body-sm text-text-subtle">Nenhum relatório encontrado.</p>}
      {!restrito && !termo && (
        <Grupo titulo="Prestação de contas" Icone={Landmark}>
          <Link href="/simam" className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-body-sm text-text-body hover:bg-surface-bg">
            SIM-AM (TCE-PR) <ArrowRight size={14} className="text-text-subtle" />
          </Link>
        </Grupo>
      )}
    </div>
  );

  function ItemLista({ m }: { m: ItemMenu }) {
    const Icone = iconeDe(m);
    const ativo = sel === m.sel;
    return (
      <button onClick={() => setSel(m.sel)} title={m.descricao}
        className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-body-sm transition-colors ${ativo ? "bg-[#EFF4FF] font-semibold text-primary" : "text-text-body hover:bg-surface-bg"}`}>
        <Icone size={15} className={ativo ? "text-primary" : "text-text-subtle group-hover:text-text-body"} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
        {favoritos.includes(m.sel) && <Star size={12} className="shrink-0 fill-[#F59E0B] text-[#F59E0B]" aria-label="Favorito" />}
      </button>
    );
  }

  return (
    <RequirePermission perms="reports.view">
      <div className="space-y-5">
        {/* Cabeçalho da página */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h2 text-text-title">Relatórios</h1>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-[#E7F8EC] px-2.5 py-0.5 text-meta font-semibold text-[#106D34]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" /> {menu.length} disponíveis
              </span>
            </div>
            <p className="mt-1 text-body-sm text-text-subtle">Indicadores, gráficos e listas da frota — escolha o relatório, ajuste o período e exporte.</p>
          </div>
          <button onClick={() => setGaveta(true)} className="btn btn-secondary inline-flex items-center gap-2 self-start lg:hidden">
            <Menu size={16} /> Escolher relatório
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[272px_minmax(0,1fr)]">
          <nav aria-label="Relatórios" className="hidden max-h-[calc(100vh-7rem)] self-start overflow-y-auto rounded-2xl bg-white shadow-card ring-1 ring-surface-border lg:sticky lg:top-4 lg:block print:hidden">
            {ListaRelatorios}
          </nav>

          {/* Gaveta no celular/tablet */}
          {gaveta && (
            <div className="fixed inset-0 z-50 lg:hidden print:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setGaveta(false)} />
              <div className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col bg-white shadow-elevated">
                <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
                  <p className="font-semibold text-text-title">Relatórios</p>
                  <button onClick={() => setGaveta(false)} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-surface-bg"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">{ListaRelatorios}</div>
              </div>
            </div>
          )}

          <div className="min-w-0 space-y-5">
            {sel === "inicio" ? (
              <VisaoGeral menu={menu} favoritos={favoritos} recentes={recentes} porSel={porSel} iconeDe={iconeDe} onAbrir={setSel} />
            ) : (
              <>
                {/* Cabeçalho do relatório */}
                <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-surface-border">
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${infoAtual.cor}, ${infoAtual.cor}55)` }} />
                  <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="flex min-w-0 items-start gap-4">
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${infoAtual.fundo} ${infoAtual.texto}`}>
                        <IconeAtual size={24} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <button onClick={() => setSel("inicio")} className="inline-flex items-center gap-1 text-meta font-medium text-text-subtle hover:text-primary print:hidden">
                          <ArrowLeft size={12} /> Relatórios · {atual?.categoria}
                        </button>
                        <h2 className="text-h3 font-semibold leading-tight text-text-title">{atual?.titulo ?? "Carregando…"}</h2>
                        {atual?.descricao && <p className="mt-1 max-w-2xl text-body-sm text-text-subtle">{atual.descricao}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 print:hidden">
                      <button onClick={() => alternarFavorito(sel)} aria-pressed={favoritos.includes(sel)}
                        title={favoritos.includes(sel) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                        className="rounded-xl border border-surface-border p-2.5 text-text-subtle transition hover:bg-surface-bg">
                        <Star size={17} className={favoritos.includes(sel) ? "fill-[#F59E0B] text-[#F59E0B]" : ""} />
                      </button>
                      <div className="relative" ref={refExportar}>
                        <button onClick={() => setMenuExportar((v) => !v)} disabled={!!exportando} aria-haspopup="menu" aria-expanded={menuExportar}
                          className="btn btn-primary inline-flex items-center gap-2 !rounded-xl">
                          {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                          {exportando ? `Gerando ${exportando.toUpperCase()}…` : "Exportar"}
                          <ChevronDown size={14} />
                        </button>
                        {menuExportar && (
                          <div role="menu" className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl bg-white p-1.5 shadow-elevated ring-1 ring-surface-border">
                            {total != null && (
                              <p className="px-3 pb-1.5 pt-1 text-meta text-text-subtle">{total.toLocaleString("pt-BR")} registro(s) com os filtros atuais</p>
                            )}
                            {formatos.map(({ f, rotulo, dica, Icone }) => (
                              <button key={f} role="menuitem" onClick={() => exportar(endpointSel, f)}
                                className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-bg">
                                <Icone size={18} className="mt-0.5 shrink-0 text-primary" />
                                <span>
                                  <span className="block text-body-sm font-medium text-text-title">{rotulo}</span>
                                  <span className="block text-meta text-text-subtle">{dica}</span>
                                </span>
                              </button>
                            ))}
                            <div className="my-1 border-t border-surface-border" />
                            <button role="menuitem" onClick={() => { setMenuExportar(false); setTimeout(() => window.print(), 50); }}
                              className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-bg">
                              <Printer size={18} className="mt-0.5 shrink-0 text-primary" />
                              <span>
                                <span className="block text-body-sm font-medium text-text-title">Imprimir esta tela</span>
                                <span className="block text-meta text-text-subtle">Com os gráficos, como está na tela</span>
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {usaPeriodo && (
                    <div className="flex flex-wrap items-center gap-3 border-t border-surface-border bg-[#F9FAFB] px-5 py-3 print:hidden">
                      <span className="inline-flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wider text-text-subtle">
                        <CalendarDays size={14} aria-hidden /> Período
                      </span>
                      <div className="inline-flex flex-wrap rounded-xl bg-[#EEF1F6] p-1">
                        {ATALHOS.map(([k, l]) => {
                          const [i, f] = periodo(k);
                          const ativo = dataInicio === i && dataFim === f;
                          return (
                            <button key={k} onClick={() => setPeriodo([i, f])} aria-pressed={ativo}
                              className={`rounded-lg px-3 py-1.5 text-meta transition ${ativo ? "bg-white font-semibold text-primary shadow-sm" : "font-medium text-text-subtle hover:text-text-title"}`}>
                              {l}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="date" aria-label="Data inicial" value={dataInicio} max={dataFim} onChange={(e) => e.target.value && setPeriodo([e.target.value, dataFim])}
                          className="input !w-auto !py-1.5 !text-meta" />
                        <span className="text-meta text-text-subtle">até</span>
                        <input type="date" aria-label="Data final" value={dataFim} min={dataInicio} onChange={(e) => e.target.value && setPeriodo([dataInicio, e.target.value])}
                          className="input !w-auto !py-1.5 !text-meta" />
                      </div>
                    </div>
                  )}
                  {/* Na impressão, o período aparece como texto. */}
                  <p className="hidden border-t border-surface-border px-5 py-2 text-meta text-text-subtle print:block">{resumoFiltros}</p>
                </div>

                {defCat && (
                  <RelatorioGenerico def={defCat} dataInicio={dataInicio} dataFim={dataFim} filtros={filtrosGen} setFiltros={setFiltrosGen} publico={publico} onTotal={onTotal} />
                )}
                {sel === "prestacao" && (
                  <RelPrestacao dataInicio={dataInicio} dataFim={dataFim} publico={publico} unidade={filtrosGen.unidade_id}
                    setUnidade={(v) => setFiltrosGen({ ...filtrosGen, unidade_id: v })} />
                )}
                {aba === "abastecimentos" && (
                  <AbaAbastecimentos dataInicio={dataInicio} dataFim={dataFim} filtros={filtrosAbast} setFiltros={setFiltrosAbast} publico={publico} onTotal={onTotal} />
                )}
                {aba === "secretarias" && <RelSecretarias dataInicio={dataInicio} dataFim={dataFim} publico={publico} onTotal={onTotal} />}
                {aba === "consumo" && <RelConsumo dataInicio={dataInicio} dataFim={dataFim} publico={publico} onTotal={onTotal} />}
                {aba === "estoque" && <RelEstoque dataInicio={dataInicio} dataFim={dataFim} publico={publico} onTotal={onTotal} />}
                {aba === "manutencoes" && <RelManutencoes dataInicio={dataInicio} dataFim={dataFim} publico={publico} onTotal={onTotal} />}
                {aba === "cnh" && <RelCNH dataInicio={dataInicio} dataFim={dataFim} publico={publico} onTotal={onTotal} />}

                {/* Rodapé de rastreabilidade */}
                <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-dashed border-surface-border px-5 py-3 text-meta text-text-subtle">
                  <span className="inline-flex items-center gap-1.5"><Clock size={13} /> Gerado em {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  {user && <span>por <b className="font-semibold text-text-body">{user.name || user.email}</b></span>}
                  <span>{resumoFiltros}</span>
                  {total != null && <span>{total.toLocaleString("pt-BR")} registro(s)</span>}
                </footer>
              </>
            )}
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}

function Grupo({ titulo, Icone, contador, cor = "text-text-subtle", children }: {
  titulo: string; Icone: LucideIcon; contador?: number; cor?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider ${cor}`}>
        <Icone size={13} aria-hidden /> <span className="flex-1">{titulo}</span>
        {contador != null && <span className="rounded-pill bg-[#F2F4F7] px-1.5 text-[10px] font-semibold text-text-subtle">{contador}</span>}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Página inicial: atalhos (favoritos/recentes) e todos os relatórios em cartões por categoria. */
function VisaoGeral({ menu, favoritos, recentes, porSel, iconeDe, onAbrir }: {
  menu: ItemMenu[];
  favoritos: string[];
  recentes: string[];
  porSel: (v: string) => ItemMenu | undefined;
  iconeDe: (m?: ItemMenu) => LucideIcon;
  onAbrir: (s: Sel) => void;
}) {
  const atalhos = [...favoritos, ...recentes.filter((r) => !favoritos.includes(r))].map(porSel).filter(Boolean).slice(0, 4) as ItemMenu[];
  const destaques = atalhos.length ? atalhos : (["abastecimentos", "secretarias", "consumo", "prestacao"].map(porSel).filter(Boolean) as ItemMenu[]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1E3D] via-[#1D3A8A] to-[#1D4ED8] p-6 text-white shadow-card">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <p className="text-meta font-semibold uppercase tracking-wider text-white/70">{atalhos.length ? "Seus atalhos" : "Mais usados"}</p>
        <h2 className="mt-1 text-h3 font-semibold">Comece por aqui</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {destaques.map((m) => {
            const Icone = iconeDe(m);
            return (
              <button key={m.sel} onClick={() => onAbrir(m.sel)}
                className="group flex items-center gap-3 rounded-xl bg-white/10 p-3 text-left ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><Icone size={19} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-semibold">{m.titulo}</span>
                  <span className="block truncate text-meta text-white/70">{m.categoria}</span>
                </span>
                <ArrowRight size={16} className="shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      </section>

      {CATEGORIAS.map((cat) => {
        const itens = menu.filter((m) => m.categoria === cat);
        if (!itens.length) return null;
        const info = catInfo(cat);
        return (
          <section key={cat}>
            <h3 className={`mb-3 flex items-center gap-2 text-body font-semibold ${info.texto}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-lg ${info.fundo}`}><info.Icone size={15} /></span>
              {cat}
              <span className="text-meta font-medium text-text-subtle">· {itens.length}</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {itens.map((m) => {
                const Icone = iconeDe(m);
                return (
                  <button key={m.sel} onClick={() => onAbrir(m.sel)}
                    className="group relative flex items-start gap-3 overflow-hidden rounded-2xl bg-white p-4 text-left shadow-card ring-1 ring-surface-border transition hover:-translate-y-0.5 hover:shadow-elevated hover:ring-primary/30">
                    <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: info.cor }} />
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${info.fundo} ${info.texto}`}><Icone size={19} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-text-title">
                        {m.titulo}
                        {favoritos.includes(m.sel) && <Star size={12} className="fill-[#F59E0B] text-[#F59E0B]" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-meta text-text-subtle">{m.descricao}</span>
                    </span>
                    <ArrowRight size={16} className="mt-1 shrink-0 text-text-subtle opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
