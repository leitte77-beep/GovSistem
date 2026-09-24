"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
  CheckCircle2,
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

export default function MotoristasPage() {
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("driver.manage");
  const [dados, setDados] = useState<Paginado<MotoristaListItem> | null>(null);
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
    [podeGerir]
  );

  const inicio = total === 0 ? 0 : (pagina - 1) * limit + 1;
  const fim = Math.min(pagina * limit, total);

  return (
    <RequirePermission perms={["driver.manage", "vehicle.view"]}>
      <MotoristaFormDrawer
        aberto={drawerAberto}
        onClose={() => {
          setDrawerAberto(false);
          setEditando(null);
        }}
        motorista={editando}
        onSalvo={carregar}
      />

      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-background">Motoristas</h1>
            <p className="mt-1 text-[15px] text-on-surface-variant">
              Gerencie motoristas, CNHs e níveis de acesso ao sistema.
            </p>
          </div>
          {podeGerir && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-secondary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-secondary/30"
              onClick={() => {
                setEditando(null);
                setDrawerAberto(true);
              }}
            >
              <Plus size={18} />
              Novo motorista
            </button>
          )}
        </div>

        {/* Barra de busca + status + filtros */}
        <div className="flex flex-col items-stretch justify-between gap-2 rounded-2xl border border-outline-variant/30 bg-surface-card p-2 shadow-sm md:flex-row md:items-center">
          <div className="relative w-full md:flex-1 md:max-w-md">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
            <input
              placeholder="Buscar por nome, CPF ou matrícula..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-xl border-none bg-transparent py-3 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-0"
            />
          </div>
          <div className="mx-2 hidden h-8 w-px bg-outline-variant/30 md:block" />
          <div className="flex w-full items-center gap-2 p-1 md:w-auto">
            <div className="relative w-full md:w-48">
              <select
                value={filtros.ativo}
                onChange={(e) => aplicarFiltro("ativo", e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-xl border border-outline-variant/40 bg-surface-container-lowest py-2.5 pl-4 pr-10 text-sm text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 focus:border-secondary/50 focus:outline-none focus:ring-1 focus:ring-secondary/50"
              >
                <option value="">Todos os status</option>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
              <ChevronDown
                size={18}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70"
              />
            </div>
            <button
              onClick={() => setMostrarFiltros((m) => !m)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 hover:bg-surface-container-low md:w-auto"
            >
              <SlidersHorizontal size={18} className="text-on-surface-variant" />
              Filtros
              <ChevronDown
                size={14}
                className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`}
              />
              {chips.length > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] text-white">
                  {chips.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filtros expandidos */}
        {mostrarFiltros && (
          <div className="grid gap-3 rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
            <Label texto="Situação da CNH">
              <select
                className="input"
                value={filtros.situacao_cnh}
                onChange={(e) => aplicarFiltro("situacao_cnh", e.target.value)}
              >
                <option value="">Todas</option>
                {SITUACAO_CNH_OPCOES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </Label>
            <Label texto="Situação do acesso">
              <select
                className="input"
                value={filtros.acesso_status}
                onChange={(e) => aplicarFiltro("acesso_status", e.target.value)}
              >
                <option value="">Todos</option>
                {ACESSO_OPCOES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </Label>
            <Label texto="Categoria CNH">
              <select
                className="input"
                value={filtros.cnh_categoria}
                onChange={(e) => aplicarFiltro("cnh_categoria", e.target.value)}
              >
                <option value="">Todas</option>
                {CATEGORIAS_CNH.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Label>
          </div>
        )}

        {/* Chips de filtros ativos */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span
                key={c.chave}
                className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-meta font-medium text-[#1D5BD6]"
              >
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro">
                  <X size={13} />
                </button>
              </span>
            ))}
            <button
              className="text-meta font-medium text-[#1D5BD6] hover:underline"
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
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
          <div className="hidden w-full flex-col overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-card shadow-sm md:flex">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm text-on-surface">
                <thead>
                  <tr className="border-b border-outline-variant/40 bg-surface-container-lowest/80 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                    <Th
                      className="w-[35%]"
                      sortable="nome"
                      sortBy={sortBy}
                      order={order}
                      onClick={() => ordenarPor("nome")}
                    >
                      Motorista
                    </Th>
                    <th className="px-6 py-5 font-semibold">CNH</th>
                    <Th
                      sortable="cnh_validade"
                      sortBy={sortBy}
                      order={order}
                      onClick={() => ordenarPor("cnh_validade")}
                    >
                      Validade
                    </Th>
                    <th className="px-6 py-5 font-semibold">Acesso</th>
                    <Th
                      sortable="ativo"
                      sortBy={sortBy}
                      order={order}
                      onClick={() => ordenarPor("ativo")}
                    >
                      Status
                    </Th>
                    <th className="px-6 py-5 text-center font-semibold w-[80px]">Ações</th>
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
            <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant/30 bg-surface-container-lowest/50 px-6 py-4 text-sm font-medium text-on-surface-variant sm:flex-row">
              <span>
                Mostrando {inicio}-{fim} de {total} motorista{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs">Linhas por página:</span>
                  <div className="relative">
                    <select
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPagina(1);
                      }}
                      className="cursor-pointer appearance-none rounded-lg border border-outline-variant/40 bg-surface-card py-1.5 pl-3 pr-8 text-sm text-on-surface shadow-sm transition-colors hover:border-outline-variant/80 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/50"
                    >
                      {LIMITES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
                    disabled={pagina <= 1}
                    onClick={() => setPagina(1)}
                    aria-label="Primeira página"
                  >
                    <ChevronsLeft size={18} />
                  </button>
                  <button
                    className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="px-2 font-semibold text-on-surface">
                    {pagina} / {totalPaginas}
                  </span>
                  <button
                    className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40"
                    disabled={pagina >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    aria-label="Próxima página"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="rounded-lg border border-outline-variant/40 bg-surface-card p-1.5 text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40"
                    disabled={pagina >= totalPaginas}
                    onClick={() => setPagina(totalPaginas)}
                    aria-label="Última página"
                  >
                    <ChevronsRight size={18} />
                  </button>
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
            <span className="text-meta text-on-surface-variant">
              {inicio}-{fim} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors disabled:opacity-40"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-meta text-on-surface-variant">
                {pagina} / {totalPaginas}
              </span>
              <button
                className="rounded-lg border border-outline-variant/30 p-1.5 text-on-surface-variant transition-colors disabled:opacity-40"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

/* ────────────  Subcomponentes  ──────────── */

function BadgeCnh({ validade }: { validade: string | null }) {
  const info = situacaoCnhInfo(situacaoCnh(validade));
  const isVencida = validade && new Date(validade.length === 10 ? validade + "T12:00" : validade) < new Date();
  const isAtencao = validade && !isVencida && diasRestantesCnh(validade)! <= 60;
  const tom =
    isVencida
      ? "bg-error-vibrant/10 text-error-vibrant"
      : isAtencao
      ? "bg-warning-vibrant/10 text-warning-vibrant"
      : "bg-success-vibrant/10 text-success-vibrant";
  const dotTom = isVencida
    ? "bg-error-vibrant"
    : isAtencao
    ? "bg-warning-vibrant"
    : "bg-success-vibrant";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${tom}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotTom}`} />
      {info.rotulo === "Sem CNH" ? "Sem CNH" : info.rotulo === "Válida" ? "Válida" : info.rotulo}
    </span>
  );
}

