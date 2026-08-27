"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Fuel,
  History,
  Pencil,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  Abastecimento,
  Combustivel,
  MotoristaListItem,
  Paginado,
  ResumoAbastecimento,
  Tanque,
  VeiculoListItem,
  api,
} from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { MenuAcoes, type MenuAcao } from "@/components/veiculo/MenuAcoes";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { AbastecimentoFormDrawer } from "@/components/abastecimento/AbastecimentoFormDrawer";
import { BadgeOrigem, BadgeStatus } from "@/components/abastecimento/Badges";
import { ModalCancelar, ModalCorrigir } from "@/components/abastecimento/ModaisCorrecao";
import {
  formatarConsumo,
  formatarDataHora,
  formatarKm,
  formatarLitros,
  formatarMoeda,
  nomeVeiculo,
} from "@/lib/abastecimentos";

const LIMITES = [20, 50, 100];

type Sortable = "data" | "litros" | "veiculo" | "custo" | "motorista";

interface Filtros {
  veiculo_id: string;
  motorista_id: string;
  combustivel_id: string;
  tanque_id: string;
  origem: string;
  status: string;
}

const FILTROS_VAZIO: Filtros = { veiculo_id: "", motorista_id: "", combustivel_id: "", tanque_id: "", origem: "", status: "" };

const ORIGEM_OPCOES = [
  { valor: "APP_MOTORISTA", rotulo: "Motorista" },
  { valor: "ADMIN", rotulo: "Administrativo" },
  { valor: "IMPORTADO", rotulo: "Importado" },
];
const STATUS_OPCOES = [
  { valor: "CONFIRMADO", rotulo: "Confirmado" },
  { valor: "CORRIGIDO", rotulo: "Corrigido" },
  { valor: "CANCELADO", rotulo: "Cancelado" },
];
const PERIODOS = [
  { chave: "", rotulo: "Todos" },
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "7dias", rotulo: "7 dias" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mesAnterior", rotulo: "Mês anterior" },
];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function rangePeriodo(chave: string): { inicio: string; fim: string } {
  const hoje = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (chave === "hoje") return { inicio: fmt(hoje), fim: fmt(hoje) };
  if (chave === "7dias") {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 6);
    return { inicio: fmt(d), fim: fmt(hoje) };
  }
  if (chave === "mes") return { inicio: fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: fmt(hoje) };
  if (chave === "mesAnterior") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { inicio: fmt(ini), fim: fmt(fim) };
  }
  return { inicio: "", fim: "" };
}

