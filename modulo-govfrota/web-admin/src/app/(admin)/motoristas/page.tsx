"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { api, Motorista, MotoristaListItem, Paginado } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { MenuAcoes, type MenuAcao } from "@/components/veiculo/MenuAcoes";
import { EmptyState } from "@/components/veiculo/EmptyState";
import { AvatarMotorista } from "@/components/motorista/AvatarMotorista";
import { MotoristaFormDrawer } from "@/components/motorista/MotoristaFormDrawer";
import {
  CATEGORIAS_CNH,
  diasRestantesCnh,
  mascararCpf,
  situacaoCnh,
  situacaoCnhInfo,
} from "@/lib/motoristas";

const LIMITES = [10, 20, 50];

interface Filtros {
  ativo: string;
  situacao_cnh: string;
  acesso_status: string;
  cnh_categoria: string;
}

const FILTROS_VAZIO: Filtros = { ativo: "", situacao_cnh: "", acesso_status: "", cnh_categoria: "" };

type Sortable = "nome" | "cnh_validade" | "ativo" | "ultimo_acesso";
const SORT_BACKEND: Record<string, string> = {
  nome: "nome",
  cnh_validade: "cnh_validade",
  ativo: "ativo",
  ultimo_acesso: "ultimo_acesso",
};

const SITUACAO_CNH_OPCOES = [
  { valor: "VENCIDA", rotulo: "Vencida" },
  { valor: "A_VENCER_7", rotulo: "Vence em até 7 dias" },
  { valor: "A_VENCER_30", rotulo: "Vence em até 30 dias" },
  { valor: "A_VENCER_60", rotulo: "Vence em até 60 dias" },
  { valor: "VALIDA", rotulo: "Válida" },
];

const ACESSO_OPCOES = [
  { valor: "COM_ACESSO", rotulo: "Com acesso" },
  { valor: "SEM_ACESSO", rotulo: "Sem acesso" },
  { valor: "BLOQUEADO", rotulo: "Bloqueado" },
];

interface Stats {
  total: number;
  ativos: number;
  validas: number;
  aVencer: number;
  bloqueados: number;
  comAcesso: number;
}

