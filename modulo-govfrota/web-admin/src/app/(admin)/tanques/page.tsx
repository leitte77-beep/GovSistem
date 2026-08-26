"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Building2, ChevronLeft, ChevronRight, Droplets, Fuel, PackagePlus, Pencil, Plus,
  Search, SlidersHorizontal, ArrowDownToLine, Scale, Repeat, Eye, X,
} from "lucide-react";
import { api, Combustivel, Entrada, Fornecedor, Tanque } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequirePermission } from "@/components/RequirePermission";
import { EmptyState } from "@/components/veiculo/EmptyState";
import { MenuAcoes } from "@/components/veiculo/MenuAcoes";
import { StatusTanqueBadge } from "@/components/tanque/StatusTanqueBadge";
import { FotoCombustivel } from "@/components/tanque/FotoCombustivel";
import { TanqueFormDrawer } from "@/components/tanque/TanqueFormDrawer";
import { CombustivelFormDrawer } from "@/components/tanque/CombustivelFormDrawer";
import { FornecedorFormDrawer } from "@/components/tanque/FornecedorFormDrawer";
import { EntradaFormDrawer } from "@/components/tanque/EntradaFormDrawer";
import { AjusteModal, CancelarEntradaModal, InventarioModal, TransferenciaModal } from "@/components/tanque/AcoesModals";
import { ConfirmarModal } from "@/components/tanque/Drawer";
import { categoriaFornecedor, corStatusTanque, mascaraCpfCnpj, rotuloMovimentacao } from "@/lib/combustiveis";

type Aba = "estoque" | "entradas" | "combustiveis" | "fornecedores";

const ABAS: { chave: Aba; label: string }[] = [
  { chave: "estoque", label: "Estoque dos tanques" },
  { chave: "entradas", label: "Entradas de combustível" },
  { chave: "combustiveis", label: "Tipos de combustível" },
  { chave: "fornecedores", label: "Fornecedores" },
];

