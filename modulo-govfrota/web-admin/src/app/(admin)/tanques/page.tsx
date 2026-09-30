"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Droplets,
  FileDown,
  Fuel,
  History,
  PackagePlus,
  Pencil,
  Plus,
  Repeat,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Eye,
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
import { VerEntradaModal } from "@/components/tanque/VerEntradaModal";
import { ConfirmarModal } from "@/components/tanque/Drawer";
import { corStatusTanque, rotuloMovimentacao } from "@/lib/combustiveis";

type Aba = "estoque" | "entradas" | "combustiveis";

const ABAS: { chave: Aba; label: string }[] = [
  { chave: "estoque", label: "Estoque dos tanques" },
  { chave: "entradas", label: "Entradas de combustível" },
  { chave: "combustiveis", label: "Tipos de combustível" },
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

  // Fornecedores — só para o formulário de entrada (cadastro em /fornecedores)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const [buscaTanque, setBuscaTanque] = useState("");
  const [buscaCombustivel, setBuscaCombustivel] = useState("");

  // Drawers
  const [tanqueDrawer, setTanqueDrawer] = useState<{ aberto: boolean; item: Tanque | null }>({ aberto: false, item: null });
  const [combDrawer, setCombDrawer] = useState<{ aberto: boolean; item: Combustivel | null }>({ aberto: false, item: null });
  const [entradaDrawer, setEntradaDrawer] = useState<{ aberto: boolean; tanqueInicial?: string }>({ aberto: false });

  // Ações (modais)
  const [acaoTanque, setAcaoTanque] = useState<{ tipo: "ajuste" | "inventario" | "transferencia" | "inativar"; positivo?: boolean } | null>(null);
  const [cancelarEntrada, setCancelarEntrada] = useState<Entrada | null>(null);
  const [verEntrada, setVerEntrada] = useState<Entrada | null>(null);
  const [inativarCombustivel, setInativarCombustivel] = useState<Combustivel | null>(null);

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
    carregarEntradas();
  }, [carregarEntradas]);

  const recarregar = () => {
    carregarBase();
    carregarEntradas();
  };

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

  // KPIs reais
  const volumeTotal = tanques.reduce((s, t) => s + Number(t.estoque_atual || 0), 0);
  const capacidadeTotal = tanques.reduce((s, t) => s + Number(t.capacidade_maxima || 0), 0);
  const pctGlobal = capacidadeTotal > 0 ? (volumeTotal / capacidadeTotal) * 100 : 0;
  const tanquesAtivos = tanques.filter((t) => t.ativo).length;
  const criticos = tanques.filter((t) => (t.percentual_disponivel ?? 100) < 20).length;
  const litrosNum = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <RequirePermission perms="refueling.view">
      <div className="flex flex-col gap-6">
        {/* Banner de contexto */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#106D34]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#106D34]">Estoque de Combustíveis • Reservatórios</span>
            <span className="text-outline-variant">•</span>
            <span className="text-meta text-text-subtle">Controle de tanques, entradas e movimentações</span>
          </div>
          <div className="flex items-center gap-2">
            {podeGerenciar && (
              <>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2 text-meta font-semibold text-text-body transition-colors hover:bg-surface-container-high"
                  onClick={() => setEntradaDrawer({ aberto: true })}
                >
                  <ArrowDownToLine size={16} className="text-primary" /> Registrar Entrada NF-e
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-meta font-semibold text-white shadow-sm transition-all hover:bg-primary-800 active:scale-95"
                  onClick={() => setTanqueDrawer({ aberto: true, item: null })}
                >
                  <Plus size={16} /> Novo tanque
                </button>
              </>
            )}
          </div>
        </div>

        {/* Título */}
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="text-h1 tracking-tight text-text-title">Combustíveis</h1>
            <p className="mt-0.5 max-w-4xl text-body-sm text-text-subtle">
              Controle de tanques municipais, entradas de NF-e, estoque e movimentações de combustível. Fornecedores e postos credenciados ficam em{" "}
              <Link href="/fornecedores" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                Fornecedores
              </Link>
              .
            </p>
          </div>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-meta font-medium text-text-subtle">Volume Total em Estoque</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF4FF] text-primary"><Droplets size={16} /></span>
            </div>
            <div className="mt-2">
              <div className="text-h2 font-black tracking-tight text-text-title">{litrosNum(volumeTotal)} <span className="text-meta font-normal text-text-subtle">L</span></div>
              <div className="mt-0.5 text-meta text-text-subtle">Capacidade global: {litrosNum(capacidadeTotal)} L ({pctGlobal.toFixed(1)}%)</div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-container">
              <div className="h-full rounded-pill bg-primary" style={{ width: `${Math.min(100, pctGlobal)}%` }} />
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-meta font-medium text-text-subtle">Tanques em Operação</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E7F8EC] text-[#106D34]"><Fuel size={16} /></span>
            </div>
            <div className="mt-2">
              <div className="text-h2 font-black tracking-tight text-text-title">{tanquesAtivos}</div>
              <div className="mt-0.5 text-meta text-text-subtle">{tanques.length} tanque(s) cadastrado(s)</div>
            </div>
            <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-pill bg-[#E7F8EC] px-2 py-0.5 text-[11px] font-semibold text-[#106D34]">Operação regular</span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-meta font-medium text-text-subtle">Nível Crítico (&lt; 20%)</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF4D6] text-[#805600]"><AlertTriangle size={16} /></span>
            </div>
            <div className="mt-2">
              <div className="text-h2 font-black tracking-tight text-text-title">{criticos}</div>
              <div className="mt-0.5 text-meta text-text-subtle">{criticos ? "Requer reposição" : "Nenhum tanque em nível crítico"}</div>
            </div>
            {criticos > 0 && (
              <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-pill border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-600" /> atenção
              </span>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-meta font-medium text-text-subtle">Entradas de Combustível</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4338CA]"><PackagePlus size={16} /></span>
            </div>
            <div className="mt-2">
              <div className="text-h2 font-black tracking-tight text-text-title">{totalEntradas}</div>
              <div className="mt-0.5 text-meta text-text-subtle">registro(s) de NF-e</div>
            </div>
            <button onClick={() => setAba("entradas")} className="mt-2 inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
              Abrir entradas <ChevronRight size={12} />
            </button>
          </div>
        </section>

        {/* Abas */}
        <div className="w-fit max-w-full overflow-x-auto">
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-low p-1.5">
            {ABAS.map((a) => {
              const contagem = a.chave === "estoque" ? tanques.length : a.chave === "entradas" ? totalEntradas : combustiveis.length;
              const ativa = aba === a.chave;
              return (
                <button
                  key={a.chave}
                  onClick={() => setAba(a.chave)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-meta font-semibold transition-all ${
                    ativa ? "bg-surface-card text-primary shadow-sm" : "text-text-subtle hover:bg-surface-card/60 hover:text-text-title"
                  }`}
                >
                  {a.label}
                  <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${ativa ? "bg-[#DBEAFE] text-primary" : "bg-surface-container text-text-subtle"}`}>
                    {contagem}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {carregando ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {[1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-surface-bg" />)}
          </div>
        ) : (
          <>
            {aba === "estoque" && (
              <EstoqueTab
                tanques={tanquesFiltrados}
                combustiveis={combustiveis}
                busca={buscaTanque}
                setBusca={setBuscaTanque}
                podeGerenciar={podeGerenciar}
                onBuscaLimpar={() => setBuscaTanque("")}
                onNovo={() => setTanqueDrawer({ aberto: true, item: null })}
                onNovoCombustivel={() => setCombDrawer({ aberto: true, item: null })}
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
                onVer={(e) => setVerEntrada(e)}
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

        {/* Ver detalhes / NF */}
        {verEntrada && <VerEntradaModal entrada={verEntrada} onClose={() => setVerEntrada(null)} />}

        {/* Inativar combustível / fornecedor */}
        <ConfirmarModal
          aberto={!!inativarCombustivel}
          onClose={() => setInativarCombustivel(null)}
          titulo={inativarCombustivel?.ativo ? "Inativar combustível" : "Reativar combustível"}
          descricao={
            inativarCombustivel?.ativo
              ? `Deseja inativar "${inativarCombustivel?.nome.trim()}"? Ele será mantido no histórico, mas não aparecerá em novos cadastros.`
              : `Deseja reativar "${inativarCombustivel?.nome.trim()}"? Ele volta a aparecer nos cadastros e abastecimentos.`
          }
          confirmarLabel={inativarCombustivel?.ativo ? "Inativar" : "Reativar"}
          perigo={!!inativarCombustivel?.ativo}
          onConfirmar={async () => {
            const c = inativarCombustivel!;
            await api.updateCombustivel(c.id, { nome: c.nome, unidade: c.unidade, ativo: !c.ativo });
            toast.success(c.ativo ? "Combustível inativado." : "Combustível reativado.");
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
  combustiveis: Combustivel[];
  busca: string;
  setBusca: (v: string) => void;
  podeGerenciar: boolean;
  onBuscaLimpar: () => void;
  onNovo: () => void;
  onNovoCombustivel: () => void;
  onVer: (t: Tanque) => void;
  onEntrada: (t: Tanque) => void;
  onAjuste: (t: Tanque, positivo: boolean) => void;
  onInventario: (t: Tanque) => void;
  onTransferencia: (t: Tanque) => void;
  onEditar: (t: Tanque) => void;
  onInativar: (t: Tanque) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Busca e filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/50 bg-surface-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-lg flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            value={props.busca}
            onChange={(e) => props.setBusca(e.target.value)}
            placeholder="Buscar por nome do reservatório, código ou combustível…"
            className="input !bg-surface-bg !pl-10 focus:!bg-surface-card"
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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {props.tanques.map((t) => (
            <CardTanque key={t.id} tanque={t} {...props} />
          ))}
        </div>
      )}

      {/* Tipos de combustível homologados */}
      {props.combustiveis.length > 0 && (
        <section className="rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-outline-variant/30 pb-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-body font-bold text-text-title">Tipos de Combustível Homologados</h2>
              <p className="mt-0.5 text-meta text-text-subtle">Catálogo de combustíveis usados pela frota e vínculos com tanques e veículos.</p>
            </div>
            {props.podeGerenciar && (
              <button className="btn btn-secondary btn-sm self-start sm:self-auto" onClick={props.onNovoCombustivel}>
                <Plus size={14} /> Novo tipo
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.combustiveis.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low/60 p-3 transition-colors hover:bg-surface-container-low">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest text-primary"><Fuel size={20} /></span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-semibold text-text-title">{c.nome}</span>
                      <span className="rounded-pill bg-surface-container px-2 py-0.5 text-[11px] text-text-subtle capitalize">{c.unidade}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-text-subtle">
                      <span className="rounded-pill bg-[#EFF6FF] px-2 py-0.5 font-medium text-primary">{c.total_tanques ?? 0} tanque(s)</span>
                      <span>•</span>
                      <span>{c.total_veiculos ?? 0} veículo(s) vinculado(s)</span>
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${c.ativo ? "bg-[#E7F8EC] text-[#106D34]" : "bg-[#F3F4F6] text-text-subtle"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${c.ativo ? "bg-[#106D34]" : "bg-gray-400"}`} /> {c.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Banner de auditoria */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-surface-container-low p-5 shadow-sm md:flex-row">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest text-primary"><ShieldCheck size={22} /></span>
          <div>
            <h4 className="text-body-sm font-semibold text-text-title">Auditoria de Estoque &amp; Controle de Perdas</h4>
            <p className="mt-0.5 max-w-3xl text-meta text-text-subtle">
              Aferições de régua e movimentações de estoque são registradas com trilha de auditoria para conciliação fiscal e prestação de contas.
            </p>
          </div>
        </div>
        <Link href="/relatorios" className="btn btn-secondary btn-sm shrink-0 self-end md:self-auto">
          <FileDown size={15} /> Relatórios fiscais
        </Link>
      </div>
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
  const estoqueMin = Number(t.estoque_minimo);
  const minPct = temCapacidade && estoqueMin > 0 ? Math.min(100, (estoqueMin / capacidade) * 100) : 0;
  const ultima = t.ultima_movimentacao;
  const critico = (pct ?? 100) < 20;

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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${critico ? "bg-[#FFDAD6] text-[#BA1A1A]" : "bg-[#E7F8EC] text-[#106D34]"}`}>
            <Droplets size={26} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/tanques/${t.id}`} className="text-h3 font-bold tracking-tight text-text-title hover:text-primary">{t.nome}</Link>
              <span className="rounded-pill bg-surface-container px-2.5 py-0.5 font-mono text-[11px] uppercase text-text-subtle">
                {t.codigo ? `#${t.codigo}` : "#—"}{t.localizacao ? ` • ${t.localizacao}` : ""}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusTanqueBadge ativo={t.ativo} status={t.status_estoque} estoqueAtual={t.estoque_atual} />
              <span className="inline-flex items-center gap-1 text-meta font-semibold text-[#106D34]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#106D34]" /> {t.ativo ? "Em operação" : "Inativo"}
              </span>
            </div>
          </div>
        </div>
        <MenuAcoes acoes={acoes} />
      </div>

      {/* Tag de combustível */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-low p-2.5">
        <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">{t.combustivel_nome ?? "—"}</span>
        <span className="text-meta text-text-subtle">Unidade: <strong className="text-text-body">{t.combustivel_unidade ?? "L"}</strong></span>
        {ultima && (
          <>
            <span className="text-outline-variant">•</span>
            <span className="text-meta text-text-subtle">Última mov.: <strong className="text-text-body">{rotuloMovimentacao(ultima.tipo, "")}</strong></span>
          </>
        )}
      </div>

      {/* Métrica principal */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-text-title">{Number(t.estoque_atual).toLocaleString("pt-BR")}</span>
          <span className="text-h3 font-medium text-text-subtle">L</span>
        </div>
        <div className="text-right">
          <span className="block text-meta text-text-subtle">Capacidade total</span>
          <span className="text-body font-semibold text-text-title">{temCapacidade ? `${capacidade.toLocaleString("pt-BR")} L` : "—"}</span>
        </div>
      </div>

      {/* Medidor de nível */}
      <div className="mt-3">
        <div className="relative flex h-4 w-full items-center overflow-hidden rounded-pill bg-surface-container-high shadow-inner">
          {minPct > 0 && <div className="absolute bottom-0 top-0 z-10 w-0.5 bg-[#BA1A1A]" style={{ left: `${minPct}%` }} title={`Mínimo: ${estoqueMin.toLocaleString("pt-BR")} L`} />}
          <div className={`h-full rounded-pill transition-all duration-500 ${corStatusTanque(t.status_estoque)}`} style={{ width: `${barra}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-meta text-text-subtle">
          <span className="inline-flex items-center gap-1 font-medium text-[#BA1A1A]">
            <AlertTriangle size={12} /> Mínimo: {estoqueMin > 0 ? `${estoqueMin.toLocaleString("pt-BR")} L` : "—"}
          </span>
          <span className="font-semibold text-text-body">{temCapacidade ? `${(pct ?? 0).toFixed(1)}% do volume útil` : "Capacidade não informada"}</span>
          <span className="font-mono text-text-subtle">{temCapacidade ? `${capacidade.toLocaleString("pt-BR")} L (100%)` : "—"}</span>
        </div>
      </div>

      {/* Rodapé de operações */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/30 pt-3">
        <span className="inline-flex items-center gap-1.5 text-meta text-text-subtle">
          <History size={14} /> {ultima ? `Última movimentação em ${new Date(ultima.created_at).toLocaleDateString("pt-BR")}` : "Sem movimentações"}
        </span>
        <div className="flex items-center gap-1.5">
          <Link href={`/tanques/${t.id}`} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-meta font-semibold text-primary transition-colors hover:bg-surface-container">
            <History size={15} /> Log de medição
          </Link>
          {props.podeGerenciar && (
            <button
              onClick={() => props.onInventario(t)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-meta font-semibold text-white shadow-sm transition-all hover:bg-primary-800 active:scale-95"
            >
              <Ruler size={15} /> Lançar Régua
            </button>
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
  onVer: (e: Entrada) => void;
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
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
            <table className="w-full min-w-[1100px] text-body-sm">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-[#F3F4F6] text-left text-[11px] font-bold uppercase tracking-wider text-text-subtle">
                  <th className="px-4 py-3.5">Data</th>
                  <th className="px-4 py-3.5">Tanque</th>
                  <th className="px-4 py-3.5">Combustível</th>
                  <th className="px-4 py-3.5">Fornecedor</th>
                  <th className="px-4 py-3.5">Litros</th>
                  <th className="px-4 py-3.5">NF</th>
                  <th className="px-4 py-3.5">Valor total</th>
                  <th className="px-4 py-3.5">R$/L</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {entradas.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-[#EFF4FF]/40">
                    <td className="px-4 py-3">{new Date(e.data_entrada + "T12:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3 font-medium text-text-title">{e.tanque_nome ?? "—"}</td>
                    <td className="px-4 py-3">{e.combustivel_nome ?? "—"}</td>
                    <td className="px-4 py-3">{e.fornecedor_nome ?? "—"}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">{Number(e.quantidade_litros).toLocaleString("pt-BR")} L</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        {e.numero_nota ?? "—"}
                        {(e.anexos?.length ?? 0) > 0 && (
                          <span className="rounded-pill bg-[#EFF6FF] px-1.5 py-0.5 text-meta font-medium text-primary">
                            {e.anexos!.length} doc(s)
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{e.valor_total ? `R$ ${Number(e.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{e.valor_por_litro ? `R$ ${Number(e.valor_por_litro).toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${e.cancelada ? "bg-[#FFDAD6] text-[#BA1A1A]" : "bg-[#E7F8EC] text-[#106D34]"}`}>
                        {e.cancelada ? "Cancelada" : "Confirmada"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MenuAcoes
                        acoes={[
                          { key: "ver", label: "Ver detalhes / NF", icon: <Eye size={16} />, onClick: () => props.onVer(e) },
                          ...(props.podeGerenciar && !e.cancelada
                            ? [{ key: "cancelar", label: "Cancelar entrada", icon: <X size={16} />, cor: "danger" as const, onClick: () => props.onCancelar(e) }]
                            : []),
                        ]}
                      />
                    </td>
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
            <div key={c.id} className="flex items-start gap-3 rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm">
              <FotoCombustivel
                src={c.foto_url}
                alt={`Ícone ${c.nome}`}
                className="h-12 w-12 flex-shrink-0 rounded-xl object-cover"
                fallback={<Fuel className="h-6 w-6" />}
              />
              <div className="flex-1">
                <p className="font-medium text-text-title">{c.nome}</p>
                <p className="text-meta text-text-subtle capitalize">{c.unidade}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-pill bg-[#EFF6FF] px-2 py-0.5 text-meta text-primary">{c.total_tanques ?? 0} tanque(s)</span>
                  <span className="rounded-pill bg-surface-bg px-2 py-0.5 text-meta text-text-subtle">{c.total_veiculos ?? 0} veículo(s)</span>
                  <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${c.ativo ? "bg-[#E7F8EC] text-[#106D34]" : "bg-surface-bg text-text-subtle"}`}>
                    {c.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
              {props.podeGerenciar && (
                <MenuAcoes
                  acoes={[
                    { key: "editar", label: "Editar", icon: <Pencil size={16} />, onClick: () => props.onEditar(c) },
                    { key: "inativar", label: c.ativo ? "Inativar" : "Reativar", icon: <X size={16} />, cor: c.ativo ? "danger" : undefined, onClick: () => props.onInativar(c) },
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
