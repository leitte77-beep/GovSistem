"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Fuel,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { api, Combustivel, Paginado, VeiculoListItem } from "@/lib/api";
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
  unidade: string;
  centro_custo: string;
}

const FILTROS_VAZIO: FiltrosAdicionais = { tipo: "", combustivel_id: "", unidade: "", centro_custo: "" };

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
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [tipoOrganizacao, setTipoOrganizacao] = useState("PUBLICO");

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
        unidade: filtros.unidade || undefined,
        centro_custo: filtros.centro_custo || undefined,
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
    api.getConfiguracoes().then((c) => setTipoOrganizacao(c.tipo_organizacao || "PUBLICO")).catch(() => {});
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
  const temFiltroAtivo =
    !!buscaEfetiva || !!situacaoFiltro || !!filtros.tipo || !!filtros.combustivel_id || !!filtros.unidade || !!filtros.centro_custo;

  const chips = [
    situacaoFiltro && { chave: "situacao", label: `Situação: ${SITUACOES_LISTA.find(([k]) => k === situacaoFiltro)?.[1] ?? situacaoFiltro}` },
    filtros.tipo && { chave: "tipo", label: `Tipo: ${nomeTipo(filtros.tipo)}` },
    filtros.combustivel_id && { chave: "combustivel_id", label: `Combustível: ${combustiveis.find((c) => c.id === filtros.combustivel_id)?.nome ?? ""}` },
    filtros.unidade && { chave: "unidade", label: `Unidade: ${filtros.unidade}` },
    filtros.centro_custo && { chave: "centro_custo", label: `C. custo: ${filtros.centro_custo}` },
  ].filter(Boolean) as { chave: string; label: string }[];

  function removerChip(chave: string) {
    if (chave === "situacao") setSituacaoFiltro("");
    else if (chave === "tipo" || chave === "combustivel_id" || chave === "unidade" || chave === "centro_custo") {
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
        }}
      />

      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h2 text-text-title">Veículos</h1>
            <p className="text-body-sm text-text-subtle">
              Localize, cadastre e acompanhe a situação da frota.
            </p>
          </div>
          {hasPermission("vehicle.manage") && (
            <button className="btn btn-primary" onClick={() => setDrawerAberto(true)}>
              <Plus size={16} /> Novo veículo
            </button>
          )}
        </div>

        {/* Barra de busca e filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-text-subtle" />
            <input
              placeholder="Buscar por placa, modelo, marca, renavam…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="input pl-9"
            />
          </div>
          <select
            value={situacaoFiltro}
            onChange={(e) => {
              setSituacaoFiltro(e.target.value);
              setPagina(1);
            }}
            className="input w-auto"
          >
            <option value="">Todas as situações</option>
            {SITUACOES_LISTA.map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => setMostrarFiltros((m) => !m)}
          >
            <SlidersHorizontal size={16} /> Filtros
            <ChevronDown size={14} className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Painel de filtros adicionais */}
        {mostrarFiltros && (
          <div className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
            <Label texto="Tipo">
              <select className="input" value={filtros.tipo} onChange={(e) => aplicarFiltro("tipo", e.target.value)}>
                <option value="">Todos os tipos</option>
                {TIPOS_VEICULO_LISTA.map(([v, n]) => (
                  <option key={v} value={v}>{n}</option>
                ))}
              </select>
            </Label>
            <Label texto="Combustível principal">
              <select className="input" value={filtros.combustivel_id} onChange={(e) => aplicarFiltro("combustivel_id", e.target.value)}>
                <option value="">Todos</option>
                {combustiveis.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Label>
            <Label texto="Unidade / Secretaria">
              <input className="input" placeholder="Filtrar por unidade" value={filtros.unidade} onChange={(e) => aplicarFiltro("unidade", e.target.value)} />
            </Label>
            <Label texto="Centro de custo">
              <input className="input" placeholder="Filtrar por centro" value={filtros.centro_custo} onChange={(e) => aplicarFiltro("centro_custo", e.target.value)} />
            </Label>
          </div>
        )}

        {/* Chips de filtros ativos */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 rounded-pill bg-[#EFF6FF] px-2.5 py-1 text-meta font-medium text-[#1D4ED8]">
                {c.label}
                <button onClick={() => removerChip(c.chave)} aria-label="Remover filtro">
                  <X size={13} />
                </button>
              </span>
            ))}
            <button className="text-meta font-medium text-[#1D4ED8] hover:underline" onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>
        )}

        {/* Estado: organização vazia */}
        {dados && total === 0 && !temFiltroAtivo && (
          <EmptyState
            icon={<Truck size={24} />}
            titulo="Nenhum veículo cadastrado"
            descricao="Cadastre o primeiro veículo para começar a controlar abastecimentos, manutenção e custos da frota."
            acao={{ label: "Cadastrar veículo", onClick: () => setDrawerAberto(true) }}
            permissao={hasPermission("vehicle.manage")}
          />
        )}

        {/* Estado: filtro sem resultado */}
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
          <div className="hidden overflow-x-auto rounded-card border border-surface-border bg-white shadow-card md:block">
            <table className="w-full min-w-160 text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                  <Th sortable="placa" sortBy={sortBy} order={order} onClick={() => ordenarPor("placa")}>Veículo</Th>
                  <th className="px-4 py-3">KM / Horímetro</th>
                  <th className="px-4 py-3">Consumo médio</th>
                  <th className="px-4 py-3">Último abastecimento</th>
                  <th className="px-4 py-3">Última manutenção</th>
                  <th className="px-4 py-3">Próxima manutenção</th>
                  <Th sortable="situacao" sortBy={sortBy} order={order} onClick={() => ordenarPor("situacao")}>Situação</Th>
                  <th className="px-4 py-3 text-right">⋯</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((v) => (
                  <LinhaVeiculo key={v.id} v={v} acoes={acoesVeiculo(v)} />
                ))}
              </tbody>
            </table>
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

        {/* Paginação */}
        {dados && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-meta text-text-subtle">
              {dados.itens.length} de {total} veículo{total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPagina(1);
                }}
                className="input w-auto py-1.5 text-meta"
              >
                {LIMITES.map((l) => (
                  <option key={l} value={l}>{l} por página</option>
                ))}
              </select>
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-meta text-text-subtle">
                {pagina} / {totalPaginas}
              </span>
              <button
                className="btn btn-secondary btn-sm"
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

