"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
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
  formatarCpf,
  mascararCpf,
  situacaoCnh,
  situacaoCnhInfo,
} from "@/lib/motoristas";

const LIMITES = [20, 50, 100];

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
      await api.atualizarCredencial(m.id, {}, !m.acesso_bloqueado);
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

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[#181C22]">Motoristas</h1>
            <p className="mt-1 text-sm text-[#737781]">Gerencie motoristas, CNHs e acessos.</p>
          </div>
          {podeGerir && (
            <button className="btn btn-primary" onClick={() => { setEditando(null); setDrawerAberto(true); }}>
              <Plus size={16} /> Novo motorista
            </button>
          )}
        </div>

        {/* Busca + filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-[#737781]" />
            <input
              placeholder="Buscar por nome, CPF ou matrícula…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input pl-9"
            />
          </div>
          <select value={filtros.ativo} onChange={(e) => aplicarFiltro("ativo", e.target.value)} className="input w-auto">
            <option value="">Todos os status</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <button className="btn btn-secondary" onClick={() => setMostrarFiltros((m) => !m)}>
            <SlidersHorizontal size={16} /> Filtros
            <ChevronDown size={14} className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
          </button>
        </div>

        {mostrarFiltros && (
          <div className="grid gap-3 rounded-card border border-[#C3C6D1]/30 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
            <Label texto="Situação da CNH">
              <select className="input" value={filtros.situacao_cnh} onChange={(e) => aplicarFiltro("situacao_cnh", e.target.value)}>
                <option value="">Todas</option>
                {SITUACAO_CNH_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </Label>
            <Label texto="Situação do acesso">
              <select className="input" value={filtros.acesso_status} onChange={(e) => aplicarFiltro("acesso_status", e.target.value)}>
                <option value="">Todos</option>
                {ACESSO_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </Label>
            <Label texto="Categoria CNH">
              <select className="input" value={filtros.cnh_categoria} onChange={(e) => aplicarFiltro("cnh_categoria", e.target.value)}>
                <option value="">Todas</option>
                {CATEGORIAS_CNH.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Label>
          </div>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-pill bg-[#D9E2FF] px-2.5 py-1 text-meta font-medium text-[#1D5BD6]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro"><X size={13} /></button>
              </span>
            ))}
            <button className="text-meta font-medium text-[#1D5BD6] hover:underline" onClick={limparFiltros}>Limpar filtros</button>
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
          <div className="hidden overflow-x-auto rounded-card border border-[#C3C6D1]/20 bg-white shadow-card md:block">
            <table className="w-full min-w-160 text-body-sm">
              <thead>
                <tr className="border-b border-[#E4E7EC] bg-[#EFF4FF] text-left text-meta text-[#737781]">
                  <Th sortable="nome" sortBy={sortBy} order={order} onClick={() => ordenarPor("nome")}>Motorista</Th>
                  <th className="px-4 py-3">CNH</th>
                  <Th sortable="cnh_validade" sortBy={sortBy} order={order} onClick={() => ordenarPor("cnh_validade")}>Validade</Th>
                  <th className="px-4 py-3">Acesso</th>
                  <Th sortable="ativo" sortBy={sortBy} order={order} onClick={() => ordenarPor("ativo")}>Status</Th>
                  <th className="px-4 py-3 text-right">⋯</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((m) => (
                  <LinhaMotorista key={m.id} m={m} acoes={acoes(m)} />
                ))}
              </tbody>
            </table>
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

        {/* Paginação */}
        {dados && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-meta text-[#737781]">{dados.itens.length} de {total} motorista{total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPagina(1); }} className="input w-auto py-1.5 text-meta">
                {LIMITES.map((l) => <option key={l} value={l}>{l} por página</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={16} />
              </button>
              <span className="text-meta text-[#737781]">{pagina} / {totalPaginas}</span>
              <button className="btn btn-secondary btn-sm" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}

function BadgeCnh({ validade }: { validade: string | null }) {
  const info = situacaoCnhInfo(situacaoCnh(validade));
  return <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${info.classe}`}>{info.rotulo}</span>;
}

function BadgeAcesso({ m }: { m: MotoristaListItem }) {
  const sem = !m.acesso_login;
  const bloqueado = !sem && m.acesso_bloqueado;
  const classe = !m.ativo || !m.acesso_login
    ? "bg-gray-100 text-gray-600"
    : bloqueado
    ? "bg-[#FFDD9A] text-[#805600]"
    : "bg-[#9DF6B3] text-[#106D34]";
  const rotulo = !m.ativo ? "Inativo" : sem ? "Sem acesso" : bloqueado ? "Bloqueado" : "Ativo";
  return (
    <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${classe}`}>{rotulo}</span>
  );
}

function LinhaMotorista({ m, acoes }: { m: MotoristaListItem; acoes: MenuAcao[] }) {
  return (
    <tr className="border-b border-[#E4E7EC] last:border-0 hover:bg-[#EFF4FF]/50">
      <td className="px-4 py-3.5">
        <Link href={`/motoristas/${m.id}`} className="flex items-center gap-3">
          <AvatarMotorista src={m.foto_url} nome={m.nome} className="h-10 w-10 flex-shrink-0 text-sm" />
          <div className="min-w-0">
            <div className="truncate font-medium text-[#181C22]">{m.nome}</div>
            <div className="truncate text-meta text-[#737781]">
              {mascararCpf(m.cpf)}
              {m.matricula ? ` · Matrícula ${m.matricula}` : ""}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        <span className="font-mono text-[#1D5BD6]">{m.cnh_categoria ?? "—"}</span>
        {m.cnh_numero && <span className="ml-1 text-meta text-[#737781]">{m.cnh_numero}</span>}
      </td>
      <td className="px-4 py-3.5">
        {m.cnh_validade ? (
          <div className="space-y-1">
            <div className="tabular-nums">{new Date(m.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}</div>
            <BadgeCnh validade={m.cnh_validade} />
          </div>
        ) : "—"}
      </td>
      <td className="px-4 py-3.5">
        <BadgeAcesso m={m} />
        {m.ultimo_acesso && (
          <div className="mt-1 text-meta text-[#737781]">Último: {new Date(m.ultimo_acesso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${m.ativo ? "bg-[#9DF6B3] text-[#106D34]" : "bg-gray-100 text-gray-600"}`}>
          {m.ativo ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="px-4 py-3.5 text-right">
        <MenuAcoes acoes={acoes} />
      </td>
    </tr>
  );
}

function CardMotorista({ m, acoes }: { m: MotoristaListItem; acoes: MenuAcao[] }) {
  return (
    <div className="rounded-card border border-[#C3C6D1]/30 bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <AvatarMotorista src={m.foto_url} nome={m.nome} className="h-12 w-12 flex-shrink-0 text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/motoristas/${m.id}`} className="truncate font-semibold text-[#181C22]">{m.nome}</Link>
            <MenuAcoes acoes={acoes} />
          </div>
          <div className="text-meta text-[#737781]">{mascararCpf(m.cpf)}{m.matricula ? ` · Matrícula ${m.matricula}` : ""}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-[#D9E2FF] px-2 py-0.5 font-mono text-meta font-bold text-[#1D5BD6]">CNH {m.cnh_categoria ?? "—"}</span>
            <BadgeCnh validade={m.cnh_validade} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-meta">
            <BadgeAcesso m={m} />
            <span className="text-[#737781]">Status: {m.ativo ? "Ativo" : "Inativo"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, sortable, sortBy, order, onClick }: { children: React.ReactNode; sortable?: Sortable; sortBy?: Sortable; order?: string; onClick?: () => void }) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className="px-4 py-3">
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1 uppercase tracking-wide ${ativo ? "text-[#1D5BD6]" : ""}`}>
          {children}
          {ativo && (order === "asc" ? <ChevronDown size={13} className="rotate-180" /> : <ChevronDown size={13} />)}
        </button>
      ) : children}
    </th>
  );
}

function Label({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="text-meta">
      {texto}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