export default function MotoristasPage() {
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("driver.manage");
  const [dados, setDados] = useState<Paginado<MotoristaListItem> | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaEfetiva, setBuscaEfetiva] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIO);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [sortBy, setSortBy] = useState<Sortable>("nome");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(1);
  const [limit, setLimit] = useState(20);
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [editando, setEditando] = useState<Motorista | null>(null);

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

  const carregarStatss = useCallback(async () => {
    try {
      const d = await api.listMotoristas({ limit: 500, sort_by: "nome", order: "asc" });
      const itens = d.itens;
      setStats({
        total: d.total,
        ativos: itens.filter((m) => m.ativo).length,
        validas: itens.filter((m) => situacaoCnh(m.cnh_validade) === "VALIDA").length,
        aVencer: itens.filter((m) => {
          const dias = diasRestantesCnh(m.cnh_validade);
          return dias !== null && dias >= 0 && dias <= 90;
        }).length,
        bloqueados: itens.filter((m) => m.acesso_bloqueado).length,
        comAcesso: itens.filter((m) => m.acesso_login).length,
      });
    } catch {
      setStats(null);
    }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const skip = (pagina - 1) * limit;
      setDados(
        await api.listMotoristas({
          search: buscaEfetiva || undefined,
          ativo: filtros.ativo === "" ? undefined : filtros.ativo === "true",
          situacao_cnh: filtros.situacao_cnh || undefined,
          acesso_status: filtros.acesso_status || undefined,
          cnh_categoria: filtros.cnh_categoria || undefined,
          sort_by: SORT_BACKEND[sortBy],
          order,
          skip,
          limit,
        })
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [buscaEfetiva, filtros, sortBy, order, pagina, limit]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarStatss();
  }, [carregarStatss]);

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
    setFiltros(FILTROS_VAZIO);
    setPagina(1);
  }

  const total = dados?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const temFiltroAtivo =
    !!buscaEfetiva ||
    !!filtros.ativo ||
    !!filtros.situacao_cnh ||
    !!filtros.acesso_status ||
    !!filtros.cnh_categoria;

  const chips: { chave: string; label: string }[] = [
    filtros.ativo && { chave: "ativo", label: `Status: ${filtros.ativo === "true" ? "Ativo" : "Inativo"}` },
    filtros.situacao_cnh && { chave: "situacao_cnh", label: `CNH: ${SITUACAO_CNH_OPCOES.find((o) => o.valor === filtros.situacao_cnh)?.rotulo}` },
    filtros.acesso_status && { chave: "acesso_status", label: `Acesso: ${ACESSO_OPCOES.find((o) => o.valor === filtros.acesso_status)?.rotulo}` },
    filtros.cnh_categoria && { chave: "cnh_categoria", label: `Categoria CNH: ${filtros.cnh_categoria}` },
  ].filter(Boolean) as { chave: string; label: string }[];

  function removerChip(chave: string) {
    if (chave === "ativo" || chave === "situacao_cnh" || chave === "acesso_status" || chave === "cnh_categoria") {
      setFiltros((f) => ({ ...f, [chave]: "" }));
    }
    setPagina(1);
  }

  function abrirEdicao(m: MotoristaListItem) {
    api
      .getMotorista(m.id)
      .then((completo) => {
        setEditando(completo);
        setDrawerAberto(true);
      })
      .catch(() => toast.error("Falha ao carregar motorista."));
  }

  async function alternarAtivo(m: MotoristaListItem) {
    if (!confirm(m.ativo ? "Desativar este motorista? Ele deixará de abastecer, mas o histórico será mantido." : "Reativar este motorista?")) return;
    try {
      const completo = await api.getMotorista(m.id);
      await api.updateMotorista(m.id, { ...completo, ativo: !m.ativo });
      toast.success(m.ativo ? "Motorista desativado." : "Motorista ativado.");
      carregar();
      carregarStatss();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function alternarBloqueio(m: MotoristaListItem) {
    if (!confirm(m.acesso_bloqueado ? "Desbloquear o acesso deste motorista?" : "Bloquear o acesso deste motorista?")) return;
    try {
      if (m.acesso_bloqueado) {
        await api.desbloquearAcesso(m.id);
      } else {
        await api.bloquearAcesso(m.id);
      }
      toast.success(m.acesso_bloqueado ? "Acesso desbloqueado." : "Acesso bloqueado.");
      carregar();
      carregarStatss();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const acoes = useCallback(
    (m: MotoristaListItem): MenuAcao[] => {
      const lista: MenuAcao[] = [{ key: "ver", label: "Ver motorista", icon: <Eye size={15} />, href: `/motoristas/${m.id}` }];
      if (podeGerir) {
        lista.push({ key: "editar", label: "Editar", icon: <Pencil size={15} />, onClick: () => abrirEdicao(m) });
        lista.push({ key: "acesso", label: "Gerenciar acesso", icon: <KeyRound size={15} />, href: `/motoristas/${m.id}?acesso=1` });
        if (m.acesso_login) {
          lista.push({ key: "redefinir", label: "Redefinir PIN", icon: <KeyRound size={15} />, href: `/motoristas/${m.id}?acesso=1` });
          lista.push({
            key: "bloqueio",
            label: m.acesso_bloqueado ? "Desbloquear acesso" : "Bloquear acesso",
            icon: <KeyRound size={15} />,
            onClick: () => alternarBloqueio(m),
          });
        }
        lista.push({
          key: "desativar",
          label: m.ativo ? "Desativar motorista" : "Reativar motorista",
          icon: <Users size={15} />,
          cor: m.ativo ? "danger" : "default",
          onClick: () => alternarAtivo(m),
        });
      }
      return lista;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [podeGerir]
  );

  const inicio = total === 0 ? 0 : (pagina - 1) * limit + 1;
  const fim = Math.min(pagina * limit, total);

  const pctAtivos = stats && stats.total > 0 ? Math.round((stats.ativos / stats.total) * 100) : 0;

  const visualizacoes = [
    { chave: "todos", label: "Todos", count: stats?.total ?? dados?.total, ativo: !filtros.ativo && !filtros.situacao_cnh && !filtros.acesso_status && !filtros.cnh_categoria, onClick: limparFiltros },
    { chave: "ativos", label: "Ativos / Regulares", count: stats?.ativos, ativo: filtros.ativo === "true", onClick: () => { setFiltros({ ...FILTROS_VAZIO, ativo: "true" }); setPagina(1); } },
    { chave: "vencer", label: "CNH a vencer (60d)", count: stats?.aVencer, ativo: filtros.situacao_cnh === "A_VENCER_60", onClick: () => { setFiltros({ ...FILTROS_VAZIO, situacao_cnh: "A_VENCER_60" }); setPagina(1); } },
    { chave: "bloqueados", label: "Bloqueados", count: stats?.bloqueados, ativo: filtros.acesso_status === "BLOQUEADO", onClick: () => { setFiltros({ ...FILTROS_VAZIO, acesso_status: "BLOQUEADO" }); setPagina(1); } },
  ];

  return (
    <RequirePermission perms={["driver.manage", "vehicle.view"]}>
      <MotoristaFormDrawer
        aberto={drawerAberto}
        onClose={() => {
          setDrawerAberto(false);
          setEditando(null);
        }}
        motorista={editando}
        onSalvo={() => {
          carregar();
          carregarStatss();
        }}
      />

      <div className="flex flex-col gap-6">
        {/* Cabeçalho */}
        <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-pill border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
                Módulo Operacional • Exercício 2026
              </span>
              <span className="text-meta text-text-subtle">•</span>
              <span className="text-meta font-medium text-text-subtle">Gestão de Pessoal e Condutores</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-text-title sm:text-3xl">Motoristas</h1>
            <p className="mt-1 max-w-2xl text-body-sm text-text-subtle">
              Gerencie motoristas, CNHs e níveis de acesso ao sistema de frotas públicas.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/relatorios"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-card px-3.5 py-2 text-meta font-semibold text-text-body shadow-sm transition-colors hover:bg-surface-container-low"
            >
              <Download size={16} className="text-text-subtle" /> Exportar Relatório
            </Link>
            {podeGerir && (
              <button
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-meta font-semibold text-white shadow-sm transition-all hover:bg-primary-800 active:scale-[0.98]"
                onClick={() => {
                  setEditando(null);
                  setDrawerAberto(true);
                }}
              >
                <Plus size={16} strokeWidth={2.5} /> Novo motorista
              </button>
            )}
          </div>
        </section>

        {/* Indicadores */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titulo="Total de Motoristas" valor={stats?.total ?? total} sub={`${pctAtivos}% ativos`} tom="blue" icone={<Users size={18} />} />
          <Kpi titulo="CNHs Válidas" valor={stats?.validas ?? "—"} sub="Em conformidade" tom="emerald" icone={<UserCheck size={18} />} />
          <Kpi titulo="A Vencer (90 dias)" valor={stats?.aVencer ?? "—"} sub={stats?.aVencer ? "Requer atenção" : "Nenhum alerta crítico"} tom="amber" icone={<AlertTriangle size={18} />} alerta={(stats?.aVencer ?? 0) > 0} />
          <Kpi titulo="Acesso ao App" valor={stats?.comAcesso ?? "—"} sub={stats?.bloqueados ? `${stats.bloqueados} bloqueado(s)` : "Sem bloqueios"} tom="indigo" icone={<ShieldCheck size={18} />} />
        </section>

        {/* Busca e filtros */}
        <section className="space-y-3 rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
          <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-subtle" />
              <input
                placeholder="Buscar por nome, CPF ou matrícula…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="input !bg-surface-bg !pl-11 focus:!bg-surface-card"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[170px]">
                <select
                  value={filtros.ativo}
                  onChange={(e) => aplicarFiltro("ativo", e.target.value)}
                  className="input appearance-none pr-9 font-medium"
                >
                  <option value="">Todos os status</option>
                  <option value="true">Ativos / Regulares</option>
                  <option value="false">Inativos</option>
                </select>
                <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle" />
              </div>
              <div className="relative hidden min-w-[150px] sm:block">
                <select
                  value={filtros.cnh_categoria}
                  onChange={(e) => aplicarFiltro("cnh_categoria", e.target.value)}
                  className="input appearance-none pr-9 font-medium"
                >
                  <option value="">Categorias CNH</option>
                  {CATEGORIAS_CNH.map((c) => (
                    <option key={c} value={c}>Cat. {c}</option>
                  ))}
                </select>
                <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle" />
              </div>
              <button
                onClick={() => setMostrarFiltros((m) => !m)}
                className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 py-2 text-meta font-semibold text-text-body transition-colors hover:bg-surface-container"
              >
                <SlidersHorizontal size={16} className="text-text-subtle" /> Filtros
                {chips.length > 0 && (
                  <span className="rounded-pill bg-primary px-1.5 text-[10px] font-bold text-white">{chips.length}</span>
                )}
              </button>
            </div>
          </div>

          {/* Visualizações rápidas */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-outline-variant/30 pt-3">
            <span className="mr-1 text-[11px] font-medium text-text-subtle">Visualização:</span>
            {visualizacoes.map((v) => (
              <button
                key={v.chave}
                onClick={v.onClick}
                className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  v.ativo ? "bg-[#0E1B2E] text-white shadow-sm" : "bg-[#F3F4F6] text-text-subtle hover:bg-surface-container"
                }`}
              >
                {v.label}
                {v.count != null && <span className="ml-1 opacity-80">({v.count})</span>}
              </button>
            ))}
          </div>

          {mostrarFiltros && (
            <div className="grid gap-3 border-t border-outline-variant/30 pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <Label texto="Situação da CNH">
                <select className="input" value={filtros.situacao_cnh} onChange={(e) => aplicarFiltro("situacao_cnh", e.target.value)}>
                  <option value="">Todas</option>
                  {SITUACAO_CNH_OPCOES.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                  ))}
                </select>
              </Label>
              <Label texto="Situação do acesso">
                <select className="input" value={filtros.acesso_status} onChange={(e) => aplicarFiltro("acesso_status", e.target.value)}>
                  <option value="">Todos</option>
                  {ACESSO_OPCOES.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.rotulo}</option>
                  ))}
                </select>
              </Label>
              <Label texto="Categoria CNH">
                <select className="input" value={filtros.cnh_categoria} onChange={(e) => aplicarFiltro("cnh_categoria", e.target.value)}>
                  <option value="">Todas</option>
                  {CATEGORIAS_CNH.map((c) => (
                    <option key={c} value={c}>{c}</option>
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
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-pill bg-[#EFF6FF] px-3 py-1 text-meta font-medium text-[#1D4ED8] ring-1 ring-inset ring-[#BFDBFE]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
            <button className="text-meta font-semibold text-primary hover:underline" onClick={limparFiltros}>Limpar filtros</button>
          </div>
        )}

        {/* Estados vazios */}
        {dados && total === 0 && !temFiltroAtivo && (
          <EmptyState
            icon={<Users size={24} />}
            titulo="Nenhum motorista cadastrado"
            descricao="Cadastre o primeiro motorista para liberar o controle de abastecimentos e acessos ao GovFrota."
            acao={{ label: "Cadastrar motorista", onClick: () => setDrawerAberto(true) }}
            permissao={podeGerir}
          />
        )}
        {dados && total === 0 && temFiltroAtivo && (
          <EmptyState
            icon={<Search size={24} />}
            titulo="Nenhum motorista encontrado"
            descricao="Tente alterar os filtros ou a busca."
            acao={{ label: "Limpar filtros", onClick: limparFiltros, tipo: "secondary" }}
          />
        )}

        {/* Tabela desktop */}
        {dados && total > 0 && (
          <div className="hidden w-full flex-col overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm md:flex">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-text-body">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-[#F3F4F6] text-[11px] font-bold uppercase tracking-wider text-text-subtle">
                    <Th className="w-[35%]" sortable="nome" sortBy={sortBy} order={order} onClick={() => ordenarPor("nome")}>Motorista</Th>
                    <th className="px-4 py-3.5">CNH</th>
                    <Th sortable="cnh_validade" sortBy={sortBy} order={order} onClick={() => ordenarPor("cnh_validade")}>Validade</Th>
                    <th className="px-4 py-3.5">Acesso</th>
                    <Th sortable="ativo" sortBy={sortBy} order={order} onClick={() => ordenarPor("ativo")}>Status</Th>
                    <th className="w-[80px] px-5 py-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {dados.itens.map((m) => (
                    <LinhaMotorista key={m.id} m={m} acoes={acoes(m)} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant/30 bg-[#F9FAFB] px-5 py-4 text-body-sm text-text-subtle sm:flex-row">
              <span>
                Mostrando <strong className="text-text-body">{inicio}-{fim}</strong> de <strong className="text-text-body">{total}</strong> motorista{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-meta">Linhas por página:</span>
                  <div className="relative">
                    <select
                      value={limit}
                      onChange={(e) => { setLimit(Number(e.target.value)); setPagina(1); }}
                      className="cursor-pointer appearance-none rounded-lg border border-outline-variant/50 bg-surface-card py-1.5 pl-3 pr-8 text-body-sm text-text-body shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primeira página"><ChevronsLeft size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Página anterior"><ChevronLeft size={18} /></button>
                  <span className="px-2 font-semibold text-text-body">{pagina} / {totalPaginas}</span>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Próxima página"><ChevronRight size={18} /></button>
                  <button className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-text-subtle shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última página"><ChevronsRight size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cards mobile */}
        {dados && total > 0 && (
          <div className="space-y-3 md:hidden">
            {dados.itens.map((m) => (
              <CardMotorista key={m.id} m={m} acoes={acoes(m)} />
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
        <aside className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0E1B2E] to-[#172554] p-5 text-white shadow-md sm:flex-row">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <ShieldCheck size={22} className="text-[#86EFAC]" />
            </div>
            <div>
              <h2 className="text-body-sm font-bold text-white">Auditoria de Condutores</h2>
              <p className="mt-0.5 max-w-3xl text-meta leading-relaxed text-[#BFDBFE]">
                Habilitações, categorias e níveis de acesso são registrados com trilha de auditoria para conferência e prestação de contas.
              </p>
            </div>
          </div>
          {hasPermission("audit.view") && (
            <Link href="/auditoria" className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-meta font-semibold text-[#0E1B2E] shadow-sm transition-colors hover:bg-blue-50">
              Log de Auditoria
            </Link>
          )}
        </aside>
      </div>
    </RequirePermission>
  );
}

/* ────────────  Subcomponentes  ──────────── */

const TONS_KPI: Record<string, string> = {
  blue: "bg-[#EFF6FF] text-primary",
  emerald: "bg-[#E7F8EC] text-[#106D34]",
  amber: "bg-[#FFF4D6] text-[#805600]",
  indigo: "bg-[#EEF2FF] text-[#4338CA]",
};

function Kpi({ titulo, valor, sub, icone, tom, alerta = false }: { titulo: string; valor: React.ReactNode; sub: React.ReactNode; icone: React.ReactNode; tom: keyof typeof TONS_KPI; alerta?: boolean }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm transition-colors hover:border-outline-variant">
      <div className="flex items-center justify-between">
        <span className="text-meta font-semibold text-text-subtle">{titulo}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONS_KPI[tom]}`}>{icone}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-black tracking-tight text-text-title">{valor}</span>
        {alerta ? (
          <span className="inline-flex items-center gap-1 rounded-pill border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-600" /> atenção
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-meta font-medium text-text-subtle">{sub}</div>
    </div>
  );
}

function BadgeCnh({ validade }: { validade: string | null }) {
  const info = situacaoCnhInfo(situacaoCnh(validade));
  const isVencida = validade && new Date(validade.length === 10 ? validade + "T12:00" : validade) < new Date();
  const isAtencao = validade && !isVencida && (diasRestantesCnh(validade) ?? 999) <= 60;
  const tom = isVencida
    ? "bg-[#FFDAD6] text-[#BA1A1A]"
    : isAtencao
      ? "bg-[#FFDD9A] text-[#805600]"
      : "bg-[#9DF6B3] text-[#106D34]";
  const dotTom = isVencida ? "bg-[#BA1A1A]" : isAtencao ? "bg-[#805600]" : "bg-[#106D34]";
  const rotulo = isVencida ? "Vencida" : isAtencao ? "A vencer" : info.rotulo;
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold ${tom}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotTom}`} />
      {rotulo}
    </span>
  );
}

function BadgeAcesso({ m }: { m: MotoristaListItem }) {
  const sem = !m.acesso_login;
  const bloqueado = !sem && m.acesso_bloqueado;
  const classe = sem
    ? "bg-[#F3F4F6] text-text-subtle"
    : bloqueado
      ? "bg-[#FFDD9A] text-[#805600]"
      : "bg-[#EFF6FF] text-primary";
  const rotulo = sem ? "Sem acesso" : bloqueado ? "Bloqueado" : "Ativo";
  return <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-bold ${classe}`}>{rotulo}</span>;
}

function BadgeStatus({ ativo }: { ativo: boolean }) {
  if (ativo) {
    return (
      <span title="Ativo" aria-label="Ativo" className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-[#E7F8EC] text-[#106D34]">
        <CheckCircle2 size={15} />
      </span>
    );
  }
  return (
    <span title="Inativo" aria-label="Inativo" className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-outline-variant/40 bg-[#F3F4F6] text-text-subtle">
      <XCircle size={15} />
    </span>
  );
}

function LinhaMotorista({ m, acoes }: { m: MotoristaListItem; acoes: MenuAcao[] }) {
  return (
    <tr className="group cursor-pointer border-b border-outline-variant/20 transition-colors last:border-0 hover:bg-[#EFF6FF]/50">
      <td className="px-5 py-4">
        <Link href={`/motoristas/${m.id}`} className="flex items-center gap-3.5">
          <AvatarMotorista src={m.foto_url} nome={m.nome} className="h-10 w-10 flex-shrink-0 text-sm" />
          <div className="flex min-w-0 flex-col">
            <span className="text-body-sm font-bold text-text-title transition-colors group-hover:text-primary">{m.nome}</span>
            <span className="mt-0.5 text-meta font-medium text-text-subtle">
              {mascararCpf(m.cpf)}{m.matricula ? ` • Matrícula ${m.matricula}` : ""}
            </span>
          </div>
        </Link>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
            {m.cnh_categoria ?? "—"}
          </span>
          <span className="font-mono text-meta font-semibold text-text-body">{m.cnh_numero ?? "—"}</span>
        </div>
      </td>
      <td className="px-4 py-4">
        {m.cnh_validade ? (
          <div className="flex flex-col items-start gap-1.5">
            <span className="text-body-sm font-medium text-text-body">{new Date(m.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}</span>
            <BadgeCnh validade={m.cnh_validade} />
          </div>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col items-start gap-1.5">
          <BadgeAcesso m={m} />
          {m.ultimo_acesso && (
            <span className="text-[11px] text-text-subtle">
              Último: {new Date(m.ultimo_acesso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-4 text-center"><BadgeStatus ativo={m.ativo} /></td>
      <td className="px-5 py-4 text-center">
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <MenuAcoes acoes={acoes} />
        </div>
      </td>
    </tr>
  );
}

function CardMotorista({ m, acoes }: { m: MotoristaListItem; acoes: MenuAcao[] }) {
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AvatarMotorista src={m.foto_url} nome={m.nome} className="h-12 w-12 flex-shrink-0 text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/motoristas/${m.id}`} className="truncate font-semibold text-text-title">{m.nome}</Link>
            <MenuAcoes acoes={acoes} />
          </div>
          <div className="text-meta text-text-subtle">{mascararCpf(m.cpf)}{m.matricula ? ` • Matrícula ${m.matricula}` : ""}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-bold text-[#1D4ED8]">{m.cnh_categoria ?? "—"}</span>
            <BadgeCnh validade={m.cnh_validade} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BadgeAcesso m={m} />
            <BadgeStatus ativo={m.ativo} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, sortable, sortBy, order, onClick, className = "" }: { children: React.ReactNode; sortable?: Sortable; sortBy?: Sortable; order?: "asc" | "desc"; onClick?: () => void; className?: string }) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className={`px-4 py-3.5 ${className}`}>
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider transition-colors hover:text-primary ${ativo ? "text-primary" : ""}`}>
          {children}
          {ativo && <ChevronDown size={14} className={order === "asc" ? "rotate-180" : ""} />}
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