export default function AbastecimentosPage() {
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("refueling.manage");

  const [dados, setDados] = useState<Paginado<Abastecimento> | null>(null);
  const [resumo, setResumo] = useState<ResumoAbastecimento | null>(null);

  const [busca, setBusca] = useState("");
  const [buscaEfetiva, setBuscaEfetiva] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIO);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [sortBy, setSortBy] = useState<Sortable>("data");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = useState(1);
  const [limit, setLimit] = useState(20);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [corrigir, setCorrigir] = useState<Abastecimento | null>(null);
  const [cancelar, setCancelar] = useState<Abastecimento | null>(null);

  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaListItem[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [tanques, setTanques] = useState<Tanque[]>([]);

  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    api.resumoAbastecimentos().then(setResumo).catch(() => {});
    api.listVeiculos({ limit: 300, sort_by: "placa", order: "asc" }).then((d) => setVeiculos(d.itens)).catch(() => {});
    api.listMotoristas({ limit: 300, sort_by: "nome", order: "asc" }).then((d) => setMotoristas(d.itens)).catch(() => {});
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
    api.listTanques().then(setTanques).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    try {
      const skip = (pagina - 1) * limit;
      const range = periodo === "personalizado" ? { inicio: dataInicio, fim: dataFim } : rangePeriodo(periodo);
      setDados(
        await api.listAbastecimentos({
          search: buscaEfetiva || undefined,
          veiculo_id: filtros.veiculo_id || undefined,
          motorista_id: filtros.motorista_id || undefined,
          combustivel_id: filtros.combustivel_id || undefined,
          tanque_id: filtros.tanque_id || undefined,
          origem: filtros.origem || undefined,
          status: filtros.status || undefined,
          data_inicio: range.inicio || undefined,
          data_fim: range.fim || undefined,
          sort_by: sortBy,
          order,
          skip,
          limit,
        })
      );
      api.resumoAbastecimentos().then(setResumo).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [buscaEfetiva, periodo, dataInicio, dataFim, filtros, sortBy, order, pagina, limit]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function ordenarPor(coluna: Sortable) {
    if (sortBy === coluna) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(coluna);
      setOrder("asc");
    }
    setPagina(1);
  }

  function aplicarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  }

  function limparFiltros() {
    setBusca("");
    setBuscaEfetiva("");
    setPeriodo("");
    setDataInicio("");
    setDataFim("");
    setFiltros(FILTROS_VAZIO);
    setPagina(1);
  }

  const total = dados?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const inicio = total === 0 ? 0 : (pagina - 1) * limit + 1;
  const fim = Math.min(pagina * limit, total);

  const temFiltroAtivo =
    !!buscaEfetiva ||
    periodo !== "" ||
    !!dataInicio ||
    !!dataFim ||
    !!filtros.veiculo_id ||
    !!filtros.motorista_id ||
    !!filtros.combustivel_id ||
    !!filtros.tanque_id ||
    !!filtros.origem ||
    !!filtros.status;

  const chips: { chave: string; label: string }[] = useMemo(() => {
    const c: { chave: string; label: string }[] = [];
    if (buscaEfetiva) c.push({ chave: "busca", label: `Busca: ${buscaEfetiva}` });
    if (periodo) c.push({ chave: "periodo", label: `Período: ${PERIODOS.find((p) => p.chave === periodo)?.rotulo ?? "Personalizado"}` });
    if (filtros.veiculo_id) c.push({ chave: "veiculo_id", label: `Veículo: ${veiculos.find((v) => v.id === filtros.veiculo_id)?.placa ?? "—"}` });
    if (filtros.motorista_id) c.push({ chave: "motorista_id", label: `Motorista: ${motoristas.find((m) => m.id === filtros.motorista_id)?.nome ?? "—"}` });
    if (filtros.combustivel_id) c.push({ chave: "combustivel_id", label: `Combustível: ${combustiveis.find((c) => c.id === filtros.combustivel_id)?.nome ?? "—"}` });
    if (filtros.tanque_id) c.push({ chave: "tanque_id", label: `Tanque: ${tanques.find((t) => t.id === filtros.tanque_id)?.nome ?? "—"}` });
    if (filtros.origem) c.push({ chave: "origem", label: `Origem: ${ORIGEM_OPCOES.find((o) => o.valor === filtros.origem)?.rotulo ?? filtros.origem}` });
    if (filtros.status) c.push({ chave: "status", label: `Status: ${STATUS_OPCOES.find((s) => s.valor === filtros.status)?.rotulo ?? filtros.status}` });
    return c;
  }, [buscaEfetiva, periodo, filtros, veiculos, motoristas, combustiveis, tanques]);

  function removerChip(chave: string) {
    if (chave === "busca") {
      setBusca("");
      setBuscaEfetiva("");
    } else if (chave === "periodo") {
      setPeriodo("");
      setDataInicio("");
      setDataFim("");
    } else {
      setFiltros((f) => ({ ...f, [chave]: "" }));
    }
    setPagina(1);
  }

  const acoes = useCallback(
    (a: Abastecimento): MenuAcao[] => {
      const lista: MenuAcao[] = [
        { key: "ver", label: "Ver abastecimento", icon: <Eye size={15} />, href: `/abastecimentos/${a.id}` },
        { key: "auditoria", label: "Ver auditoria", icon: <History size={15} />, href: `/abastecimentos/${a.id}#auditoria` },
      ];
      if (podeGerir && a.status === "CONFIRMADO") {
        lista.push({ key: "corrigir", label: "Corrigir", icon: <Pencil size={15} />, onClick: () => setCorrigir(a) });
        lista.push({ key: "cancelar", label: "Cancelar", icon: <X size={15} />, cor: "danger", onClick: () => setCancelar(a) });
      }
      return lista;
    },
    [podeGerir]
  );

  const consumoFrota = resumo?.consumo_medio_frota;

  return (
    <RequirePermission perms="refueling.view">
      <AbastecimentoFormDrawer
        aberto={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        onSalvo={carregar}
      />
      {corrigir && (
        <ModalCorrigir
          abastecimento={corrigir}
          onClose={() => setCorrigir(null)}
          onSalvo={() => {
            setCorrigir(null);
            carregar();
          }}
        />
      )}
      {cancelar && (
        <ModalCancelar
          abastecimento={cancelar}
          onClose={() => setCancelar(null)}
          onSalvo={() => {
            setCancelar(null);
            carregar();
          }}
        />
      )}

      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-background">Abastecimentos</h1>
            <p className="mt-1 text-[15px] text-on-surface-variant">
              Acompanhe, registre e audite os abastecimentos da frota.
            </p>
          </div>
          {podeGerir && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-secondary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-secondary/30"
              onClick={() => setDrawerAberto(true)}
            >
              <Plus size={18} />
              Lançar abastecimento
            </button>
          )}
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Indicador titulo="Abastecimentos hoje" valor={String(resumo?.hoje_quantidade ?? 0)} />
          <Indicador titulo="Litros hoje" valor={`${(resumo?.hoje_litros ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L`} />
          <Indicador titulo="Litros no mês" valor={`${(resumo?.mes_litros ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L`} />
          <Indicador titulo="Gasto no mês" valor={formatarMoeda(resumo?.mes_gasto)} />
          <Indicador titulo="Consumo médio da frota" valor={consumoFrota ? `${consumoFrota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/L` : "Dados insuficientes"} />
        </div>

        {/* Barra de busca + período + filtros */}
        <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card p-2 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input
                placeholder="Buscar por veículo ou motorista..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-xl border-none bg-transparent py-3 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-0"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.chave}
                  onClick={() => {
                    setPeriodo(p.chave);
                    setPagina(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${periodo === p.chave ? "bg-secondary text-white" : "text-on-surface-variant hover:bg-surface-container-low"}`}
                >
                  {p.rotulo}
                </button>
              ))}
              <button
                onClick={() => {
                  setPeriodo("personalizado");
                  setMostrarFiltros(true);
                  setPagina(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${periodo === "personalizado" ? "bg-secondary text-white" : "text-on-surface-variant hover:bg-surface-container-low"}`}
              >
                Personalizado
              </button>
              <button
                onClick={() => setMostrarFiltros((m) => !m)}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 hover:bg-surface-container-low"
              >
                <SlidersHorizontal size={18} className="text-on-surface-variant" />
                Filtros
                <ChevronDown size={14} className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
                {chips.length > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] text-white">
                    {chips.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {mostrarFiltros && (
            <div className="border-t border-outline-variant/30 pt-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Label texto="Veículo">
                  <select className="input" value={filtros.veiculo_id} onChange={(e) => aplicarFiltro("veiculo_id", e.target.value)}>
                    <option value="">Todos</option>
                    {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {[v.marca, v.modelo].filter(Boolean).join(" ")}</option>)}
                  </select>
                </Label>
                <Label texto="Motorista">
                  <select className="input" value={filtros.motorista_id} onChange={(e) => aplicarFiltro("motorista_id", e.target.value)}>
                    <option value="">Todos</option>
                    {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </Label>
                <Label texto="Combustível">
                  <select className="input" value={filtros.combustivel_id} onChange={(e) => aplicarFiltro("combustivel_id", e.target.value)}>
                    <option value="">Todos</option>
                    {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Label>
                <Label texto="Tanque">
                  <select className="input" value={filtros.tanque_id} onChange={(e) => aplicarFiltro("tanque_id", e.target.value)}>
                    <option value="">Todos</option>
                    {tanques.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Label>
                <Label texto="Origem">
                  <select className="input" value={filtros.origem} onChange={(e) => aplicarFiltro("origem", e.target.value)}>
                    <option value="">Todas</option>
                    {ORIGEM_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                </Label>
                <Label texto="Status">
                  <select className="input" value={filtros.status} onChange={(e) => aplicarFiltro("status", e.target.value)}>
                    <option value="">Todos</option>
                    {STATUS_OPCOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                  </select>
                </Label>
                <Label texto="De">
                  <input type="date" className="input" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setPagina(1); }} />
                </Label>
                <Label texto="Até">
                  <input type="date" className="input" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setPagina(1); }} />
                </Label>
              </div>
            </div>
          )}
        </div>

        {/* Chips de filtros ativos */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-meta font-medium text-[#1D5BD6]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
            <button className="text-meta font-medium text-[#1D5BD6] hover:underline" onClick={limparFiltros}>Limpar filtros</button>
          </div>
        )}

        {/* Estados vazios */}
        {dados && total === 0 && !temFiltroAtivo && (
          <VazioAbastecimento
            titulo="Nenhum abastecimento registrado"
            descricao="Os abastecimentos realizados pelo motorista ou lançados pelo escritório aparecerão aqui."
            icone={<Fuel size={24} />}
            acao={podeGerir ? { label: "Lançar primeiro abastecimento", onClick: () => setDrawerAberto(true) } : undefined}
          />
        )}
        {dados && total === 0 && temFiltroAtivo && (
          <VazioAbastecimento
            titulo="Nenhum resultado encontrado"
            descricao="Não há abastecimentos correspondentes aos filtros selecionados."
            icone={<SearchX size={24} />}
            acao={{ label: "Limpar filtros", onClick: limparFiltros, secundario: true }}
          />
        )}

        {/* Tabela desktop */}
        {dados && total > 0 && (
          <div className="hidden w-full flex-col overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm md:flex">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm text-on-surface">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-surface-container-lowest/80 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                    <Th sortable="data" sortBy={sortBy} order={order} onClick={() => ordenarPor("data")}>Data</Th>
                    <Th sortable="veiculo" sortBy={sortBy} order={order} onClick={() => ordenarPor("veiculo")}>Veículo</Th>
                    <Th sortable="motorista" sortBy={sortBy} order={order} onClick={() => ordenarPor("motorista")}>Motorista</Th>
                    <th className="px-6 py-5 font-semibold">Combustível</th>
                    <Th sortable="litros" sortBy={sortBy} order={order} onClick={() => ordenarPor("litros")}>Litros</Th>
                    <th className="px-6 py-5 font-semibold">KM/Horímetro</th>
                    <th className="px-6 py-5 font-semibold">Consumo</th>
                    <Th sortable="custo" sortBy={sortBy} order={order} onClick={() => ordenarPor("custo")}>Custo</Th>
                    <th className="px-6 py-5 font-semibold">Origem</th>
                    <th className="px-6 py-5 font-semibold">Status</th>
                    <th className="px-6 py-5 text-center font-semibold w-[80px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {dados.itens.map((a) => (
                    <LinhaAbastecimento key={a.id} a={a} acoes={acoes(a)} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant/30 bg-surface-container-lowest/50 px-6 py-4 text-sm font-medium text-on-surface-variant sm:flex-row">
              <span>Mostrando {inicio}-{fim} de {total} abastecimento{total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs">Linhas por página:</span>
                  <div className="relative">
                    <select
                      value={limit}
                      onChange={(e) => { setLimit(Number(e.target.value)); setPagina(1); }}
                      className="cursor-pointer appearance-none rounded-lg border border-outline-variant/40 bg-surface-card py-1.5 pl-3 pr-8 text-sm text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/50"
                    >
                      {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primeira página"><ChevronsLeft size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Anterior"><ChevronLeft size={18} /></button>
                  <span className="px-2 font-semibold text-on-surface">{pagina} / {totalPaginas}</span>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Próxima"><ChevronRight size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última"><ChevronsRight size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cards mobile */}
        {dados && total > 0 && (
          <div className="space-y-3 md:hidden">
            {dados.itens.map((a) => (
              <CardAbastecimento key={a.id} a={a} acoes={acoes(a)} />
            ))}
          </div>
        )}

        {/* Paginação mobile */}
        {dados && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 md:hidden">
            <span className="text-meta text-on-surface-variant">{inicio}-{fim} de {total}</span>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
              <span className="text-meta text-on-surface-variant">{pagina} / {totalPaginas}</span>
              <button className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

/* ──────────── Subcomponentes ──────────── */

function Indicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-4 shadow-sm">
      <div className="text-meta font-medium text-on-surface-variant">{titulo}</div>
      <div className="mt-1 truncate text-xl font-bold tabular-nums text-on-surface">{valor}</div>
    </div>
  );
}

function VazioAbastecimento({ titulo, descricao, icone, acao }: { titulo: string; descricao: string; icone: React.ReactNode; acao?: { label: string; onClick: () => void; secundario?: boolean } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card px-6 py-14 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-[#1D4ED8]">{icone}</div>
      <h2 className="text-h3 text-on-surface">{titulo}</h2>
      <p className="max-w-md text-sm text-on-surface-variant">{descricao}</p>
      {acao && (
        <button onClick={acao.onClick} className={`mt-3 ${acao.secundario ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}`}>
          <Plus size={14} /> {acao.label}
        </button>
      )}
    </div>
  );
}

function LinhaAbastecimento({ a, acoes }: { a: Abastecimento; acoes: MenuAcao[] }) {
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-surface-container-lowest">
      <td className="px-6 py-4">
        <Link href={`/abastecimentos/${a.id}`} className="tabular-nums text-on-surface hover:text-secondary">
          {formatarDataHora(a.data_abastecimento)}
        </Link>
      </td>
      <td className="px-6 py-4">
        <Link href={`/abastecimentos/${a.id}`} className="flex items-center gap-3">
          <FotoVeiculo src={a.veiculo_foto_url} className="h-9 w-12 flex-shrink-0 rounded-btn" />
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold text-on-surface group-hover:text-secondary transition-colors">{a.veiculo_placa ?? "—"}</span>
            <span className="text-[12px] text-on-surface-variant/80">{[a.veiculo_marca, a.veiculo_modelo].filter(Boolean).join(" ") || "—"}</span>
          </div>
        </Link>
      </td>
      <td className="px-6 py-4">
        <span className="flex items-center gap-1.5 text-on-surface">
          <Users size={14} className="text-on-surface-variant/60" />
          {a.motorista_nome ?? "—"}
        </span>
      </td>
      <td className="px-6 py-4 text-on-surface">{a.combustivel_nome ?? "—"}</td>
      <td className="px-6 py-4 font-medium tabular-nums text-on-surface">{formatarLitros(a.quantidade_litros)}</td>
      <td className="px-6 py-4 tabular-nums text-on-surface-variant">{formatarKm(a.quilometragem, a.veiculo_usa_horimetro)}</td>
      <td className="px-6 py-4 tabular-nums text-on-surface-variant">{formatarConsumo(a.consumo_km_l)}</td>
      <td className="px-6 py-4 tabular-nums text-on-surface">{formatarMoeda(a.custo_total)}</td>
      <td className="px-6 py-4"><BadgeOrigem origem={a.origem} /></td>
      <td className="px-6 py-4"><BadgeStatus status={a.status} /></td>
      <td className="px-6 py-4 text-center">
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <MenuAcoes acoes={acoes} />
        </div>
      </td>
    </tr>
  );
}

function CardAbastecimento({ a, acoes }: { a: Abastecimento; acoes: MenuAcao[] }) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/abastecimentos/${a.id}`} className="min-w-0">
          <div className="font-semibold text-on-surface">{nomeVeiculo(a)}</div>
          <div className="text-meta text-on-surface-variant">{formatarDataHora(a.data_abastecimento)}</div>
        </Link>
        <MenuAcoes acoes={acoes} />
      </div>
      {a.motorista_nome && <div className="mt-2 text-sm text-on-surface-variant">{a.motorista_nome}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold tabular-nums text-on-surface">{formatarLitros(a.quantidade_litros)}</span>
        <span className="text-on-surface-variant">{a.combustivel_nome ?? "—"}</span>
        <span className="tabular-nums text-on-surface-variant">{formatarKm(a.quilometragem, a.veiculo_usa_horimetro)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <BadgeOrigem origem={a.origem} />
        <BadgeStatus status={a.status} />
      </div>
    </div>
  );
}

function Th({ children, sortable, sortBy, order, onClick, className = "" }: { children: React.ReactNode; sortable?: Sortable; sortBy?: Sortable; order?: "asc" | "desc"; onClick?: () => void; className?: string }) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className={`px-6 py-5 ${className}`}>
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1.5 transition-colors hover:text-secondary ${ativo ? "text-secondary" : ""}`}>
          {children}
          {ativo && (order === "asc" ? <ChevronDown size={16} className="text-secondary" /> : <ChevronDown size={16} className="rotate-180 text-secondary" />)}
        </button>
      ) : children}
    </th>
  );
}

function Label({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="text-meta text-on-surface-variant">
      <span className="block text-xs font-semibold uppercase tracking-wide">{texto}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
