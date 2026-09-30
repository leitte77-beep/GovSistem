"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Download,
  Droplets,
  Eye,
  Fuel,
  Gauge,
  History,
  MapPin,
  Pencil,
  Plus,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Abastecimento,
  Combustivel,
  Fornecedor,
  MotoristaListItem,
  Paginado,
  ResumoAbastecimento,
  Tanque,
  Unidade,
  VeiculoListItem,
  api,
} from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { MenuAcoes, type MenuAcao } from "@/components/veiculo/MenuAcoes";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { AbastecimentoFormDrawer } from "@/components/abastecimento/AbastecimentoFormDrawer";
import { BadgeAlertas, BadgeOrigem, BadgeStatus } from "@/components/abastecimento/Badges";
import { ModalCancelar, ModalCorrigir } from "@/components/abastecimento/ModaisCorrecao";
import {
  formatarConsumoRegistro,
  formatarDataHora,
  formatarLitros,
  formatarMedicao,
  formatarMoeda,
  localAbastecimento,
  nomeVeiculo,
} from "@/lib/abastecimentos";

const LIMITES = [20, 50, 100];

type Sortable = "data" | "litros" | "veiculo" | "custo" | "motorista";

interface Filtros {
  veiculo_id: string;
  motorista_id: string;
  combustivel_id: string;
  /** "TANQUE:<id>", "POSTO:<id>", "TANQUE_PROPRIO" ou "POSTO_CREDENCIADO". */
  local: string;
  unidade_id: string;
  com_alerta: string;
  origem: string;
  status: string;
}

const FILTROS_VAZIO: Filtros = {
  veiculo_id: "", motorista_id: "", combustivel_id: "", local: "", unidade_id: "", com_alerta: "", origem: "", status: "",
};