function BadgeAcesso({ m }: { m: MotoristaListItem }) {
  const sem = !m.acesso_login;
  const bloqueado = !sem && m.acesso_bloqueado;
  let classe: string;
  if (sem) classe = "bg-surface-container-highest text-on-surface-variant";
  else if (bloqueado) classe = "bg-warning-vibrant/10 text-warning-vibrant";
  else if (m.acesso_login) classe = "bg-info-vibrant/10 text-info-vibrant";
  else classe = "bg-surface-container-highest text-on-surface-variant";
  const rotulo = sem ? "Sem acesso" : bloqueado ? "Bloqueado" : "Admin";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${classe}`}
    >
      {rotulo}
    </span>
  );
}

function BadgeStatus({ ativo }: { ativo: boolean }) {
  if (ativo) {
    return (
      <span
        title="Ativo"
        aria-label="Ativo"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-success-vibrant/20 bg-success-vibrant/10 text-success-vibrant"
      >
        <CheckCircle2 size={15} />
      </span>
    );
  }
  return (
    <span
      title="Inativo"
      aria-label="Inativo"
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-outline-variant/40 bg-surface-container-highest text-on-surface-variant"
    >
      <XCircle size={15} />
    </span>
  );
}

function LinhaMotorista({ m, acoes }: { m: MotoristaListItem; acoes: MenuAcao[] }) {
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-surface-container-lowest">
      <td className="px-6 py-4">
        <Link href={`/motoristas/${m.id}`} className="flex items-center gap-4">
          <AvatarMotorista src={m.foto_url} nome={m.nome} className="h-10 w-10 flex-shrink-0 text-sm" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold text-on-surface transition-colors group-hover:text-secondary">
              {m.nome}
            </span>
            <span className="mt-0.5 text-[12px] font-medium text-on-surface-variant/80">
              {mascararCpf(m.cpf)}
              {m.matricula ? ` • Matrícula ${m.matricula}` : ""}
            </span>
          </div>
        </Link>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-surface-container-high px-2.5 py-1 text-xs font-bold tracking-wide text-on-surface-variant">
            {m.cnh_categoria ?? "—"}
          </span>
          <span className="font-medium text-on-surface">{m.cnh_numero ?? "—"}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        {m.cnh_validade ? (
          <div className="flex flex-col items-start gap-1.5">
            <span
              className={`font-medium ${
                new Date(m.cnh_validade.length === 10 ? m.cnh_validade + "T12:00" : m.cnh_validade) <
                new Date()
                  ? "text-warning-vibrant"
                  : "text-on-surface"
              }`}
            >
              {new Date(m.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}
            </span>
            <BadgeCnh validade={m.cnh_validade} />
          </div>
        ) : (
          <span className="text-on-surface-variant">—</span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col items-start gap-1.5">
          <BadgeAcesso m={m} />
          {m.ultimo_acesso && (
            <span className="text-[11px] text-on-surface-variant/70">
              Último:{" "}
              {new Date(m.ultimo_acesso).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <BadgeStatus ativo={m.ativo} />
      </td>
      <td className="px-6 py-4 text-center">
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <MenuAcoes acoes={acoes} />
        </div>
      </td>
    </tr>
  );
}

function CardMotorista({ m, acoes }: { m: MotoristaListItem; acoes: MenuAcao[] }) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AvatarMotorista src={m.foto_url} nome={m.nome} className="h-12 w-12 flex-shrink-0 text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/motoristas/${m.id}`} className="truncate font-semibold text-on-surface">
              {m.nome}
            </Link>
            <MenuAcoes acoes={acoes} />
          </div>
          <div className="text-meta text-on-surface-variant">
            {mascararCpf(m.cpf)}
            {m.matricula ? ` • Matrícula ${m.matricula}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-container-high px-2.5 py-1 text-xs font-bold tracking-wide text-on-surface-variant">
              {m.cnh_categoria ?? "—"}
            </span>
            <BadgeCnh validade={m.cnh_validade} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-meta">
            <BadgeAcesso m={m} />
            <BadgeStatus ativo={m.ativo} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  sortable,
  sortBy,
  order,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  sortable?: Sortable;
  sortBy?: Sortable;
  order?: "asc" | "desc";
  onClick?: () => void;
  className?: string;
}) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className={`px-6 py-5 ${className}`}>
      {sortable ? (
        <button
          onClick={onClick}
          className={`inline-flex items-center gap-1.5 transition-colors hover:text-secondary ${
            ativo ? "text-secondary" : ""
          }`}
        >
          {children}
          {ativo &&
            (order === "asc" ? (
              <ChevronDown size={16} className="text-secondary" />
            ) : (
              <ChevronDown size={16} className="rotate-180 text-secondary" />
            ))}
        </button>
      ) : (
        children
      )}
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
