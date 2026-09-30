"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Droplets,
  Eye,
  FileDown,
  FileText,
  Fuel,
  History,
  Info,
  Link2,
  PackagePlus,
  Pencil,
  Plus,
  Repeat,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { api, Combustivel, Entrada, Fornecedor, ManifestoEntrada, Tanque } from "@/lib/api";
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
import { IgnorarManifestoModal, VincularManifestoModal } from "@/components/tanque/ManifestoModals";
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
  const [filtroEntradas, setFiltroEntradas] = useState({ busca: "", tipo: "", tanque_id: "", periodo: "tudo" });

  // Manifestos de entrada (NF-e pendentes de vinculação)
  const [manifestos, setManifestos] = useState<ManifestoEntrada[]>([]);
  const [vincularManifesto, setVincularManifesto] = useState<ManifestoEntrada | null>(null);
  const [ignorarManifesto, setIgnorarManifesto] = useState<ManifestoEntrada | null>(null);
  const importarInputRef = useRef<HTMLInputElement>(null);

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
      if (filtroEntradas.busca) params.busca = filtroEntradas.busca;
      if (filtroEntradas.tipo === "confirmada") params.cancelada = false;
      if (filtroEntradas.tipo === "cancelada") params.cancelada = true;
      if (filtroEntradas.tanque_id) params.tanque_id = filtroEntradas.tanque_id;
      const hoje = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      if (filtroEntradas.periodo === "hoje") {
        params.data_inicio = iso(hoje);
        params.data_fim = iso(hoje);
      } else if (filtroEntradas.periodo === "mes") {
        params.data_inicio = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
        params.data_fim = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
      }
      const r = await api.listEntradas(params);
      setEntradas(r.itens);
      setTotalEntradas(r.total);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [entradasSkip, entradasLimit, filtroEntradas]);

  const carregarManifestos = useCallback(async () => {
    try {
      const r = await api.listManifestos({ status: "PENDENTE", skip: 0, limit: 20 });
      setManifestos(r.itens);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    carregarBase().finally(() => setCarregando(false));
  }, [carregarBase]);

  useEffect(() => {
    carregarEntradas();
  }, [carregarEntradas]);

  useEffect(() => {
    carregarManifestos();
  }, [carregarManifestos]);

  const recarregar = () => {
    carregarBase();
    carregarEntradas();
    carregarManifestos();
  };

  const importarNfe = async (file: File) => {
    try {
      const up = await api.upload(file);
      const manifesto = await api.importarManifesto(up.id);
      toast.success(`NF-e ${manifesto.numero ?? ""} detectada e aguardando vínculo.`.trim());
      setAba("entradas");
      recarregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
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
                tanques={tanques}
                manifestos={manifestos}
                podeGerenciar={podeGerenciar}
                onNovo={() => setEntradaDrawer({ aberto: true })}
                onImportar={() => importarInputRef.current?.click()}
                onCancelar={(e) => setCancelarEntrada(e)}
                onVer={(e) => setVerEntrada(e)}
                onVincular={(m) => setVincularManifesto(m)}
                onIgnorar={(m) => setIgnorarManifesto(m)}
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
                onVerMovimentacao={(c) => { setBuscaTanque(c.nome); setAba("estoque"); }}
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

        {/* Manifestos pendentes */}
        <VincularManifestoModal
          manifesto={vincularManifesto}
          tanques={tanques}
          onClose={() => setVincularManifesto(null)}
          onConcluido={recarregar}
        />
        <IgnorarManifestoModal
          manifesto={ignorarManifesto}
          onClose={() => setIgnorarManifesto(null)}
          onConcluido={recarregar}
        />

        {/* Importação de XML NF-e (compartilhada) */}
        <input
          ref={importarInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importarNfe(file);
            e.target.value = "";
          }}
        />

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
  filtro: { busca: string; tipo: string; tanque_id: string; periodo: string };
  setFiltro: (f: { busca: string; tipo: string; tanque_id: string; periodo: string }) => void;
  setSkip: (n: number) => void;
  setLimit: (n: number) => void;
  tanques: Tanque[];
  manifestos: ManifestoEntrada[];
  podeGerenciar: boolean;
  onNovo: () => void;
  onImportar: () => void;
  onCancelar: (e: Entrada) => void;
  onVer: (e: Entrada) => void;
  onVincular: (m: ManifestoEntrada) => void;
  onIgnorar: (m: ManifestoEntrada) => void;
}) {
  const { entradas, total, skip, limit, setSkip, setLimit } = props;
  const paginas = Math.ceil(total / limit);
  const setFiltro = (parcial: Partial<typeof props.filtro>) => {
    props.setFiltro({ ...props.filtro, ...parcial });
    props.setSkip(0);
  };
  const litrosFmt = (v: number | string) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const periodos: { k: string; label: string }[] = [
    { k: "tudo", label: "Tudo" },
    { k: "hoje", label: "Hoje" },
    { k: "mes", label: "Mês Atual" },
  ];

  return (
    <div className="space-y-6">
      {/* Barra de filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/50 bg-surface-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
            <input
              value={props.filtro.busca}
              onChange={(e) => setFiltro({ busca: e.target.value })}
              placeholder="Buscar por NF-e, fornecedor, tanque…"
              className="input pl-9"
            />
          </div>
          <select
            value={props.filtro.tipo}
            onChange={(e) => setFiltro({ tipo: e.target.value })}
            className="input w-auto"
          >
            <option value="">Todas as entradas</option>
            <option value="confirmada">Confirmadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
          <select
            value={props.filtro.tanque_id}
            onChange={(e) => setFiltro({ tanque_id: e.target.value })}
            className="input w-auto max-w-[220px]"
          >
            <option value="">Todos os tanques</option>
            {props.tanques.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo ? `#${t.codigo} - ` : ""}{t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-lg border border-outline-variant/60 bg-surface-container-low p-1 text-meta font-medium text-text-subtle sm:inline-flex">
            {periodos.map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => setFiltro({ periodo: p.k })}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  props.filtro.periodo === p.k ? "bg-surface-card font-semibold text-text-title shadow-sm" : "hover:text-text-title"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {props.podeGerenciar && (
            <button className="btn btn-primary" onClick={props.onNovo}>
              <Plus size={16} /> Nova entrada
            </button>
          )}
        </div>
      </div>

      {/* Lista / estado vazio */}
      {entradas.length === 0 ? (
        <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card p-8 text-center shadow-sm sm:p-14">
          <div className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-[#EFF6FF]/60 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-surface-container/50 blur-2xl" />
          <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] text-primary shadow-sm">
            <PackagePlus size={30} />
            <span className="absolute -right-1 -top-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
              <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">+</span>
            </span>
          </div>
          <h2 className="text-h2 tracking-tight text-text-title">Nenhuma entrada registrada</h2>
          <p className="mt-2 max-w-lg text-body-sm text-text-subtle">
            Registre uma compra ou recebimento de combustível para creditar o estoque de um tanque municipal ou importe uma NF-e diretamente da SEFAZ.
          </p>
          {props.podeGerenciar && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button className="btn btn-primary" onClick={props.onNovo}>
                <Plus size={16} /> Nova entrada
              </button>
              <button className="btn btn-secondary" onClick={props.onImportar}>
                <Upload size={15} /> Importar NF-e (XML)
              </button>
            </div>
          )}
        </section>
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
                    <td className="px-4 py-3 font-medium tabular-nums">{litrosFmt(e.quantidade_litros)} L</td>
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

      {/* Fluxo operacional + manifestos pendentes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-outline-variant/50 bg-surface-card p-6 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center justify-between border-b border-outline-variant/30 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-primary">
                <ClipboardList size={16} />
              </span>
              <div>
                <h3 className="text-body-sm font-bold text-text-title">Fluxo Operacional de Recebimento ANP</h3>
                <p className="text-meta text-text-subtle">Etapas normativas obrigatórias para descarga em reservatórios públicos</p>
              </div>
            </div>
            <span className="hidden rounded bg-surface-container px-2.5 py-1 text-meta font-semibold text-text-subtle sm:inline">Manual GovFrota</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { n: 1, tag: "Pátio / Descarga", titulo: "Aferição de Régua & Termodensímetro", texto: "Medir o volume pré-descarga com a régua padrão e testar densidade/temperatura da amostra na boca do caminhão.", cta: "Lançar Régua Física", cls: "text-slate-400" },
              { n: 2, tag: "Conformidade SEFAZ", titulo: "Conferência de NF-e e Manifesto", texto: "Validar a chave de 44 dígitos com a distribuidora homologada e autorizar o manifesto de entrega.", cta: "Sincronizar SEFAZ", cls: "text-slate-400" },
              { n: 3, tag: "Crédito Real", titulo: "Atualização do LMC & Estoque", texto: "Crédito automático do combustível no volume útil do tanque e registro contábil auditável pelo TCE/ANP.", cta: "Livro Digital LMC", cls: "text-[#106D34]" },
            ].map((s, idx) => (
              <div key={s.n} className={`flex flex-col justify-between rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-4 transition-colors hover:border-[#BFDBFE] hover:bg-surface-card ${idx < 2 ? "md:border-r" : ""}`}>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{s.n}</span>
                    <span className={`text-[11px] font-semibold ${s.cls}`}>{s.tag}</span>
                  </div>
                  <h4 className="mb-1 text-meta font-bold text-text-title">{s.titulo}</h4>
                  <p className="text-meta leading-relaxed text-text-subtle">{s.texto}</p>
                </div>
                <div className="mt-3 flex items-center gap-1 border-t border-outline-variant/30 pt-2 text-[11px] font-semibold text-primary">
                  <span>{s.cta}</span>
                  <span>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/50 bg-surface-card p-6 shadow-sm">
          <div>
            <div className="mb-4 flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="flex items-center gap-2 text-body-sm font-bold text-text-title">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                Manifestos Pendentes
              </h3>
              <span className="rounded border border-[#FFDD9A] bg-[#FFF4D6] px-2 py-0.5 text-meta font-semibold text-[#805600]">
                {props.manifestos.length} nota(s)
              </span>
            </div>
            {props.manifestos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-outline-variant/60 bg-surface-bg p-4 text-center text-meta text-text-subtle">
                Nenhuma NF-e aguardando vinculação. Importe um XML para detectar notas emitidas contra o CNPJ do órgão.
              </div>
            ) : (
              <div className="space-y-3">
                {props.manifestos.map((m) => (
                  <div key={m.id} className="space-y-2.5 rounded-xl border border-outline-variant/50 bg-surface-bg p-3.5">
                    <div className="flex items-center justify-between gap-2 text-meta">
                      <span className="truncate font-bold text-text-title">
                        NF-e {m.numero ?? "—"}{m.emitente_nome ? ` • ${m.emitente_nome}` : ""}
                      </span>
                      <span className="shrink-0 text-text-subtle">
                        {new Date(m.data_emissao ?? m.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div className="flex justify-between text-meta text-text-body">
                      <span className="truncate">Item: <strong>{m.descricao_item ?? m.combustivel_nome ?? "—"}</strong></span>
                      <span className="shrink-0 font-semibold text-text-title">
                        {m.quantidade_litros ? `${litrosFmt(m.quantidade_litros)} L` : "a medir"}
                      </span>
                    </div>
                    {m.chave_nfe && <div className="truncate text-[11px] text-text-subtle">Chave: {m.chave_nfe}</div>}
                    {props.podeGerenciar && (
                      <div className="flex items-center gap-2 pt-1">
                        <button className="btn btn-primary btn-sm flex-1" onClick={() => props.onVincular(m)}>
                          <Link2 size={14} /> Vincular e registrar
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => props.onIgnorar(m)}>
                          Ignorar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex items-start gap-2.5 border-t border-outline-variant/30 pt-3 text-meta text-text-subtle">
            <Info size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>As notas faturadas contra o CNPJ da prefeitura são detectadas na importação do XML e ficam pendentes até o vínculo com o tanque.</span>
          </div>
        </div>
      </div>

      {/* Banner de conformidade */}
      <section className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF]/60 p-4 shadow-sm sm:p-5 md:flex-row">
        <div className="flex items-start gap-3.5 sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h4 className="text-body-sm font-bold text-text-title">Auditoria de Entradas &amp; Cruzamento SEFAZ / ANP</h4>
            <p className="text-meta leading-relaxed text-text-body">
              Todas as entradas em tanques próprios exigem vinculação de chave de NF-e e medição de densidade/temperatura conforme a Resolução ANP vigente.
            </p>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2.5 md:w-auto">
          <button className="btn btn-secondary btn-sm" onClick={props.onImportar} type="button">
            <Upload size={14} /> Importar XML NF-e
          </button>
          <Link href="/relatorios" className="btn btn-sm bg-[#DBEAFE] text-primary hover:bg-[#BFDBFE]">
            Histórico de Entradas
          </Link>
        </div>
      </section>
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
  onVerMovimentacao: (c: Combustivel) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Barra de ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            value={props.busca}
            onChange={(e) => props.setBusca(e.target.value)}
            placeholder="Buscar por nome, código ANP…"
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-card px-3 py-2 text-meta font-medium text-text-subtle shadow-sm md:flex">
            <span className="text-text-subtle">Situação:</span>
            <span className="font-semibold text-text-title">Todos</span>
          </div>
          {props.podeGerenciar && (
            <button className="btn btn-primary" onClick={props.onNovo}>
              <Plus size={16} /> Novo tipo de combustível
            </button>
          )}
        </div>
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {props.combustiveis.map((c) => (
            <CombustivelCard
              key={c.id}
              combustivel={c}
              podeGerenciar={props.podeGerenciar}
              onEditar={props.onEditar}
              onInativar={props.onInativar}
              onVerMovimentacao={props.onVerMovimentacao}
            />
          ))}
        </div>
      )}

      {/* Conformidade ANP / TCE */}
      <section className="rounded-2xl border border-outline-variant/50 bg-surface-card p-6 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#FFDD9A] bg-[#FFF4D6] text-[#805600]">
              <ShieldCheck size={24} />
            </span>
            <div>
              <h4 className="text-body font-bold leading-tight text-text-title">Classificação de Derivados e Biocombustíveis • Padrão ANP</h4>
              <p className="mt-1 max-w-2xl text-body-sm leading-relaxed text-text-subtle">
                Os combustíveis listados são conferidos conforme a tabela oficial da Agência Nacional do Petróleo (ANP) e as diretrizes do Tribunal de Contas do Estado (TCE) para controle de perdas, evaporação e consumo público (Lei 14.133/21).
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
            <button className="btn btn-secondary btn-sm" type="button">
              <Repeat size={15} /> Sincronizar ANP
            </button>
            <Link href="/relatorios" className="btn btn-sm bg-[#DBEAFE] text-primary hover:bg-[#BFDBFE]">
              <FileText size={15} /> Relatório de Homologação
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function CombustivelCard(props: {
  combustivel: Combustivel;
  podeGerenciar: boolean;
  onEditar: (c: Combustivel) => void;
  onInativar: (c: Combustivel) => void;
  onVerMovimentacao: (c: Combustivel) => void;
}) {
  const c = props.combustivel;
  const preco = c.preco_referencia;
  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm transition-all hover:border-[#BFDBFE] hover:shadow-md">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <FotoCombustivel
              src={c.foto_url}
              alt={`Ícone ${c.nome}`}
              className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#BFDBFE] object-cover"
              fallback={
                <span className="flex h-full w-full items-center justify-center rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] text-primary">
                  <Fuel size={24} />
                </span>
              }
            />
            <div>
              <h3 className="text-body font-bold leading-snug tracking-tight text-text-title transition-colors group-hover:text-primary">
                {c.nome}
              </h3>
              <p className="mt-0.5 text-meta font-medium capitalize text-text-subtle">{c.unidade}</p>
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

        {/* Vínculos e status */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => props.onVerMovimentacao(c)}
            title="Ver tanques deste combustível"
            className="inline-flex items-center rounded-pill border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-1 text-meta font-semibold text-primary transition-colors hover:bg-[#DBEAFE]"
          >
            {c.total_tanques ?? 0} tanque(s)
          </button>
          <span className="inline-flex items-center rounded-pill border border-outline-variant/60 bg-surface-container-low px-2.5 py-1 text-meta font-medium text-text-subtle">
            {c.total_veiculos ?? 0} veículo(s)
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta font-semibold ${c.ativo ? "border-[#9DF6B3] bg-[#E7F8EC] text-[#106D34]" : "border-outline-variant/60 bg-surface-bg text-text-subtle"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${c.ativo ? "bg-[#106D34]" : "bg-gray-400"}`} />
            {c.ativo ? "Ativo" : "Inativo"}
          </span>
        </div>

        {/* Metadados ANP */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/30 pt-3 text-meta">
          <div>
            <span className="block text-[11px] text-text-subtle">Código ANP</span>
            <span className="block truncate font-mono font-medium text-text-body">{c.codigo_anp || "—"}</span>
          </div>
          <div>
            <span className="block text-[11px] text-text-subtle">Especificação</span>
            <span className="block truncate font-medium text-text-body">{c.especificacao || "—"}</span>
          </div>
        </div>
      </div>

      {/* Rodapé: preço de referência + ação */}
      <div className="mt-4 flex items-center justify-between border-t border-outline-variant/30 pt-3 text-meta text-text-subtle">
        <span>
          Ref. Ata:{" "}
          <strong className="font-semibold text-text-title">
            {preco != null ? `R$ ${Number(preco).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/L` : "—"}
          </strong>
        </span>
        <button
          type="button"
          onClick={() => props.onVerMovimentacao(c)}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          Ver movimentação →
        </button>
      </div>
    </article>
  );
}