export default function CombustiveisPage() {
  const { hasPermission } = useAuth();
  const podeGerenciar = hasPermission("fuel.manage");

  const [aba, setAba] = useState<Aba>("estoque");

  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Entradas (paginadas + filtros)
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [totalEntradas, setTotalEntradas] = useState(0);
  const [entradasLimit, setEntradasLimit] = useState(50);
  const [entradasSkip, setEntradasSkip] = useState(0);
  const [filtroEntradas, setFiltroEntradas] = useState({ busca: "", tipo: "" });

  // Fornecedores (paginados + filtros)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [totalFornecedores, setTotalFornecedores] = useState(0);
  const [fornecedoresLimit, setFornecedoresLimit] = useState(50);
  const [fornecedoresSkip, setFornecedoresSkip] = useState(0);
  const [filtroFornecedores, setFiltroFornecedores] = useState({ busca: "", categoria: "", ativo: "" });

  const [buscaTanque, setBuscaTanque] = useState("");
  const [buscaCombustivel, setBuscaCombustivel] = useState("");

  // Drawers
  const [tanqueDrawer, setTanqueDrawer] = useState<{ aberto: boolean; item: Tanque | null }>({ aberto: false, item: null });
  const [combDrawer, setCombDrawer] = useState<{ aberto: boolean; item: Combustivel | null }>({ aberto: false, item: null });
  const [fornDrawer, setFornDrawer] = useState<{ aberto: boolean; item: Fornecedor | null }>({ aberto: false, item: null });
  const [entradaDrawer, setEntradaDrawer] = useState<{ aberto: boolean; tanqueInicial?: string }>({ aberto: false });

  // Ações (modais)
  const [acaoTanque, setAcaoTanque] = useState<{ tipo: "ajuste" | "inventario" | "transferencia" | "inativar"; positivo?: boolean } | null>(null);
  const [cancelarEntrada, setCancelarEntrada] = useState<Entrada | null>(null);
  const [inativarCombustivel, setInativarCombustivel] = useState<Combustivel | null>(null);
  const [inativarFornecedor, setInativarFornecedor] = useState<Fornecedor | null>(null);

  const carregarBase = useCallback(async () => {
    try {
      const [ts, cs, fs] = await Promise.all([
        api.listTanques(),
        api.listCombustiveis(),
        api.listFornecedores({ skip: 0, limit: 200 }),
      ]);
      setTanques(ts);
      setCombustiveis(cs);
      setFornecedores(fs.itens);
      setTotalFornecedores(fs.total);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  const carregarEntradas = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { skip: entradasSkip, limit: entradasLimit };
      if (filtroEntradas.busca) params.numero_nota = filtroEntradas.busca;
      if (filtroEntradas.tipo) params.cancelada = filtroEntradas.tipo === "cancelada";
      const r = await api.listEntradas(params);
      setEntradas(r.itens);
      setTotalEntradas(r.total);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [entradasSkip, entradasLimit, filtroEntradas]);

  useEffect(() => {
    carregarBase().finally(() => setCarregando(false));
  }, [carregarBase]);

  useEffect(() => {
    if (aba === "entradas") carregarEntradas();
  }, [aba, carregarEntradas]);

  const recarregar = () => {
    carregarBase();
    if (aba === "entradas") carregarEntradas();
  };

  // Filtro de busca com debounce para fornecedores
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carregarFornecedoresFiltrados = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { skip: fornecedoresSkip, limit: fornecedoresLimit };
      if (filtroFornecedores.busca) params.search = filtroFornecedores.busca;
      if (filtroFornecedores.categoria) params.categoria = filtroFornecedores.categoria;
      if (filtroFornecedores.ativo) params.ativo = filtroFornecedores.ativo === "ativo";
      const r = await api.listFornecedores(params);
      setFornecedores(r.itens);
      setTotalFornecedores(r.total);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [fornecedoresSkip, fornecedoresLimit, filtroFornecedores]);

  useEffect(() => {
    if (aba === "fornecedores") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => carregarFornecedoresFiltrados(), 300);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [aba, carregarFornecedoresFiltrados]);

  const tanquesFiltrados = useMemo(() => {
    const q = buscaTanque.trim().toLowerCase();
    if (!q) return tanques;
    return tanques.filter(
      (t) =>
        t.nome.toLowerCase().includes(q) ||
        (t.codigo ?? "").toLowerCase().includes(q) ||
        (t.combustivel_nome ?? "").toLowerCase().includes(q)
    );
  }, [tanques, buscaTanque]);

  const combustiveisFiltrados = useMemo(() => {
    const q = buscaCombustivel.trim().toLowerCase();
    if (!q) return combustiveis;
    return combustiveis.filter((c) => c.nome.toLowerCase().includes(q));
  }, [combustiveis, buscaCombustivel]);

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-5">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-h1 text-text-title">Combustíveis</h1>
          <p className="mt-1 text-body-sm text-text-subtle">
            Controle tanques, entradas, estoque, fornecedores e movimentações de combustível.
          </p>
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-1 border-b border-surface-border">
          {ABAS.map((a) => (
            <button
              key={a.chave}
              onClick={() => setAba(a.chave)}
              className={`px-4 py-2 text-body-sm ${aba === a.chave ? "border-b-2 border-[#1D4ED8] font-medium text-[#1D4ED8]" : "text-text-body hover:text-text-title"}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {carregando ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-card bg-surface-bg" />)}
          </div>
        ) : (
          <>
            {aba === "estoque" && (
              <EstoqueTab
                tanques={tanquesFiltrados}
                busca={buscaTanque}
                setBusca={setBuscaTanque}
                podeGerenciar={podeGerenciar}
                onBuscaLimpar={() => setBuscaTanque("")}
                onNovo={() => setTanqueDrawer({ aberto: true, item: null })}
                onVer={(t) => {}}
                onEntrada={(t) => setEntradaDrawer({ aberto: true, tanqueInicial: t.id })}
                onAjuste={(t, positivo) => { setAcaoTanque({ tipo: "ajuste", positivo }); setTanqueDrawer({ aberto: false, item: t }); }}
                onInventario={(t) => { setAcaoTanque({ tipo: "inventario" }); setTanqueDrawer({ aberto: false, item: t }); }}
                onTransferencia={(t) => { setAcaoTanque({ tipo: "transferencia" }); setTanqueDrawer({ aberto: false, item: t }); }}
                onEditar={(t) => setTanqueDrawer({ aberto: true, item: t })}
                onInativar={(t) => { setAcaoTanque({ tipo: "inativar" }); setTanqueDrawer({ aberto: false, item: t }); }}
              />
            )}

            {aba === "entradas" && (
              <EntradasTab
                entradas={entradas}
                total={totalEntradas}
                skip={entradasSkip}
                limit={entradasLimit}
                filtro={filtroEntradas}
                setFiltro={setFiltroEntradas}
                setSkip={setEntradasSkip}
                setLimit={setEntradasLimit}
                podeGerenciar={podeGerenciar}
                onNovo={() => setEntradaDrawer({ aberto: true })}
                onCancelar={(e) => setCancelarEntrada(e)}
              />
            )}

            {aba === "combustiveis" && (
              <CombustiveisTab
                combustiveis={combustiveisFiltrados}
                busca={buscaCombustivel}
                setBusca={setBuscaCombustivel}
                podeGerenciar={podeGerenciar}
                onNovo={() => setCombDrawer({ aberto: true, item: null })}
                onEditar={(c) => setCombDrawer({ aberto: true, item: c })}
                onInativar={(c) => setInativarCombustivel(c)}
              />
            )}

            {aba === "fornecedores" && (
              <FornecedoresTab
                fornecedores={fornecedores}
                total={totalFornecedores}
                skip={fornecedoresSkip}
                limit={fornecedoresLimit}
                filtro={filtroFornecedores}
                setFiltro={setFiltroFornecedores}
                setSkip={setFornecedoresSkip}
                setLimit={setFornecedoresLimit}
                podeGerenciar={podeGerenciar}
                onNovo={() => setFornDrawer({ aberto: true, item: null })}
                onEditar={(f) => setFornDrawer({ aberto: true, item: f })}
                onInativar={(f) => setInativarFornecedor(f)}
                onEntrada={() => setEntradaDrawer({ aberto: true })}
              />
            )}
          </>
        )}

        {/* Drawers */}
        <TanqueFormDrawer
          aberto={tanqueDrawer.aberto}
          onClose={() => setTanqueDrawer({ aberto: false, item: null })}
          tanque={tanqueDrawer.item}
          combustiveis={combustiveis}
          onSalvo={recarregar}
        />
        <CombustivelFormDrawer
          aberto={combDrawer.aberto}
          onClose={() => setCombDrawer({ aberto: false, item: null })}
          combustivel={combDrawer.item}
          onSalvo={recarregar}
        />
        <FornecedorFormDrawer
          aberto={fornDrawer.aberto}
          onClose={() => setFornDrawer({ aberto: false, item: null })}
          fornecedor={fornDrawer.item}
          onSalvo={recarregar}
        />
        <EntradaFormDrawer
          aberto={entradaDrawer.aberto}
          onClose={() => setEntradaDrawer({ aberto: false })}
          tanques={tanques}
          fornecedores={fornecedores}
          onSalvo={recarregar}
          tanqueInicialId={entradaDrawer.tanqueInicial}
        />

        {/* Modais de ação do tanque */}
        {acaoTanque && tanqueDrawer.item && (
          <>
            {acaoTanque.tipo === "ajuste" && (
              <AjusteModal
                aberto
                onClose={() => { setAcaoTanque(null); setTanqueDrawer({ aberto: false, item: null }); }}
                tanque={tanqueDrawer.item}
                positivo={acaoTanque.positivo!}
                onConcluido={recarregar}
              />
            )}
            {acaoTanque.tipo === "inventario" && (
              <InventarioModal
                aberto
                onClose={() => { setAcaoTanque(null); setTanqueDrawer({ aberto: false, item: null }); }}
                tanque={tanqueDrawer.item}
                onConcluido={recarregar}
              />
            )}
            {acaoTanque.tipo === "transferencia" && (
              <TransferenciaModal
                aberto
                onClose={() => { setAcaoTanque(null); setTanqueDrawer({ aberto: false, item: null }); }}
                tanque={tanqueDrawer.item}
                tanques={tanques}
                onConcluido={recarregar}
              />
            )}
            {acaoTanque.tipo === "inativar" && (
              <ConfirmarModal
                aberto
                onClose={() => { setAcaoTanque(null); setTanqueDrawer({ aberto: false, item: null }); }}
                titulo="Inativar tanque"
                descricao={`Deseja inativar o tanque "${tanqueDrawer.item.nome}"? Ele deixará de aparecer como opção de abastecimento, mas o histórico é preservado.`}
                confirmarLabel="Inativar"
                perigo
                onConfirmar={async () => {
                  await api.updateTanque(tanqueDrawer.item!.id, { ativo: false });
                  toast.success("Tanque inativado.");
                  recarregar();
                }}
              />
            )}
          </>
        )}

        {/* Cancelar entrada */}
        <CancelarEntradaModal
          aberto={!!cancelarEntrada}
          onClose={() => setCancelarEntrada(null)}
          entradaId={cancelarEntrada?.id ?? ""}
          entradaRef={cancelarEntrada?.numero_nota ?? cancelarEntrada?.id ?? ""}
          onConcluido={recarregar}
        />

        {/* Inativar combustível / fornecedor */}
        <ConfirmarModal
          aberto={!!inativarCombustivel}
          onClose={() => setInativarCombustivel(null)}
          titulo="Inativar combustível"
          descricao={`Deseja inativar "${inativarCombustivel?.nome}"? Ele será mantido no histórico, mas não aparecerá em novos cadastros.`}
          confirmarLabel="Inativar"
          perigo
          onConfirmar={async () => {
            const c = inativarCombustivel!;
            await api.updateCombustivel(c.id, { nome: c.nome, unidade: c.unidade, ativo: false });
            toast.success("Combustível inativado.");
            recarregar();
          }}
        />
        <ConfirmarModal
          aberto={!!inativarFornecedor}
          onClose={() => setInativarFornecedor(null)}
          titulo="Inativar fornecedor"
          descricao={`Deseja inativar "${inativarFornecedor?.razao_social}"? Ele será mantido no histórico, mas não aparecerá em novas entradas.`}
          confirmarLabel="Inativar"
          perigo
          onConfirmar={async () => {
            const f = inativarFornecedor!;
            await api.updateFornecedor(f.id, { ativo: false });
            toast.success("Fornecedor inativado.");
            recarregar();
          }}
        />
      </div>
    </RequirePermission>
  );
}

// ── Aba: Estoque dos tanques ───────────────────────────────────────────────

function EstoqueTab(props: {
  tanques: Tanque[];
  busca: string;
  setBusca: (v: string) => void;
  podeGerenciar: boolean;
  onBuscaLimpar: () => void;
  onNovo: () => void;
  onVer: (t: Tanque) => void;
  onEntrada: (t: Tanque) => void;
  onAjuste: (t: Tanque, positivo: boolean) => void;
  onInventario: (t: Tanque) => void;
  onTransferencia: (t: Tanque) => void;
  onEditar: (t: Tanque) => void;
  onInativar: (t: Tanque) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            value={props.busca}
            onChange={(e) => props.setBusca(e.target.value)}
            placeholder="Buscar por nome, código ou combustível…"
            className="input pl-9"
          />
        </div>
        {props.podeGerenciar && (
          <button className="btn btn-primary" onClick={props.onNovo}>
            <Plus size={16} /> Novo tanque
          </button>
        )}
      </div>

      {props.tanques.length === 0 ? (
        props.busca ? (
          <EmptyState icon={<Search size={22} />} titulo="Nenhum tanque encontrado" descricao="Ajuste a busca para encontrar o tanque desejado." acao={{ label: "Limpar busca", onClick: props.onBuscaLimpar, tipo: "secondary" }} />
        ) : (
          <EmptyState
            icon={<Droplets size={22} />}
            titulo="Nenhum tanque cadastrado"
            descricao="Cadastre um tanque para começar a controlar o estoque de combustível."
            acao={props.podeGerenciar ? { label: "Novo tanque", onClick: props.onNovo } : undefined}
            permissao={props.podeGerenciar}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {props.tanques.map((t) => (
            <CardTanque key={t.id} tanque={t} {...props} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardTanque(props: {
  tanque: Tanque;
  podeGerenciar: boolean;
  onVer: (t: Tanque) => void;
  onEntrada: (t: Tanque) => void;
  onAjuste: (t: Tanque, positivo: boolean) => void;
  onInventario: (t: Tanque) => void;
  onTransferencia: (t: Tanque) => void;
  onEditar: (t: Tanque) => void;
  onInativar: (t: Tanque) => void;
}) {
  const t = props.tanque;
  const capacidade = Number(t.capacidade_maxima);
  const temCapacidade = capacidade > 0;
  const pct = t.percentual_disponivel;
  const barra = temCapacidade ? Math.max(0, Math.min(pct ?? 0, 100)) : 0;
  const ultima = t.ultima_movimentacao;

  const acoes = [
    { key: "ver", label: "Ver tanque", icon: <Eye size={16} />, href: `/tanques/${t.id}` },
    ...(props.podeGerenciar
      ? [
          { key: "entrada", label: "Registrar entrada", icon: <ArrowDownToLine size={16} />, onClick: () => props.onEntrada(t) },
          { key: "inventario", label: "Conferir estoque", icon: <Scale size={16} />, onClick: () => props.onInventario(t) },
          { key: "ajuste", label: "Ajustar estoque", icon: <SlidersHorizontal size={16} />, onClick: () => props.onAjuste(t, true) },
          { key: "transferencia", label: "Transferir combustível", icon: <Repeat size={16} />, onClick: () => props.onTransferencia(t) },
          { key: "editar", label: "Editar tanque", icon: <Pencil size={16} />, onClick: () => props.onEditar(t) },
          { key: "inativar", label: "Inativar", icon: <X size={16} />, cor: "danger" as const, onClick: () => props.onInativar(t) },
        ]
      : []),
  ];

  return (
    <div className="group flex flex-col overflow-hidden rounded-card border border-surface-border bg-white shadow-card transition-shadow hover:shadow-elevated">
      <Link href={`/tanques/${t.id}`} className="relative block h-36 w-full bg-surface-bg">
        <FotoCombustivel
          src={t.foto_url}
          alt={`Foto do ${t.nome}`}
          className="h-full w-full object-cover"
          fallback={<Droplets className="h-10 w-10" />}
          rounded="rounded-none"
        />
        <div className="absolute right-2 top-2">
          <StatusTanqueBadge ativo={t.ativo} status={t.status_estoque} estoqueAtual={t.estoque_atual} />
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/tanques/${t.id}`} className="text-h3 font-semibold text-text-title hover:text-[#1D4ED8]">{t.nome}</Link>
            <p className="flex items-center gap-1 text-meta text-text-subtle">
              <Fuel size={12} /> {t.combustivel_nome ?? "—"}
            </p>
          </div>
          <div className="opacity-100">
            <MenuAcoes acoes={acoes} />
          </div>
        </div>

        <div className="mt-3">
          <p className="text-body text-text-title">
            {Number(t.estoque_atual).toLocaleString("pt-BR")} <span className="text-text-subtle">de {temCapacidade ? `${capacidade.toLocaleString("pt-BR")} L` : "capacidade"}</span>
          </p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-bg">
            <div className={`h-full ${corStatusTanque(t.status_estoque)}`} style={{ width: `${barra}%` }} />
          </div>
          <p className="mt-1 text-meta text-text-subtle">
            {temCapacidade ? `${(pct ?? 0).toFixed(0)}% disponível` : "Capacidade não informada"}
            {Number(t.estoque_minimo) > 0 && <> · mínimo {Number(t.estoque_minimo).toLocaleString("pt-BR")} L</>}
          </p>
        </div>

        <div className="mt-3 border-t border-surface-border pt-2 text-meta text-text-subtle">
          {ultima ? (
            <span>
              Última: <strong className="font-medium text-text-body">{rotuloMovimentacao(ultima.tipo, "")}</strong> · {new Date(ultima.created_at).toLocaleDateString("pt-BR")}
            </span>
          ) : (
            <span>Última movimentação: —</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Aba: Entradas ──────────────────────────────────────────────────────────

function EntradasTab(props: {
  entradas: Entrada[];
  total: number;
  skip: number;
  limit: number;
  filtro: { busca: string; tipo: string };
  setFiltro: (f: { busca: string; tipo: string }) => void;
  setSkip: (n: number) => void;
  setLimit: (n: number) => void;
  podeGerenciar: boolean;
  onNovo: () => void;
  onCancelar: (e: Entrada) => void;
}) {
  const { entradas, total, skip, limit, setSkip, setLimit } = props;
  const paginas = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2 text-text-title">Entradas de combustível</h2>
          <p className="mt-0.5 text-body-sm text-text-subtle">Registre compras e recebimentos de combustível nos tanques.</p>
        </div>
        {props.podeGerenciar && (
          <button className="btn btn-primary" onClick={props.onNovo}>
            <Plus size={16} /> Nova entrada
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            value={props.filtro.busca}
            onChange={(e) => { props.setFiltro({ ...props.filtro, busca: e.target.value }); props.setSkip(0); }}
            placeholder="Buscar por NF…"
            className="input pl-9"
          />
        </div>
        <select
          value={props.filtro.tipo}
          onChange={(e) => { props.setFiltro({ ...props.filtro, tipo: e.target.value }); props.setSkip(0); }}
          className="input w-auto"
        >
          <option value="">Todas as entradas</option>
          <option value="confirmada">Confirmadas</option>
          <option value="cancelada">Canceladas</option>
        </select>
      </div>

      {entradas.length === 0 ? (
        <EmptyState
          icon={<PackagePlus size={22} />}
          titulo="Nenhuma entrada registrada"
          descricao="Registre uma compra ou recebimento de combustível para creditar o estoque de um tanque."
          acao={props.podeGerenciar ? { label: "Nova entrada", onClick: props.onNovo } : undefined}
          permissao={props.podeGerenciar}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-200 text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tanque</th>
                  <th className="px-4 py-3">Combustível</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Litros</th>
                  <th className="px-4 py-3">NF</th>
                  <th className="px-4 py-3">Valor total</th>
                  <th className="px-4 py-3">R$/L</th>
                  <th className="px-4 py-3">Status</th>
                  {props.podeGerenciar && <th className="px-4 py-3">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {entradas.map((e) => (
                  <tr key={e.id} className="border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
                    <td className="px-4 py-3">{new Date(e.data_entrada + "T12:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3 font-medium text-text-title">{e.tanque_nome ?? "—"}</td>
                    <td className="px-4 py-3">{e.combustivel_nome ?? "—"}</td>
                    <td className="px-4 py-3">{e.fornecedor_nome ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{Number(e.quantidade_litros).toLocaleString("pt-BR")} L</td>
                    <td className="px-4 py-3">{e.numero_nota ?? "—"}</td>
                    <td className="px-4 py-3">{e.valor_total ? `R$ ${Number(e.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                    <td className="px-4 py-3">{e.valor_por_litro ? `R$ ${Number(e.valor_por_litro).toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${e.cancelada ? "bg-[#FFDAD6] text-[#BA1A1A]" : "bg-[#9DF6B3] text-[#106D34]"}`}>
                        {e.cancelada ? "Cancelada" : "Confirmada"}
                      </span>
                    </td>
                    {props.podeGerenciar && (
                      <td className="px-4 py-3">
                        {!e.cancelada && (
                          <MenuAcoes
                            acoes={[
                              { key: "cancelar", label: "Cancelar entrada", icon: <X size={16} />, cor: "danger", onClick: () => props.onCancelar(e) },
                            ]}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao total={total} skip={skip} limit={limit} setSkip={setSkip} setLimit={setLimit} paginas={paginas} />
        </>
      )}
    </div>
  );
}

function Paginacao({ total, skip, limit, setSkip, setLimit, paginas }: { total: number; skip: number; limit: number; setSkip: (n: number) => void; setLimit: (n: number) => void; paginas: number }) {
  const pagina = Math.floor(skip / limit) + 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-body-sm text-text-subtle">
      <div className="flex items-center gap-2">
        <span className="text-meta">{total} registro(s)</span>
        <select className="input w-auto py-1" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setSkip(0); }}>
          <option value={20}>20 / página</option>
          <option value={50}>50 / página</option>
          <option value={100}>100 / página</option>
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => setSkip(Math.max(skip - limit, 0))}><ChevronLeft size={16} /></button>
        <span className="px-2 text-meta">Página {pagina} de {Math.max(paginas, 1)}</span>
        <button className="btn btn-ghost btn-sm" disabled={pagina >= paginas} onClick={() => setSkip(skip + limit)}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

// ── Aba: Tipos de combustível ──────────────────────────────────────────────

function CombustiveisTab(props: {
  combustiveis: Combustivel[];
  busca: string;
  setBusca: (v: string) => void;
  podeGerenciar: boolean;
  onNovo: () => void;
  onEditar: (c: Combustivel) => void;
  onInativar: (c: Combustivel) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input value={props.busca} onChange={(e) => props.setBusca(e.target.value)} placeholder="Buscar por nome…" className="input pl-9" />
        </div>
        {props.podeGerenciar && (
          <button className="btn btn-primary" onClick={props.onNovo}><Plus size={16} /> Novo tipo de combustível</button>
        )}
      </div>

      {props.combustiveis.length === 0 ? (
        <EmptyState
          icon={<Fuel size={22} />}
          titulo="Nenhum combustível cadastrado"
          descricao="Cadastre os tipos de combustível usados pela frota (ex.: Diesel S10, Gasolina, Etanol)."
          acao={props.podeGerenciar ? { label: "Novo combustível", onClick: props.onNovo } : undefined}
          permissao={props.podeGerenciar}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.combustiveis.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card">
              <FotoCombustivel
                src={c.foto_url}
                alt={`Ícone ${c.nome}`}
                className="h-12 w-12 flex-shrink-0 object-cover"
                fallback={<Fuel className="h-6 w-6" />}
              />
              <div className="flex-1">
                <p className="font-medium text-text-title">{c.nome}</p>
                <p className="text-meta text-text-subtle capitalize">{c.unidade}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-pill bg-[#EFF6FF] px-2 py-0.5 text-meta text-[#1D4ED8]">{c.total_tanques ?? 0} tanque(s)</span>
                  <span className="rounded-pill bg-surface-bg px-2 py-0.5 text-meta text-text-subtle">{c.total_veiculos ?? 0} veículo(s)</span>
                  <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${c.ativo ? "bg-[#9DF6B3] text-[#106D34]" : "bg-surface-bg text-text-subtle"}`}>
                    {c.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
              {props.podeGerenciar && (
                <MenuAcoes
                  acoes={[
                    { key: "editar", label: "Editar", icon: <Pencil size={16} />, onClick: () => props.onEditar(c) },
                    { key: "inativar", label: c.ativo ? "Inativar" : "Reativar", icon: <X size={16} />, cor: "danger", onClick: () => props.onInativar(c) },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba: Fornecedores ──────────────────────────────────────────────────────

function FornecedoresTab(props: {
  fornecedores: Fornecedor[];
  total: number;
  skip: number;
  limit: number;
  filtro: { busca: string; categoria: string; ativo: string };
  setFiltro: (f: { busca: string; categoria: string; ativo: string }) => void;
  setSkip: (n: number) => void;
  setLimit: (n: number) => void;
  podeGerenciar: boolean;
  onNovo: () => void;
  onEditar: (f: Fornecedor) => void;
  onInativar: (f: Fornecedor) => void;
  onEntrada: () => void;
}) {
  const { fornecedores, total, skip, limit, setSkip, setLimit } = props;
  const paginas = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2 text-text-title">Fornecedores</h2>
          <p className="mt-0.5 text-body-sm text-text-subtle">Gerencie fornecedores de combustível, peças e serviços da frota.</p>
        </div>
        {props.podeGerenciar && (
          <button className="btn btn-primary" onClick={props.onNovo}><Plus size={16} /> Novo fornecedor</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            value={props.filtro.busca}
            onChange={(e) => { props.setFiltro({ ...props.filtro, busca: e.target.value }); props.setSkip(0); }}
            placeholder="Buscar por nome ou CPF/CNPJ…"
            className="input pl-9"
          />
        </div>
        <select value={props.filtro.categoria} onChange={(e) => { props.setFiltro({ ...props.filtro, categoria: e.target.value }); props.setSkip(0); }} className="input w-auto">
          <option value="">Todas as categorias</option>
          {["COMBUSTIVEL", "AUTOPECAS", "PNEUS", "ELETRICA", "MECANICA", "FUNILARIA", "CONCESSIONARIA", "OUTRO"].map((c) => (
            <option key={c} value={c}>{categoriaFornecedor(c)}</option>
          ))}
        </select>
        <select value={props.filtro.ativo} onChange={(e) => { props.setFiltro({ ...props.filtro, ativo: e.target.value }); props.setSkip(0); }} className="input w-auto">
          <option value="">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      {fornecedores.length === 0 ? (
        <EmptyState
          icon={<Building2 size={22} />}
          titulo="Nenhum fornecedor cadastrado"
          descricao="Cadastre fornecedores de combustível, autopeças e serviços para associar às entradas e manutenções."
          acao={props.podeGerenciar ? { label: "Novo fornecedor", onClick: props.onNovo } : undefined}
          permissao={props.podeGerenciar}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-200 text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3">Total fornecido</th>
                  <th className="px-4 py-3">Status</th>
                  {props.podeGerenciar && <th className="px-4 py-3">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} className="border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
                    <td className="px-4 py-3">
                      <Link href={`/tanques/fornecedores/${f.id}`} className="flex items-center gap-3">
                        <FotoCombustivel
                          src={f.foto_url}
                          alt={`Logo ${f.razao_social}`}
                          className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                          rounded="rounded-full"
                          fallback={
                            <span className="flex h-full w-full items-center justify-center bg-[#EFF6FF] text-label font-semibold text-[#1D4ED8]">
                              {(f.nome_fantasia || f.razao_social).charAt(0).toUpperCase()}
                            </span>
                          }
                        />
                        <div>
                          <p className="font-medium text-text-title hover:text-[#1D4ED8]">{f.nome_fantasia || f.razao_social}</p>
                          {f.nome_fantasia && <p className="text-meta text-text-subtle">{f.razao_social}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{mascaraCpfCnpj(f.cpf_cnpj)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-pill bg-[#EFF6FF] px-2 py-0.5 text-meta font-medium text-[#1D4ED8]">{categoriaFornecedor(f.categoria)}</span>
                    </td>
                    <td className="px-4 py-3 text-meta text-text-subtle">
                      {f.telefone || "—"}<br />{f.email || ""}
                    </td>
                    <td className="px-4 py-3">
                      {f.ultima_compra ? new Date(f.ultima_compra.data + "T12:00").toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {f.valor_total ? `R$ ${f.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${f.ativo ? "bg-[#9DF6B3] text-[#106D34]" : "bg-surface-bg text-text-subtle"}`}>
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    {props.podeGerenciar && (
                      <td className="px-4 py-3">
                        <MenuAcoes
                          acoes={[
                            { key: "ver", label: "Ver fornecedor", icon: <Eye size={16} />, href: `/tanques/fornecedores/${f.id}` },
                            { key: "editar", label: "Editar", icon: <Pencil size={16} />, onClick: () => props.onEditar(f) },
                            { key: "entrada", label: "Registrar entrada", icon: <PackagePlus size={16} />, onClick: props.onEntrada },
                            { key: "inativar", label: f.ativo ? "Inativar" : "Reativar", icon: <X size={16} />, cor: "danger", onClick: () => props.onInativar(f) },
                          ]}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao total={total} skip={skip} limit={limit} setSkip={setSkip} setLimit={setLimit} paginas={paginas} />
        </>
      )}
    </div>
  );
}
