"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Clock, FileSpreadsheet, FileText, Gauge, MapPin, Plus, Route, Search,
  SearchX, SlidersHorizontal, X,
} from "lucide-react";
import { api, FiltroUsos, Unidade, UsoVeiculo } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { BadgeStatusUso, duracaoUso, medicaoUso } from "@/components/uso/uso";

const LIMITE = 30;

const STATUS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "EM_USO", rotulo: "Em uso" },
  { valor: "CONCLUIDO", rotulo: "Concluídos" },
  { valor: "ENCERRADO_GESTOR", rotulo: "Encerrados pela gestão" },
];

// Atalhos de período: datas no fuso do navegador, formato do <input type="date">.
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function periodo(chave: string): [string, string] | [undefined, undefined] {
  const hoje = new Date();
  if (chave === "hoje") return [iso(hoje), iso(hoje)];
  if (chave === "7d") return [iso(new Date(hoje.getTime() - 6 * 864e5)), iso(hoje)];
  if (chave === "mes") return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje)];
  return [undefined, undefined];
}
const PERIODOS: [string, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este mês"], ["tudo", "Tudo"]];

function iniciais(nome: string | null) {
  return (nome || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default function UsosPage() {
  const { hasPermission, restrito } = useAuth();
  const podeGerir = hasPermission("vehicle.manage");
  const [filtros, setFiltros] = useState<FiltroUsos>(() => {
    const [i, f] = periodo("mes");
    return { data_inicio: i, data_fim: f };
  });
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [dados, setDados] = useState<{ itens: UsoVeiculo[]; total: number } | null>(null);
  const [resumo, setResumo] = useState<{ total: number; concluidos: number; km: number; horas: number; com_alerta: number; veiculos: number } | null>(null);
  const [emUso, setEmUso] = useState<UsoVeiculo[]>([]);
  const [veiculos, setVeiculos] = useState<{ id: string; placa: string }[]>([]);
  const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const router = useRouter();
  const [lancando, setLancando] = useState(false);

  const carregar = useCallback(() => {
    const base = { ...filtros, search: busca || undefined };
    api.listUsos({ ...base, skip: (pagina - 1) * LIMITE, limit: LIMITE })
      .then(setDados).catch((e) => toast.error((e as Error).message));
    api.resumoUsos({ ...base, status: undefined }).then(setResumo).catch(() => {});
    api.usosEmUso().then(setEmUso).catch(() => {});
  }, [filtros, busca, pagina]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api.listVeiculos({ limit: 500 }).then((r) => setVeiculos(r.itens)).catch(() => {});
    api.listMotoristas({ limit: 500 }).then((r) => setMotoristas(r.itens)).catch(() => {});
    if (!restrito) api.listUnidades(true).then(setUnidades).catch(() => {});
    // Links antigos (/usos?uso=<id>) vão para a página do uso.
    const id = new URLSearchParams(window.location.search).get("uso");
    if (id) router.replace(`/usos/${id}`);
  }, [restrito, router]);

  function filtrar(chave: keyof FiltroUsos, valor: string | undefined) {
    setFiltros((f) => ({ ...f, [chave]: valor || undefined }));
    setPagina(1);
  }

  function escolherPeriodo(chave: string) {
    const [i, f] = periodo(chave);
    setFiltros((x) => ({ ...x, data_inicio: i, data_fim: f }));
    setPagina(1);
  }

  async function exportar(formato: "xlsx" | "pdf") {
    try {
      await api.exportarUsos(formato, { ...filtros, search: busca || undefined });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const periodoAtivo = PERIODOS.find(([k]) => {
    const [i, f] = periodo(k);
    return (filtros.data_inicio ?? undefined) === i && (filtros.data_fim ?? undefined) === f;
  })?.[0];

  const chips = [
    filtros.veiculo_id && { chave: "veiculo_id" as const, label: `Veículo: ${veiculos.find((v) => v.id === filtros.veiculo_id)?.placa ?? "…"}` },
    filtros.motorista_id && { chave: "motorista_id" as const, label: `Motorista: ${motoristas.find((m) => m.id === filtros.motorista_id)?.nome ?? "…"}` },
    filtros.unidade_id && { chave: "unidade_id" as const, label: `Secretaria: ${unidades.find((u) => u.id === filtros.unidade_id)?.nome ?? "…"}` },
    !periodoAtivo && (filtros.data_inicio || filtros.data_fim) && {
      chave: "periodo" as const,
      label: `Período: ${[filtros.data_inicio, filtros.data_fim].map((d) => d ? d.split("-").reverse().join("/") : "…").join(" a ")}`,
    },
  ].filter(Boolean) as { chave: keyof FiltroUsos | "periodo"; label: string }[];

  function removerChip(chave: keyof FiltroUsos | "periodo") {
    if (chave === "periodo") escolherPeriodo("tudo");
    else filtrar(chave, undefined);
  }

  const total = dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / LIMITE));
  const temFiltro = chips.length > 0 || !!busca || !!filtros.status;
  const atrasados = emUso.filter((u) => u.atrasado).length;

  return (
    <RequirePermission perms="vehicle.view">
      <div className="flex flex-col gap-6">
        {/* Cabeçalho */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex items-center gap-4">
            <span className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1D5BD6] to-[#153B8F] text-white shadow-lg shadow-[#1D5BD6]/25 sm:flex">
              <Route size={28} />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-on-background">Diário de Bordo</h1>
              <p className="mt-1 text-[15px] text-on-surface-variant">Saídas e chegadas dos veículos, com km/horímetro e foto do painel.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-card shadow-sm">
              <button onClick={() => exportar("xlsx")} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low">
                <FileSpreadsheet size={16} className="text-[#067647]" /> Excel
              </button>
              <span className="w-px bg-outline-variant/40" />
              <button onClick={() => exportar("pdf")} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low">
                <FileText size={16} className="text-[#B42318]" /> PDF
              </button>
            </div>
            {podeGerir && (
              <button onClick={() => setLancando(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-secondary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-secondary/30">
                <Plus size={18} /> Lançar uso
              </button>
            )}
          </div>
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador icone={<Route size={20} />} cor="bg-[#E5EEFF] text-[#1D5BD6]" titulo="Usos no período"
            valor={resumo ? resumo.total.toLocaleString("pt-BR") : "—"}
            detalhe={resumo ? `${resumo.veiculos} veículo${resumo.veiculos === 1 ? "" : "s"}` : undefined} />
          <Indicador icone={<Gauge size={20} />} cor="bg-[#DCFCE7] text-[#067647]" titulo="Km percorridos"
            valor={resumo ? `${resumo.km.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km` : "—"}
            detalhe={resumo && resumo.horas > 0 ? `+ ${resumo.horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h de máquina` : undefined} />
          <Indicador icone={<Clock size={20} />} cor={atrasados ? "bg-red-100 text-[#B42318]" : "bg-[#FEF3C7] text-[#B45309]"} titulo="Em uso agora"
            valor={String(emUso.length)}
            detalhe={atrasados ? `${atrasados} há mais de 8 h` : emUso.length ? "dentro do prazo" : "nenhum veículo fora"} destaque={atrasados > 0} />
          <Indicador icone={<AlertTriangle size={20} />} cor="bg-[#FFF1E6] text-[#B54708]" titulo="Com aviso de km"
            valor={resumo ? String(resumo.com_alerta) : "—"} detalhe="km de saída divergente" />
        </div>

        {/* Em uso agora */}
        {emUso.length > 0 && (
          <section className="rounded-2xl border border-outline-variant/30 bg-surface-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#16A34A]" />
              </span>
              <h2 className="text-label font-semibold text-text-title">Na rua agora</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {emUso.map((u) => (
                <button key={u.id} onClick={() => router.push(`/usos/${u.id}`)}
                  className={`w-64 shrink-0 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${u.atrasado ? "border-red-200 bg-red-50/70" : "border-outline-variant/40 bg-surface-container-lowest"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md border-2 border-[#0F172A] bg-white px-1.5 font-mono text-sm font-bold leading-5">{u.veiculo_placa}</span>
                    <span className={`inline-flex items-center gap-1 text-meta font-semibold ${u.atrasado ? "text-[#B42318]" : "text-on-surface-variant"}`}>
                      {u.atrasado ? <AlertTriangle size={13} /> : <Clock size={13} />} {duracaoUso(u.duracao_min)}
                    </span>
                  </div>
                  {u.veiculo_modelo && <p className="mt-2 truncate text-sm font-semibold text-on-surface">{u.veiculo_modelo}</p>}
                  <p className={`${u.veiculo_modelo ? "mt-0.5" : "mt-2"} truncate text-meta text-on-surface`}>{u.motorista_nome}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-meta text-on-surface-variant"><MapPin size={12} className="shrink-0" /> {u.destino}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Busca, situação, período e filtros */}
        <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card p-2 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input placeholder="Buscar placa, motorista, destino…" value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                className="w-full rounded-xl border-none bg-transparent py-3 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-0" />
            </div>
            <div className="flex flex-wrap items-center gap-2 px-1">
              <div className="inline-flex rounded-xl bg-surface-container-low p-1">
                {PERIODOS.map(([k, r]) => (
                  <button key={k} onClick={() => escolherPeriodo(k)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${periodoAtivo === k ? "bg-surface-card font-semibold text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>
                    {r}
                  </button>
                ))}
              </div>
              <select aria-label="Situação" value={filtros.status ?? ""} onChange={(e) => filtrar("status", e.target.value)}
                className="rounded-xl border border-outline-variant/40 bg-surface-card px-3 py-2 text-sm text-on-surface">
                {STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.valor ? s.rotulo : "Todas as situações"}</option>)}
              </select>
              <button onClick={() => setMostrarFiltros((m) => !m)}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-container-low">
                <SlidersHorizontal size={16} className="text-on-surface-variant" /> Filtros
                <ChevronDown size={14} className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
                {chips.length > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] text-white">{chips.length}</span>}
              </button>
            </div>
          </div>

          {mostrarFiltros && (
            <div className="grid gap-3 border-t border-outline-variant/30 p-2 pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <Campo texto="Veículo">
                <select className="input" value={filtros.veiculo_id ?? ""} onChange={(e) => filtrar("veiculo_id", e.target.value)}>
                  <option value="">Todos</option>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
                </select>
              </Campo>
              <Campo texto="Motorista">
                <select className="input" value={filtros.motorista_id ?? ""} onChange={(e) => filtrar("motorista_id", e.target.value)}>
                  <option value="">Todos</option>
                  {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </Campo>
              {unidades.length > 0 && (
                <Campo texto="Secretaria">
                  <select className="input" value={filtros.unidade_id ?? ""} onChange={(e) => filtrar("unidade_id", e.target.value)}>
                    <option value="">Todas</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </Campo>
              )}
              <Campo texto="De">
                <input type="date" className="input" value={filtros.data_inicio ?? ""} onChange={(e) => filtrar("data_inicio", e.target.value)} />
              </Campo>
              <Campo texto="Até">
                <input type="date" className="input" value={filtros.data_fim ?? ""} onChange={(e) => filtrar("data_fim", e.target.value)} />
              </Campo>
            </div>
          )}
        </div>

        {chips.length > 0 && (
          <div className="-mt-3 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-meta font-medium text-[#1D5BD6]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
          </div>
        )}

        {/* Lista */}
        {dados && total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card px-6 py-16 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container text-[#1D4ED8]">
              {temFiltro ? <SearchX size={26} /> : <Route size={26} />}
            </div>
            <h2 className="mt-1 text-h3 text-on-surface">{temFiltro ? "Nenhum uso com esses filtros" : "Nenhum uso registrado no período"}</h2>
            <p className="max-w-md text-sm text-on-surface-variant">
              {temFiltro
                ? "Tente outro período ou limpe os filtros."
                : <>Os motoristas registram pelo app, no botão <strong>Usar veículo</strong>. Usos anotados em papel podem ser lançados aqui.</>}
            </p>
            {!temFiltro && podeGerir && (
              <button onClick={() => setLancando(true)} className="btn btn-primary btn-sm mt-3"><Plus size={14} /> Lançar uso</button>
            )}
            {temFiltro && (
              <button onClick={() => { setBusca(""); setFiltros({}); setPagina(1); }} className="btn btn-secondary btn-sm mt-3">Limpar filtros</button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm">
            <ul className="divide-y divide-outline-variant/20">
              {!dados && Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex animate-pulse items-center gap-4 p-4">
                  <div className="h-11 w-11 rounded-full bg-surface-container" />
                  <div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-surface-container" /><div className="h-3 w-1/2 rounded bg-surface-container" /></div>
                </li>
              ))}
              {dados?.itens.map((u) => (
                <li key={u.id}>
                  <button onClick={() => router.push(`/usos/${u.id}`)} className="group flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-surface-container-lowest md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E5EEFF] to-[#C7D7FE] text-sm font-bold text-[#1D4ED8]">
                        {iniciais(u.motorista_nome)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-on-surface group-hover:text-secondary">{u.motorista_nome}</span>
                          {u.unidade_nome && <span className="text-meta text-on-surface-variant">{u.unidade_nome}</span>}
                        </div>
                        <p className="mt-0.5 flex items-center gap-2 text-sm text-on-surface">
                          <span className="rounded-md border border-[#0F172A]/70 bg-white px-1.5 font-mono text-xs font-bold leading-5 text-[#0F172A]">{u.veiculo_placa}</span>
                          <span className="truncate font-medium">{u.veiculo_modelo || "Veículo"}</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-on-surface"><MapPin size={13} className="shrink-0 text-on-surface-variant" /> {u.destino}</p>
                        <p className="truncate text-meta text-on-surface-variant">{u.finalidade}</p>
                      </div>
                    </div>

                    {/* Linha do tempo saída → chegada */}
                    <div className="flex items-center gap-3 md:w-[300px]">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-on-surface">{hora(u.saida_em)}</p>
                        <p className="text-meta text-on-surface-variant">{dia(u.saida_em)}</p>
                      </div>
                      <div className="flex flex-1 flex-col items-center">
                        <span className="text-meta font-medium text-on-surface-variant">{duracaoUso(u.duracao_min)}</span>
                        <div className="relative my-1 h-0.5 w-full rounded bg-outline-variant/40">
                          <span className="absolute -left-0.5 -top-[3px] h-2 w-2 rounded-full bg-[#1D5BD6]" />
                          <span className={`absolute -right-0.5 -top-[3px] h-2 w-2 rounded-full ${u.chegada_em ? "bg-[#16A34A]" : "animate-pulse bg-[#F59E0B] motion-reduce:animate-none"}`} />
                        </div>
                        <span className="text-meta font-semibold text-on-surface">{u.percorrido != null ? medicaoUso(u.percorrido, u.usa_horimetro) : "em andamento"}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{u.chegada_em ? hora(u.chegada_em) : "—"}</p>
                        <p className="text-meta text-on-surface-variant">{u.chegada_em ? dia(u.chegada_em) : ""}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:w-[210px] md:justify-end">
                      {u.alertas.length > 0 && (
                        <span title={u.alertas.map((a) => a.mensagem).join("\n")} className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-[#B54708]">
                          <AlertTriangle size={14} />
                        </span>
                      )}
                      <BadgeStatusUso u={u} />
                      <ChevronRight size={18} className="hidden text-on-surface-variant/50 group-hover:text-secondary md:block" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {total > 0 && (
              <div className="flex items-center justify-between border-t border-outline-variant/30 bg-surface-container-lowest/50 px-5 py-3 text-sm text-on-surface-variant">
                <span>{total} uso{total === 1 ? "" : "s"}</span>
                {paginas > 1 && (
                  <div className="flex items-center gap-2">
                    <button className="rounded-lg border border-outline-variant/30 p-1.5 hover:bg-surface-container disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
                    <span className="font-semibold text-on-surface">{pagina} / {paginas}</span>
                    <button className="rounded-lg border border-outline-variant/30 p-1.5 hover:bg-surface-container disabled:opacity-40" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)} aria-label="Próxima"><ChevronRight size={16} /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {lancando && (
        <LancarUso veiculos={veiculos} motoristas={motoristas} onClose={() => setLancando(false)}
          onSalvo={() => { setLancando(false); carregar(); }} />
      )}
    </RequirePermission>
  );
}

function hora(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function dia(isoStr: string) {
  return new Date(isoStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function Indicador({ icone, cor, titulo, valor, detalhe, destaque }: {
  icone: React.ReactNode; cor: string; titulo: string; valor: string; detalhe?: string; destaque?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border bg-surface-card p-4 shadow-sm ${destaque ? "border-red-200" : "border-outline-variant/30"}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cor}`}>{icone}</span>
      <div className="min-w-0">
        <p className="text-meta text-on-surface-variant">{titulo}</p>
        <p className="text-2xl font-bold leading-tight text-on-surface">{valor}</p>
        {detalhe && <p className={`truncate text-meta ${destaque ? "font-semibold text-[#B42318]" : "text-on-surface-variant"}`}>{detalhe}</p>}
      </div>
    </div>
  );
}

function Campo({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="text-meta text-on-surface-variant">
      <span className="block text-xs font-semibold uppercase tracking-wide">{texto}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Painel({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div role="dialog" aria-label={titulo} className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-surface-bg shadow-elevated">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline-variant/30 bg-surface-card px-6 py-4">
          <h2 className="text-h3 text-text-title">{titulo}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-surface-container"><X size={20} /></button>
        </div>
        <div className="space-y-4 p-6">{children}</div>
      </div>
    </div>
  );
}

function LancarUso({ veiculos, motoristas, onClose, onSalvo }: {
  veiculos: { id: string; placa: string }[]; motoristas: { id: string; nome: string }[];
  onClose: () => void; onSalvo: () => void;
}) {
  const [f, setF] = useState({ veiculo_id: "", motorista_id: "", finalidade: "", destino: "", saida_em: "", medicao_saida: "", chegada_em: "", medicao_chegada: "" });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (s: string) => Number(s.replace(",", "."));
  const pronto = Object.values(f).every((v) => v.trim() !== "");

  async function salvar() {
    setSalvando(true);
    try {
      const r = await api.lancarUso({
        ...f,
        saida_em: new Date(f.saida_em).toISOString(),
        chegada_em: new Date(f.chegada_em).toISOString(),
        medicao_saida: num(f.medicao_saida),
        medicao_chegada: num(f.medicao_chegada),
      });
      toast.success("Uso lançado.");
      r.avisos.forEach((a) => toast(a, { icon: "⚠️", duration: 7000 }));
      onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Painel titulo="Lançar uso" onClose={onClose}>
      <p className="text-sm text-on-surface-variant">Para usos anotados fora do app (em papel, por exemplo). As fotos não são obrigatórias aqui.</p>
      <div className="grid gap-3 rounded-2xl bg-surface-card p-4 shadow-card sm:grid-cols-2">
        <Campo texto="Veículo">
          <select className="input" value={f.veiculo_id} onChange={set("veiculo_id")}>
            <option value="">Selecione</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </select>
        </Campo>
        <Campo texto="Motorista">
          <select className="input" value={f.motorista_id} onChange={set("motorista_id")}>
            <option value="">Selecione</option>
            {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </Campo>
        <div className="sm:col-span-2"><Campo texto="Finalidade"><textarea className="input" rows={2} value={f.finalidade} onChange={set("finalidade")} /></Campo></div>
        <div className="sm:col-span-2"><Campo texto="Destino"><input className="input" value={f.destino} onChange={set("destino")} /></Campo></div>
        <Campo texto="Saída"><input type="datetime-local" className="input" value={f.saida_em} onChange={set("saida_em")} /></Campo>
        <Campo texto="Km/horímetro na saída"><input className="input" inputMode="decimal" value={f.medicao_saida} onChange={set("medicao_saida")} /></Campo>
        <Campo texto="Chegada"><input type="datetime-local" className="input" value={f.chegada_em} onChange={set("chegada_em")} /></Campo>
        <Campo texto="Km/horímetro na chegada"><input className="input" inputMode="decimal" value={f.medicao_chegada} onChange={set("medicao_chegada")} /></Campo>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={!pronto || salvando} onClick={salvar}>Lançar</button>
      </div>
    </Painel>
  );
}