function Th({ children, sortable, sortBy, order, onClick }: { children: React.ReactNode; sortable?: Sortable; sortBy?: Sortable; order?: string; onClick?: () => void }) {
  const ativo = sortable && sortBy === sortable;
  return (
    <th className="px-4 py-3">
      {sortable ? (
        <button onClick={onClick} className={`inline-flex items-center gap-1 uppercase tracking-wide ${ativo ? "text-[#1D4ED8]" : ""}`}>
          {children}
          {ativo && (order === "asc" ? <ChevronDown size={13} className="rotate-180" /> : <ChevronDown size={13} />)}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function LinhaVeiculo({ v, acoes }: { v: VeiculoListItem; acoes: MenuAcao[] }) {
  const prox = v.proxima_manutencao;
  return (
    <tr className="group border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
      <td className="px-4 py-3.5">
        <Link href={`/veiculos/${v.id}`} className="flex items-center gap-3">
          <FotoVeiculo src={v.foto_url} className="h-10 w-14 flex-shrink-0 rounded-btn border border-surface-border" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-text-title">{v.placa}</div>
            <div className="truncate text-meta text-text-subtle">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3.5 tabular-nums">
        {v.usa_horimetro ? formatarHorimetro(v.horimetro_atual) : formatarKm(v.quilometragem_atual)}
      </td>
      <td className="px-4 py-3.5 tabular-nums">{formatarConsumo(v.consumo_medio_km_l)}</td>
      <td className="px-4 py-3.5">
        {v.ultimo_abastecimento ? (
          <div className="tabular-nums">
            <div>{formatarData(v.ultimo_abastecimento.data)}</div>
            <div className="text-meta text-text-subtle">{Number(v.ultimo_abastecimento.litros).toLocaleString("pt-BR")} L</div>
          </div>
        ) : "—"}
      </td>
      <td className="px-4 py-3.5">
        {v.ultima_manutencao ? (
          <div>
            <div>{formatarData(v.ultima_manutencao.data)}</div>
            <div className="text-meta text-text-subtle">{v.ultima_manutencao.status.replace("_", " ")}</div>
          </div>
        ) : "—"}
      </td>
      <td className="px-4 py-3.5">
        {prox ? (
          <ProximaManutencao prox={prox} />
        ) : "—"}
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge situacao={v.situacao} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <MenuAcoes acoes={acoes} />
      </td>
    </tr>
  );
}

function ProximaManutencao({ prox }: { prox: { nome: string; proxima_km: number | null; proxima_data: string | null; situacao: string } }) {
  const vencida = prox.situacao === "VENCIDA";
  const proxima = prox.situacao === "PROXIMA";
  const classe = vencida ? "bg-red-50 text-[#B42318]" : proxima ? "bg-orange-50 text-[#B54708]" : "bg-green-50 text-[#067647]";
  const texto =
    prox.proxima_km != null
      ? `Em ${prox.proxima_km.toLocaleString("pt-BR")} km`
      : prox.proxima_data
      ? `Em ${formatarData(prox.proxima_data)}`
      : prox.nome;
  const pre = vencida ? "Vencida · " : "";
  return (
    <span className={`rounded-pill px-2 py-0.5 text-meta ${classe}`}>
      {pre}
      {texto}
    </span>
  );
}

function CardVeiculo({ v, acoes }: { v: VeiculoListItem; acoes: MenuAcao[] }) {
  const prox = v.proxima_manutencao;
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <FotoVeiculo src={v.foto_url} className="h-14 w-20 flex-shrink-0 rounded-btn border border-surface-border" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/veiculos/${v.id}`} className="text-body font-semibold text-text-title hover:text-[#1D4ED8]">
              {v.placa}
            </Link>
            <MenuAcoes acoes={acoes} />
          </div>
          <div className="text-meta text-text-subtle">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-body-sm tabular-nums">
            <span>{formatarKm(v.quilometragem_atual)}</span>
            <span className="text-text-subtle">{formatarConsumo(v.consumo_medio_km_l)}</span>
          </div>
          <div className="mt-2">
            <StatusBadge situacao={v.situacao} />
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-surface-border pt-3 text-meta">
        <div>
          <div className="text-text-subtle">Último abastecimento</div>
          <div className="tabular-nums">{v.ultimo_abastecimento ? formatarData(v.ultimo_abastecimento.data) : "—"}</div>
        </div>
        <div>
          <div className="text-text-subtle">Próxima manutenção</div>
          <div>{prox ? <ProximaManutencao prox={prox} /> : "—"}</div>
        </div>
      </div>
      <div className="mt-3">
        <Link href={`/veiculos/${v.id}`} className="text-body-sm font-medium text-[#1D4ED8] hover:underline">
          Abrir ficha
        </Link>
      </div>
    </div>
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
