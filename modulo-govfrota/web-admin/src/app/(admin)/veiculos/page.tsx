"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  Fuel,
  Gauge,
  Navigation,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { api, Combustivel, Dashboard, Paginado, Unidade, VeiculoListItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/veiculo/StatusBadge";
import { EmptyState } from "@/components/veiculo/EmptyState";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { VeiculoFormDrawer } from "@/components/veiculo/VeiculoFormDrawer";
import { MenuAcoes, type MenuAcao } from "@/components/veiculo/MenuAcoes";
import {
  formatarConsumo,
  formatarData,
  formatarHorimetro,
  formatarKm,
  nomeTipo,
  SITUACOES_LISTA,
  TIPOS_VEICULO_LISTA,
} from "@/lib/veiculos";

const LIMITES = [20, 50, 100];

interface FiltrosAdicionais {
  tipo: string;
  combustivel_id: string;
  unidade_id: string;
}

const FILTROS_VAZIO: FiltrosAdicionais = { tipo: "", combustivel_id: "", unidade_id: "" };

type Sortable = "placa" | "veiculo" | "km" | "situacao";
const SORT_BACKEND: Record<string, string> = {
  placa: "placa",
  veiculo: "modelo",
  km: "quilometragem_atual",
  situacao: "situacao",
};

export default function VeiculosPage() {
  const { hasPermission } = useAuth();
  const [dados, setDados] = useState<Paginado<VeiculoListItem> | null>(null);
  const [frota, setFrota] = useState<Dashboard["frota"] | null>(null);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [tipoOrganizacao, setTipoOrganizacao] = useState("PUBLICO");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const rotuloUnidade = tipoOrganizacao === "PRIVADO" ? "Centro de custo" : "Secretaria";

  const [busca, setBusca] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const [filtros, setFiltros] = useState<FiltrosAdicionais>(FILTROS_VAZIO);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [sortBy, setSortBy] = useState<Sortable>("placa");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(20);
  const [pagina, setPagina] = useState(1);

  const [drawerAberto, setDrawerAberto] = useState(false);

  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buscaEfetiva, setBuscaEfetiva] = useState("");

  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => {
      setBuscaEfetiva(busca);
      setPagina(1);
    }, 350);
    return () => {
      if (buscaTimer.current) clearTimeout(buscaTimer.current);
    };
  }, [busca]);

  const carregar = useCallback(async () => {
    try {
      const skip = (pagina - 1) * limit;
      const dados = await api.listVeiculos({
        search: buscaEfetiva || undefined,
        situacao: situacaoFiltro || undefined,
        tipo: filtros.tipo || undefined,
        combustivel_id: filtros.combustivel_id || undefined,
        unidade_id: filtros.unidade_id || undefined,
        sort_by: SORT_BACKEND[sortBy],
        order,
        skip,
        limit,
      });
      setDados(dados);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [buscaEfetiva, situacaoFiltro, filtros, sortBy, order, pagina, limit]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
    api.listUnidades().then(setUnidades).catch(() => {});
    api.getConfiguracoes().then((c) => setTipoOrganizacao(c.tipo_organizacao || "PUBLICO")).catch(() => {});
    api.dashboard().then((d) => setFrota(d.frota)).catch(() => {});
  }, []);

  function ordenarPor(coluna: Sortable) {
    if (!SORT_BACKEND[coluna]) return;
    if (sortBy === coluna) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(coluna);
      setOrder("asc");
    }
    setPagina(1);
  }

  function aplicarFiltro(campo: keyof FiltrosAdicionais, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  }

  function limparFiltros() {
    setBusca("");
    setBuscaEfetiva("");
    setSituacaoFiltro("");
    setFiltros(FILTROS_VAZIO);
    setPagina(1);
  }

  const total = dados?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const inicio = total === 0 ? 0 : (pagina - 1) * limit + 1;
  const fim = Math.min(pagina * limit, total);
  const temFiltroAtivo =
    !!buscaEfetiva || !!situacaoFiltro || !!filtros.tipo || !!filtros.combustivel_id || !!filtros.unidade_id;

  const chips = [
    situacaoFiltro && { chave: "situacao", label: `Situação: ${SITUACOES_LISTA.find(([k]) => k === situacaoFiltro)?.[1].label ?? situacaoFiltro}` },
    filtros.tipo && { chave: "tipo", label: `Tipo: ${nomeTipo(filtros.tipo)}` },
    filtros.combustivel_id && { chave: "combustivel_id", label: `Combustível: ${combustiveis.find((c) => c.id === filtros.combustivel_id)?.nome ?? ""}` },
    filtros.unidade_id && {
      chave: "unidade_id",
      label: `${rotuloUnidade}: ${unidades.find((u) => u.id === filtros.unidade_id)?.nome ?? ""}`,
    },
  ].filter(Boolean) as { chave: string; label: string }[];

  function removerChip(chave: string) {
    if (chave === "situacao") setSituacaoFiltro("");
    else if (chave === "tipo" || chave === "combustivel_id" || chave === "unidade_id") {
      setFiltros((f) => ({ ...f, [chave]: "" }));
    }
    setPagina(1);
  }

  const acoesVeiculo = useCallback(
    (v: VeiculoListItem): MenuAcao[] => {
      const lista: MenuAcao[] = [
        { key: "ver", label: "Ver veículo", icon: <Eye size={15} />, href: `/veiculos/${v.id}` },
      ];
      if (hasPermission("vehicle.manage")) {
        lista.push({ key: "editar", label: "Editar", icon: <Pencil size={15} />, href: `/veiculos/${v.id}?editar=1` });
      }
      if (hasPermission("refueling.view")) {
        lista.push({ key: "abastecimento", label: "Registrar abastecimento", icon: <Fuel size={15} />, href: "/abastecimentos" });
      }
      if (hasPermission("maintenance.view")) {
        lista.push({ key: "manutencao", label: "Registrar manutenção", icon: <Wrench size={15} />, href: "/manutencoes" });
      }
      if (hasPermission("vehicle.view")) {
        lista.push({ key: "ocorrencia", label: "Registrar ocorrência", icon: <AlertTriangle size={15} />, href: "/ocorrencias" });
      }
      return lista;
    },
    [hasPermission]
  );

  const situacoesChips = [
    { chave: "", label: "Todos os Veículos", count: frota?.total, dot: "" },
    { chave: "DISPONIVEL", label: "Disponíveis", count: frota?.disponiveis, dot: "bg-[#10B981]" },
    { chave: "EM_USO", label: "Em uso", count: frota?.em_uso, dot: "bg-primary" },
    { chave: "EM_MANUTENCAO", label: "Em manutenção", count: frota?.em_manutencao, dot: "bg-[#F59E0B]" },
    { chave: "INDISPONIVEL", label: "Indisponíveis", count: frota?.indisponiveis, dot: "bg-gray-400" },
  ];

  return (
    <RequirePermission perms="vehicle.view">
      <VeiculoFormDrawer
        aberto={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        veiculo={null}
        combustiveis={combustiveis}
        tipoOrganizacao={tipoOrganizacao}
        onSalvo={() => {
          setPagina(1);
          carregar();
          api.dashboard().then((d) => setFrota(d.frota)).catch(() => {});
        }}
      />

      <div className="flex flex-col gap-6">
        {/* Cabeçalho */}
        <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-pill bg-[#DBEAFE] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#1E40AF]">
                Módulo Operacional
              </span>
              <span className="text-body-sm text-text-subtle">•</span>
              <span className="text-body-sm font-medium text-text-subtle">Exercício 2026</span>
            </div>
            <h1 className="text-h1 tracking-tight text-text-title">Veículos da Frota</h1>
            <p className="max-w-2xl text-body-sm text-text-subtle">
              Localize, gerencie permissões e acompanhe a telemetria, odometria e ciclos de abastecimento de toda a frota.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/relatorios"
              className="inline-flex items-center gap-2 rounded-xl bg-surface-card px-3.5 py-2.5 text-body-sm font-medium text-text-body shadow-sm ring-1 ring-outline-variant/50 transition-colors hover:bg-surface-container-low"
            >
              <Download size={16} className="text-text-subtle" />
              Exportar
            </Link>
            {hasPermission("vehicle.manage") && (
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-semibold text-white shadow-md transition-all hover:bg-primary-800 active:scale-[0.98]"
                onClick={() => setDrawerAberto(true)}
              >
                <Plus size={18} strokeWidth={2.5} />
                Novo Veículo
              </button>
            )}
          </div>
        </section>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiVeiculo
            titulo="Total da Frota"
            valor={frota?.total ?? dados?.total ?? 0}
            sub="Veículos ativos cadastrados"
            tom="primary"
            icone={<Car size={20} />}
          />
          <KpiVeiculo
            titulo="Disponíveis p/ Uso"
            valor={frota?.disponiveis ?? "—"}
            sub="Aptos para escalas imediatas"
            tom="emerald"
            icone={<CheckCircle2 size={20} />}
          />
          <KpiVeiculo
            titulo="Em Manutenção / Alerta"
            valor={frota?.em_manutencao ?? "—"}
            sub="Requer acompanhamento"
            tom="amber"
            icone={<Wrench size={20} />}
            alerta={(frota?.em_manutencao ?? 0) > 0}
          />
          <KpiVeiculo
            titulo="Em Uso"
            valor={frota?.em_uso ?? "—"}
            sub="Em rota / trânsito no momento"
            tom="indigo"
            icone={<Navigation size={20} />}
          />
        </section>

        {/* Busca e filtros */}
        <section className="flex flex-col gap-3 rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
          <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" />
              <input
                placeholder="Buscar por placa, modelo, marca, renavam…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="input !bg-surface-bg !pl-11 focus:!bg-surface-card"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[190px]">
                <select
                  value={situacaoFiltro}
                  onChange={(e) => {
                    setSituacaoFiltro(e.target.value);
                    setPagina(1);
                  }}
                  className="input appearance-none pr-9 font-medium"
                >
                  <option value="">Todas as situações</option>
                  {SITUACOES_LISTA.map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle" />
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 py-2.5 text-body-sm font-medium text-text-body transition-colors hover:bg-surface-container"
                onClick={() => setMostrarFiltros((m) => !m)}
              >
                <SlidersHorizontal size={16} className="text-primary" /> Filtros
                <ChevronDown size={14} className={`text-text-subtle transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
                {chips.length > 0 && (
                  <span className="rounded-pill bg-primary px-1.5 text-[10px] font-bold text-white">{chips.length}</span>
                )}
              </button>
            </div>
          </div>

          {/* Chips de situação (com contagens reais) */}
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5">
            {situacoesChips.map((s) => {
              const ativo = situacaoFiltro === s.chave;
              return (
                <button
                  key={s.chave || "todos"}
                  onClick={() => {
                    setSituacaoFiltro(s.chave);
                    setPagina(1);
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-pill px-3.5 py-1.5 text-meta font-semibold transition-colors ${
                    ativo
                      ? "bg-primary text-white shadow-sm ring-1 ring-primary-800/20"
                      : "bg-surface-card text-text-body ring-1 ring-outline-variant/50 hover:bg-surface-container-low hover:text-text-title"
                  }`}
                >
                  {s.dot && <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />}
                  {s.label}
                  {s.count != null && (
                    <span className={`rounded-pill px-2 text-[11px] font-bold ${ativo ? "bg-white/20 text-white" : "bg-surface-container text-text-subtle"}`}>
                      {s.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {mostrarFiltros && (
            <div className="grid gap-3 border-t border-outline-variant/30 pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <Label texto="Tipo">
                <select className="input" value={filtros.tipo} onChange={(e) => aplicarFiltro("tipo", e.target.value)}>
                  <option value="">Todos os tipos</option>
                  {TIPOS_VEICULO_LISTA.map(([v, n]) => (
                    <option key={v} value={v}>{n}</option>
                  ))}
                </select>
              </Label>
              <Label texto="Combustível">
                <select className="input" value={filtros.combustivel_id} onChange={(e) => aplicarFiltro("combustivel_id", e.target.value)}>
                  <option value="">Todos</option>
                  {combustiveis.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </Label>
              <Label texto={rotuloUnidade}>
                <select className="input" value={filtros.unidade_id} onChange={(e) => aplicarFiltro("unidade_id", e.target.value)}>
                  <option value="">Todas</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </Label>
            </div>
          )}
        </section>

        {/* Chips de filtros ativos */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-pill bg-[#EFF6FF] px-2.5 py-1 text-meta font-medium text-[#1D4ED8] ring-1 ring-inset ring-[#BFDBFE]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
            <button className="text-meta font-semibold text-primary hover:underline" onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>
        )}

        {/* Estados vazios */}
        {dados && total === 0 && !temFiltroAtivo && (
          <EmptyState
            icon={<Truck size={24} />}
            titulo="Nenhum veículo cadastrado"
            descricao="Cadastre o primeiro veículo para começar a controlar abastecimentos, manutenção e custos da frota."
            acao={{ label: "Cadastrar veículo", onClick: () => setDrawerAberto(true) }}
            permissao={hasPermission("vehicle.manage")}
          />
        )}
        {dados && total === 0 && temFiltroAtivo && (
          <EmptyState
            icon={<Search size={24} />}
            titulo="Nenhum veículo encontrado"
            descricao="Não encontramos veículos correspondentes aos filtros selecionados."
            acao={{ label: "Limpar filtros", onClick: limparFiltros, tipo: "secondary" }}
          />
        )}

        {/* Tabela desktop */}
        {dados && total > 0 && (
          <div className="hidden overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-text-body">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-[#F3F4F6] text-[11px] font-bold uppercase tracking-wider text-text-subtle">
                    <Th sortable="placa" sortBy={sortBy} order={order} onClick={() => ordenarPor("placa")}>Veículo / Placa</Th>
                    <th className="px-4 py-3.5">Lotação</th>
                    <Th sortable="km" sortBy={sortBy} order={order} onClick={() => ordenarPor("km")}>KM / Odômetro</Th>
                    <th className="px-4 py-3.5">Consumo médio</th>
                    <th className="px-4 py-3.5">Último abastecimento</th>
                    <th className="px-4 py-3.5">Próxima revisão</th>
                    <Th sortable="situacao" sortBy={sortBy} order={order} onClick={() => ordenarPor("situacao")}>Situação</Th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {dados.itens.map((v) => (
                    <LinhaVeiculo key={v.id} v={v} acoes={acoesVeiculo(v)} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rodapé / paginação */}
            <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant/30 bg-[#F9FAFB] px-5 py-4 text-body-sm text-text-subtle sm:flex-row">
              <div className="flex items-center gap-2">
                <span>Exibindo</span>
                <span className="font-semibold text-text-body">{inicio} a {fim}</span>
                <span>de</span>
                <span className="font-semibold text-text-body">{total}</span>
                <span>veículos cadastrados</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-meta">Itens por página:</span>
                  <div className="relative">
                    <select
                      value={limit}
                      onChange={(e) => { setLimit(Number(e.target.value)); setPagina(1); }}
                      className="cursor-pointer appearance-none rounded-lg border border-outline-variant bg-surface-card py-1.5 pl-3 pr-8 text-body-sm text-text-body shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container hover:text-text-body disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primeira página"><ChevronsLeft size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container hover:text-text-body disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Anterior"><ChevronLeft size={18} /></button>
                  <span className="px-2 font-semibold text-text-body">{pagina} / {totalPaginas}</span>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container hover:text-text-body disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Próxima"><ChevronRight size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container hover:text-text-body disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última"><ChevronsRight size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cards mobile */}
        {dados && total > 0 && (
          <div className="space-y-3 md:hidden">
            {dados.itens.map((v) => (
              <CardVeiculo key={v.id} v={v} acoes={acoesVeiculo(v)} />
            ))}
          </div>
        )}

        {/* Paginação mobile */}
        {dados && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 md:hidden">
            <span className="text-meta text-text-subtle">{inicio}-{fim} de {total}</span>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle transition-colors disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
              <span className="text-meta text-text-subtle">{pagina} / {totalPaginas}</span>
              <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle transition-colors disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* Banner de auditoria */}
        <aside className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0E1B2E] to-[#1E3A8A] p-5 text-white shadow-md md:flex-row">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <ShieldCheck size={22} className="text-[#86EFAC]" />
            </div>
            <div>
              <h4 className="flex flex-wrap items-center gap-2 text-body-sm font-bold text-white">
                Auditoria em Tempo Real
                <span className="rounded-pill border border-[#4ADE80]/30 bg-[#4ADE80]/20 px-2 py-0.5 text-[10px] font-semibold text-[#86EFAC]">Integridade garantida</span>
              </h4>
              <p className="mt-0.5 text-meta text-[#BFDBFE]">
                Rotas, odômetros e requisições de combustível possuem trilha de auditoria rastreável.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {hasPermission("audit.view") && (
              <Link href="/auditoria" className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-meta font-semibold text-white transition-colors hover:bg-white/20">
                Log de Auditoria
              </Link>
            )}
            {hasPermission("reports.view") && (
              <Link href="/relatorios" className="rounded-xl bg-[#106D34] px-3.5 py-2 text-meta font-semibold text-white shadow-sm transition-colors hover:bg-[#0B4F26]">
                Exportar Dados
              </Link>
            )}
          </div>
        </aside>
      </div>
    </RequirePermission>
  );
}

/* ──────────── Subcomponentes ──────────── */

const TONS_KPI: Record<string, string> = {
  primary: "bg-primary text-white",
  emerald: "bg-[#106D34] text-white",
  amber: "bg-[#F59E0B] text-white",
  indigo: "bg-[#4F46E5] text-white",
};

function KpiVeiculo({ titulo, valor, sub, icone, tom, alerta = false }: { titulo: string; valor: React.ReactNode; sub: React.ReactNode; icone: React.ReactNode; tom: keyof typeof TONS_KPI; alerta?: boolean }) {
  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-all hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 ${TONS_KPI[tom]}`} />
      <div className="flex items-center justify-between">
        <span className="text-meta font-bold uppercase tracking-wider text-text-subtle">{titulo}</span>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-105 ${TONS_KPI[tom]}`}>
          {icone}
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-text-title">{valor}</span>
        {alerta && (
          <span className="inline-flex items-center gap-1 rounded-pill border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-600" />
            atenção
          </span>
        )}
      </div>
      <div className="mt-3 text-meta font-medium text-text-subtle">{sub}</div>
    </div>
  );
}

function PlacaMercosul({ placa }: { placa: string }) {
  return (
    <span className="mercosul-plate inline-block rounded px-2 py-0.5 font-mono text-[12px] font-extrabold tracking-wider text-[#0F172A]">
      {placa}
    </span>
  );
}

function Th({ children, sortable, sortBy, order, onClick }: { children: React.ReactNode; sortable?: Sortable; sortBy?: Sortable; order?: string; onClick?: () => void }) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className="px-4 py-3.5">
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider transition-colors hover:text-primary ${ativo ? "text-primary" : ""}`}>
          {children}
          {ativo && <ChevronDown size={14} className={order === "asc" ? "rotate-180" : ""} />}
        </button>
      ) : children}
    </th>
  );
}

function LinhaVeiculo({ v, acoes }: { v: VeiculoListItem; acoes: MenuAcao[] }) {
  const prox = v.proxima_manutencao;
  const manual = v.usa_horimetro ? formatarHorimetro(v.horimetro_atual) : formatarKm(v.quilometragem_atual);
  return (
    <tr className="group border-b border-outline-variant/20 transition-colors last:border-0 hover:bg-[#EFF4FF]/50">
      <td className="px-4 py-4">
        <Link href={`/veiculos/${v.id}`} className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            <FotoVeiculo src={v.foto_url} className="h-11 w-11 rounded-xl border border-outline-variant/60" />
            <span className="absolute inset-x-0 bottom-0 h-1 rounded-b-xl bg-primary" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <PlacaMercosul placa={v.placa} />
              <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold uppercase text-text-body ring-1 ring-inset ring-outline-variant/50">
                {nomeTipo(v.tipo)}
              </span>
            </div>
            <span className="mt-1 truncate text-body-sm font-bold text-text-title">
              {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
            </span>
          </div>
        </Link>
      </td>
      <td className="px-4 py-4">
        <span className="block text-body-sm font-semibold text-text-title">{v.unidade_nome ?? "Sem lotação"}</span>
      </td>
      <td className="px-4 py-4">
        <span className="flex items-center gap-1.5 font-mono text-body-sm font-bold text-text-title">
          <Gauge size={15} className="text-text-subtle" />
          {manual}
        </span>
      </td>
      <td className="px-4 py-4">
        <span className="text-body-sm font-semibold text-text-body">{formatarConsumo(v.consumo_medio_km_l)}</span>
      </td>
      <td className="px-4 py-4">
        {v.ultimo_abastecimento ? (
          <div>
            <div className="flex items-center gap-1.5 text-body-sm font-semibold text-text-title">
              <Fuel size={14} className="text-primary" />
              {formatarData(v.ultimo_abastecimento.data)}
            </div>
            <div className="mt-0.5 text-meta text-text-subtle">
              <strong className="text-text-body">{Number(v.ultimo_abastecimento.litros).toLocaleString("pt-BR")} L</strong>
            </div>
          </div>
        ) : (
          <span className="text-meta text-text-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-4">
        {prox ? <ProximaManutencao prox={prox} /> : <span className="text-meta text-text-subtle">—</span>}
      </td>
      <td className="px-4 py-4">
        <StatusBadge situacao={v.situacao} />
      </td>
      <td className="px-5 py-4 text-right">
        <MenuAcoes acoes={acoes} />
      </td>
    </tr>
  );
}

function ProximaManutencao({ prox }: { prox: { nome: string; proxima_km: number | null; proxima_data: string | null; situacao: string } }) {
  const vencida = prox.situacao === "VENCIDA";
  const proxima = prox.situacao === "PROXIMA";
  const classe = vencida
    ? "bg-[#FEF2F2] text-[#B91C1C] ring-rose-200"
    : proxima
      ? "bg-[#FFFBEB] text-[#B45309] ring-amber-200"
      : "bg-[#ECFDF5] text-[#047857] ring-emerald-200";
  const texto =
    prox.proxima_km != null
      ? `Em ${prox.proxima_km.toLocaleString("pt-BR")} km`
      : prox.proxima_data
        ? `Em ${formatarData(prox.proxima_data)}`
        : prox.nome;
  return (
    <span className={`inline-flex flex-col rounded-lg px-2.5 py-1 text-meta ring-1 ring-inset ${classe}`}>
      <span className="font-bold">{vencida ? "Vencida" : texto}</span>
      <span className="opacity-80">{prox.nome}</span>
    </span>
  );
}

function CardVeiculo({ v, acoes }: { v: VeiculoListItem; acoes: MenuAcao[] }) {
  const prox = v.proxima_manutencao;
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <FotoVeiculo src={v.foto_url} className="h-14 w-14 flex-shrink-0 rounded-xl border border-outline-variant/60" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PlacaMercosul placa={v.placa} />
              <MenuAcoes acoes={acoes} />
            </div>
          </div>
          <div className="mt-1 truncate text-body-sm font-bold text-text-title">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</div>
          <div className="text-meta text-text-subtle">{nomeTipo(v.tipo)} · {v.unidade_nome ?? "Sem lotação"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge situacao={v.situacao} />
            {prox && <ProximaManutencao prox={prox} />}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-outline-variant/30 pt-3 text-meta">
        <div>
          <div className="text-text-subtle">KM / Odômetro</div>
          <div className="font-mono font-semibold tabular-nums text-text-body">{v.usa_horimetro ? formatarHorimetro(v.horimetro_atual) : formatarKm(v.quilometragem_atual)}</div>
        </div>
        <div>
          <div className="text-text-subtle">Consumo médio</div>
          <div className="font-semibold text-text-body">{formatarConsumo(v.consumo_medio_km_l)}</div>
        </div>
      </div>
      <div className="mt-3">
        <Link href={`/veiculos/${v.id}`} className="text-body-sm font-semibold text-primary hover:underline">
          Abrir ficha
        </Link>
      </div>
    </div>
  );
}

function Label({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="text-meta text-text-subtle">
      <span className="block text-xs font-semibold uppercase tracking-wide">{texto}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