/** Traduz o filtro de local para os parâmetros da API. */
function paramsLocal(local: string): Record<string, string> {
  if (local === "TANQUE_PROPRIO" || local === "POSTO_CREDENCIADO") return { modalidade: local };
  const [tipo, id] = local.split(":");
  if (tipo === "TANQUE" && id) return { tanque_id: id };
  if (tipo === "POSTO" && id) return { fornecedor_id: id };
  return {};
}

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
  const [postos, setPostos] = useState<Fornecedor[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Atalho vindo do painel/alertas: /abastecimentos?com_alerta=sim
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("com_alerta") === "sim") {
      setFiltros((f) => ({ ...f, com_alerta: "sim" }));
      setMostrarFiltros(true);
    }
  }, []);

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
    api.listFornecedores({ posto_credenciado: true, limit: 200 }).then((r) => setPostos(r.itens)).catch(() => {});
    api.listUnidades().then(setUnidades).catch(() => {});
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
          ...paramsLocal(filtros.local),
          unidade_id: filtros.unidade_id || undefined,
          com_alerta: filtros.com_alerta === "sim" ? true : undefined,
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
    !!filtros.local ||
    !!filtros.unidade_id ||
    !!filtros.com_alerta ||
    !!filtros.origem ||
    !!filtros.status;

  const chips: { chave: string; label: string }[] = useMemo(() => {
    const c: { chave: string; label: string }[] = [];
    if (buscaEfetiva) c.push({ chave: "busca", label: `Busca: ${buscaEfetiva}` });
    if (periodo) c.push({ chave: "periodo", label: `Período: ${PERIODOS.find((p) => p.chave === periodo)?.rotulo ?? "Personalizado"}` });
    if (filtros.veiculo_id) c.push({ chave: "veiculo_id", label: `Veículo: ${veiculos.find((v) => v.id === filtros.veiculo_id)?.placa ?? "—"}` });
    if (filtros.motorista_id) c.push({ chave: "motorista_id", label: `Motorista: ${motoristas.find((m) => m.id === filtros.motorista_id)?.nome ?? "—"}` });
    if (filtros.combustivel_id) c.push({ chave: "combustivel_id", label: `Combustível: ${combustiveis.find((c) => c.id === filtros.combustivel_id)?.nome ?? "—"}` });
    if (filtros.local) c.push({ chave: "local", label: `Local: ${rotuloLocal(filtros.local, tanques, postos)}` });
    if (filtros.unidade_id) c.push({ chave: "unidade_id", label: `Secretaria: ${unidades.find((u) => u.id === filtros.unidade_id)?.nome ?? "—"}` });
    if (filtros.com_alerta) c.push({ chave: "com_alerta", label: "Só com alerta" });
    if (filtros.origem) c.push({ chave: "origem", label: `Origem: ${ORIGEM_OPCOES.find((o) => o.valor === filtros.origem)?.rotulo ?? filtros.origem}` });
    if (filtros.status) c.push({ chave: "status", label: `Status: ${STATUS_OPCOES.find((s) => s.valor === filtros.status)?.rotulo ?? filtros.status}` });
    return c;
  }, [buscaEfetiva, periodo, filtros, veiculos, motoristas, combustiveis, tanques, postos, unidades]);

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
  const precoMedio = resumo && resumo.mes_litros > 0 ? resumo.mes_gasto / resumo.mes_litros : null;
  const litrosPeriodo = dados?.itens.reduce((s, a) => s + Number(a.quantidade_litros || 0), 0) ?? 0;
  const custoPeriodo = dados?.itens.reduce((s, a) => s + Number(a.custo_total || 0), 0) ?? 0;

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
        {/* Cabeçalho */}
        <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-text-title sm:text-3xl">Abastecimentos</h1>
              <span className="inline-flex items-center rounded-pill border border-[#BFDBFE] bg-[#DBEAFE] px-2.5 py-0.5 text-meta font-semibold text-[#1E40AF]">
                Módulo Operacional • Exercício 2026
              </span>
            </div>
            <p className="text-body-sm text-text-subtle sm:text-body">
              Acompanhe, registre e audite os abastecimentos da frota pública em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/relatorios"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-card px-3.5 py-2.5 text-body-sm font-semibold text-text-body shadow-sm transition-colors hover:bg-surface-container-low hover:text-text-title"
            >
              <Download size={16} className="text-text-subtle" />
              Exportar Relatório
            </Link>
            {podeGerir && (
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-800 active:scale-[0.98]"
                onClick={() => setDrawerAberto(true)}
              >
                <Plus size={16} strokeWidth={2.5} />
                Lançar abastecimento
              </button>
            )}
          </div>
        </section>

        {/* Indicadores */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Kpi
            titulo="Abastecimentos hoje"
            valor={String(resumo?.hoje_quantidade ?? 0)}
            sub="Registros realizados no dia"
            tom="primary"
            icone={<ClipboardList size={16} />}
          />
          <Kpi
            titulo="Litros hoje"
            valor={`${(resumo?.hoje_litros ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L`}
            sub="Consumo diário sob monitoramento"
            tom="sky"
            icone={<Droplets size={16} />}
          />
          <Kpi
            titulo="Litros no mês"
            valor={`${(resumo?.mes_litros ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L`}
            sub="Acumulado do mês corrente"
            tom="indigo"
            icone={<TrendingUp size={16} />}
          />
          <Kpi
            titulo="Gasto no mês"
            valor={formatarMoeda(resumo?.mes_gasto)}
            sub={precoMedio ? `Preço médio apurado: ${formatarMoeda(precoMedio)}/L` : "Sem litros apurados no mês"}
            tom="emerald"
            icone={<Banknote size={16} />}
          />
          <Kpi
            titulo="Consumo médio"
            valor={consumoFrota ? `${consumoFrota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/L` : "Dados insuficientes"}
            sub={consumoFrota ? "Média da frota no período" : "Aguardando abastecimentos suficientes"}
            tom="amber"
            icone={<Gauge size={16} />}
          />
        </section>

        {/* Busca, período e filtros */}
        <section className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm lg:flex-row lg:items-center">
          <div className="relative min-w-[280px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" />
            <input
              placeholder="Buscar por veículo, placa, motorista, posto ou nota fiscal…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input !bg-surface-bg !pl-10 placeholder:text-text-subtle focus:!bg-surface-card"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-outline-variant/50 bg-[#F3F4F6] p-1" role="group">
              {PERIODOS.map((p) => (
                <button
                  key={p.chave}
                  onClick={() => {
                    setPeriodo(p.chave);
                    setPagina(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-meta font-medium transition-colors ${
                    periodo === p.chave ? "bg-primary font-semibold text-white shadow-sm" : "text-text-subtle hover:text-text-title"
                  }`}
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
                className={`rounded-lg px-3 py-1.5 text-meta font-medium transition-colors ${
                  periodo === "personalizado" ? "bg-primary font-semibold text-white shadow-sm" : "text-text-subtle hover:text-text-title"
                }`}
              >
                Personalizado
              </button>
            </div>
            <button
              onClick={() => setMostrarFiltros((m) => !m)}
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-card px-3 py-2 text-meta font-semibold text-text-body transition-colors hover:bg-surface-container-low"
            >
              <SlidersHorizontal size={14} className="text-text-subtle" />
              Filtros
              <ChevronDown size={13} className={`text-text-subtle transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
              {chips.length > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {chips.length}
                </span>
              )}
            </button>
          </div>
        </section>

        {mostrarFiltros && (
          <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
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
              <Label texto="Onde abasteceu">
                <select className="input" value={filtros.local} onChange={(e) => aplicarFiltro("local", e.target.value)}>
                  <option value="">Todos</option>
                  <option value="TANQUE_PROPRIO">Tanques próprios</option>
                  <option value="POSTO_CREDENCIADO">Postos credenciados</option>
                  {tanques.map((t) => <option key={t.id} value={`TANQUE:${t.id}`}>Tanque · {t.nome}</option>)}
                  {postos.map((p) => <option key={p.id} value={`POSTO:${p.id}`}>Posto · {p.nome_fantasia || p.razao_social}</option>)}
                </select>
              </Label>
              <Label texto="Secretaria / unidade">
                <select className="input" value={filtros.unidade_id} onChange={(e) => aplicarFiltro("unidade_id", e.target.value)}>
                  <option value="">Todas</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Label>
              <Label texto="Conferência">
                <select className="input" value={filtros.com_alerta} onChange={(e) => aplicarFiltro("com_alerta", e.target.value)}>
                  <option value="">Todos</option>
                  <option value="sim">Só com alerta</option>
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

        {/* Chips de filtros ativos */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-pill border border-[#BFDBFE] bg-[#DBEAFE] px-3 py-1 text-meta font-medium text-[#1E40AF]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
            <button className="text-meta font-semibold text-primary hover:underline" onClick={limparFiltros}>Limpar filtros</button>
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
          <div className="hidden w-full flex-col overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm md:flex">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-body-sm text-text-body">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-[#F3F4F6] text-[11px] font-bold uppercase tracking-wider text-text-subtle">
                    <Th sortable="data" sortBy={sortBy} order={order} onClick={() => ordenarPor("data")}>Data</Th>
                    <Th sortable="veiculo" sortBy={sortBy} order={order} onClick={() => ordenarPor("veiculo")}>Veículo</Th>
                    <Th sortable="motorista" sortBy={sortBy} order={order} onClick={() => ordenarPor("motorista")}>Motorista</Th>
                    <th className="px-4 py-3.5">Combustível / local</th>
                    <Th sortable="litros" sortBy={sortBy} order={order} onClick={() => ordenarPor("litros")}>Litros</Th>
                    <th className="px-4 py-3.5">KM/Horímetro</th>
                    <th className="px-4 py-3.5 text-center">Consumo</th>
                    <Th sortable="custo" sortBy={sortBy} order={order} onClick={() => ordenarPor("custo")}>Custo</Th>
                    <th className="px-4 py-3.5 text-center">Origem</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="w-[80px] px-4 py-3.5 text-center">Ações</th>
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
            <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant/30 bg-[#F9FAFB] px-5 py-4 text-body-sm font-medium text-text-subtle sm:flex-row">
              <div className="flex items-center gap-3">
                <span>Mostrando <strong className="text-text-body">{inicio}-{fim}</strong> de <strong className="text-text-body">{total}</strong></span>
                <span className="hidden text-outline-variant md:inline">|</span>
                <span className="hidden md:inline">
                  Subtotal período: <strong className="text-text-body">{litrosPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L</strong> • Total: <strong className="text-primary">{formatarMoeda(custoPeriodo)}</strong>
                </span>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-meta">Linhas por página:</span>
                  <div className="relative">
                    <select
                      value={limit}
                      onChange={(e) => { setLimit(Number(e.target.value)); setPagina(1); }}
                      className="cursor-pointer appearance-none rounded-lg border border-outline-variant bg-surface-card py-1.5 pl-3 pr-8 text-body-sm text-text-body shadow-sm transition-colors hover:border-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded-lg border border-outline-variant/40 p-1.5 text-text-subtle transition-colors hover:bg-surface-container hover:text-text-body disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primeira página"><ChevronsLeft size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 p-1.5 text-text-subtle transition-colors hover:bg-surface-container hover:text-text-body disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Anterior"><ChevronLeft size={18} /></button>
                  <span className="px-2 font-semibold text-text-body">{pagina} / {totalPaginas}</span>
                  <button className="rounded-lg border border-outline-variant bg-surface-card p-1.5 text-text-body shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Próxima"><ChevronRight size={18} /></button>
                  <button className="rounded-lg border border-outline-variant bg-surface-card p-1.5 text-text-body shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última"><ChevronsRight size={18} /></button>
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
            <span className="text-meta text-text-subtle">{inicio}-{fim} de {total}</span>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-outline-variant/40 p-1.5 text-text-subtle transition-colors disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
              <span className="text-meta text-text-subtle">{pagina} / {totalPaginas}</span>
              <button className="rounded-lg border border-outline-variant/40 p-1.5 text-text-subtle transition-colors disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {/* Banner de conformidade */}
        <aside className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0E1B2E] to-[#1E3A8A] p-4 text-white shadow-md md:flex-row">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <ShieldCheck size={20} className="text-[#4ADE80]" />
            </div>
            <div>
              <h4 className="flex flex-wrap items-center gap-2 text-body-sm font-bold text-white">
                Auditoria em Tempo Real &amp; Sincronização SEFAZ
                <span className="rounded-pill border border-[#4ADE80]/30 bg-[#4ADE80]/20 px-2 py-0.5 text-[10px] font-semibold text-[#86EFAC]">Integridade garantida</span>
              </h4>
              <p className="mt-0.5 text-meta text-[#BFDBFE]">
                Os lançamentos são auditados e cruzados com as notas fiscais recebidas dos postos credenciados.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasPermission("audit.view") && (
              <Link href="/auditoria" className="rounded-xl bg-white/10 px-3.5 py-2 text-meta font-semibold text-white transition-colors hover:bg-white/20">
                Log de Auditoria
              </Link>
            )}
            {hasPermission("reports.view") && (
              <Link href="/relatorios" className="rounded-xl bg-[#106D34] px-3.5 py-2 text-meta font-semibold text-white shadow-sm transition-colors hover:bg-[#0B4F26]">
                Gerar Relatório
              </Link>
            )}
          </div>
        </aside>
      </div>
    </RequirePermission>
  );
}

/* ──────────── Subcomponentes ──────────── */

const TONS = {
  primary: "bg-[#EFF4FF] text-primary",
  sky: "bg-[#E0F2FE] text-[#0369A1]",
  indigo: "bg-[#EEF2FF] text-[#4338CA]",
  emerald: "bg-[#E7F8EC] text-[#106D34]",
  amber: "bg-[#FFF4D6] text-[#805600]",
};

function Kpi({ titulo, valor, sub, icone, tom = "primary" }: { titulo: string; valor: React.ReactNode; sub?: React.ReactNode; icone: React.ReactNode; tom?: keyof typeof TONS }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-all hover:border-outline-variant/80">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-meta font-semibold uppercase tracking-wider text-text-subtle">{titulo}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${TONS[tom]}`}>{icone}</span>
      </div>
      <div>
        <div className="text-h2 tabular-nums tracking-tight text-text-title">{valor}</div>
        {sub && <div className="mt-1 text-meta text-text-subtle">{sub}</div>}
      </div>
    </div>
  );
}

function PlacaMercosul({ placa, className = "" }: { placa?: string | null; className?: string }) {
  return (
    <span className={`mercosul-plate inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-extrabold tracking-wider text-[#0F172A] ${className}`}>
      {placa ?? "—"}
    </span>
  );
}

function VazioAbastecimento({ titulo, descricao, icone, acao }: { titulo: string; descricao: string; icone: React.ReactNode; acao?: { label: string; onClick: () => void; secundario?: boolean } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-outline-variant/40 bg-surface-card px-6 py-14 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EFF4FF] text-primary">{icone}</div>
      <h2 className="text-h3 text-text-title">{titulo}</h2>
      <p className="max-w-md text-body-sm text-text-subtle">{descricao}</p>
      {acao && (
        <button onClick={acao.onClick} className={`mt-3 ${acao.secundario ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}`}>
          <Plus size={14} /> {acao.label}
        </button>
      )}
    </div>
  );
}

function LinhaAbastecimento({ a, acoes }: { a: Abastecimento; acoes: MenuAcao[] }) {
  const posto = a.modalidade === "POSTO_CREDENCIADO";
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-[#EFF4FF]/50">
      <td className="px-4 py-4">
        <Link href={`/abastecimentos/${a.id}`} className="block">
          <span className="font-semibold tabular-nums text-text-title">{formatarDataHora(a.data_abastecimento).split(",")[0]}</span>
          <span className="mt-0.5 flex items-center gap-1 text-meta text-text-subtle">
            <History size={11} className="text-text-subtle" />
            {formatarDataHora(a.data_abastecimento).split(",")[1]?.trim() ?? ""}
          </span>
        </Link>
      </td>
      <td className="px-4 py-4">
        <Link href={`/abastecimentos/${a.id}`} className="flex items-center gap-3">
          <FotoVeiculo src={a.veiculo_foto_url} className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-col">
            <PlacaMercosul placa={a.veiculo_placa} className="w-fit" />
            <span className="mt-1 truncate text-meta font-bold text-text-body">{[a.veiculo_marca, a.veiculo_modelo].filter(Boolean).join(" ") || "—"}</span>
          </div>
        </Link>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-text-subtle"><Users size={14} /></span>
          <div>
            <div className="text-meta font-semibold text-text-title">{a.motorista_nome ?? "—"}</div>
            {a.unidade_nome && <div className="text-[11px] text-text-subtle">{a.unidade_nome}</div>}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <div>
          <span className="inline-flex items-center gap-1 text-meta font-bold text-text-title">
            <span className={`h-2 w-2 rounded-full ${posto ? "bg-[#F59E0B]" : "bg-[#106D34]"}`} />
            {a.combustivel_nome ?? "—"}
          </span>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-text-subtle">
            <MapPin size={11} className="text-text-subtle" />
            {localAbastecimento(a)}
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <span className="font-bold tabular-nums text-text-title text-body-sm">{formatarLitros(a.quantidade_litros)}</span>
        {a.completou_tanque && <span className="block text-[10px] font-semibold text-[#106D34]">Tanque completo</span>}
      </td>
      <td className="px-4 py-4 text-right">
        <span className="font-semibold tabular-nums text-text-body">{formatarMedicao(a)}</span>
      </td>
      <td className="px-4 py-4 text-center">
        <span className="text-meta font-semibold text-text-body">{formatarConsumoRegistro(a)}</span>
      </td>
      <td className="px-4 py-4 text-right">
        <div className="font-extrabold tabular-nums text-text-title">{formatarMoeda(a.custo_total)}</div>
        {a.custo_medio_litro && <div className="text-[11px] text-text-subtle">{formatarMoeda(a.custo_medio_litro)}/L</div>}
      </td>
      <td className="px-4 py-4 text-center"><BadgeOrigem origem={a.origem} /></td>
      <td className="px-4 py-4">
        <div className="flex flex-col items-center gap-1">
          <BadgeStatus status={a.status} />
          <BadgeAlertas alertas={a.alertas} />
        </div>
      </td>
      <td className="px-4 py-4 text-center">
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <MenuAcoes acoes={acoes} />
        </div>
      </td>
    </tr>
  );
}

function CardAbastecimento({ a, acoes }: { a: Abastecimento; acoes: MenuAcao[] }) {
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/abastecimentos/${a.id}`} className="min-w-0">
          <div className="font-semibold text-text-title">{nomeVeiculo(a)}</div>
          <div className="text-meta text-text-subtle">{formatarDataHora(a.data_abastecimento)}</div>
        </Link>
        <MenuAcoes acoes={acoes} />
      </div>
      {a.motorista_nome && <div className="mt-2 text-body-sm text-text-subtle">{a.motorista_nome}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
        <span className="font-semibold tabular-nums text-text-title">{formatarLitros(a.quantidade_litros)}</span>
        <span className="text-text-subtle">{a.combustivel_nome ?? "—"}</span>
        <span className="tabular-nums text-text-subtle">{formatarMedicao(a)}</span>
        <span className="text-text-subtle">{localAbastecimento(a)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <BadgeOrigem origem={a.origem} />
        <BadgeStatus status={a.status} />
        <BadgeAlertas alertas={a.alertas} />
      </div>
    </div>
  );
}

function rotuloLocal(local: string, tanques: Tanque[], postos: Fornecedor[]): string {
  if (local === "TANQUE_PROPRIO") return "Tanques próprios";
  if (local === "POSTO_CREDENCIADO") return "Postos credenciados";
  const [tipo, id] = local.split(":");
  if (tipo === "TANQUE") return tanques.find((t) => t.id === id)?.nome ?? "—";
  const p = postos.find((x) => x.id === id);
  return p ? p.nome_fantasia || p.razao_social : "—";
}

function Th({ children, sortable, sortBy, order, onClick, className = "" }: { children: React.ReactNode; sortable?: Sortable; sortBy?: Sortable; order?: "asc" | "desc"; onClick?: () => void; className?: string }) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className={`px-4 py-3.5 ${className}`}>
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1.5 transition-colors hover:text-primary ${ativo ? "text-primary" : ""}`}>
          {children}
          {ativo && (order === "asc" ? <ChevronDown size={16} className="text-primary" /> : <ChevronDown size={16} className="rotate-180 text-primary" />)}
        </button>
      ) : children}
    </th>
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
