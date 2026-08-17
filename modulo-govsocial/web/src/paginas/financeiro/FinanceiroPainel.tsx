/** Módulo de Gestão Financeira — Repasses, Gastos e Prestação de Contas */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Landmark,
  Plus,
  Receipt,
  X,
} from "lucide-react";
import { servicoFinanceiro } from "@/nucleo/api/financeiro";
import { Botao } from "@/ui/Botao";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { Select } from "@/ui/Select";
import { Skeleton } from "@/ui/Skeleton";
import { Tabela } from "@/ui/Tabela";
import type { Coluna } from "@/ui/Tabela";
import type {
  DashboardFinanceiro,
  GastoOut,
  RepasseListItem,
  ResumoEsfera,
} from "@/tipos/financeiro";

const ESFERA_COR: Record<string, string> = {
  FEDERAL: "#2563eb",
  ESTADUAL: "#16a34a",
  MUNICIPAL: "#d97706",
};

const ESFERA_ROTULO: Record<string, string> = {
  FEDERAL: "Federal",
  ESTADUAL: "Estadual",
  MUNICIPAL: "Municipal",
};

const CATEGORIA_ROTULO: Record<string, string> = {
  BENEFICIO: "Benefício",
  PESSOAL: "Pessoal",
  MATERIAL: "Material",
  SERVICO: "Serviço",
  OUTROS: "Outros",
};

function fmtMoeda(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(d: string | null): string {
  if (!d) return "-";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

function fmtPct(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return "0%";
  return n.toFixed(1) + "%";
}

const ESFERA_OPCOES = [
  { valor: "FEDERAL", rotulo: "Federal" },
  { valor: "ESTADUAL", rotulo: "Estadual" },
  { valor: "MUNICIPAL", rotulo: "Municipal" },
];

const CATEGORIA_OPCOES = [
  { valor: "BENEFICIO", rotulo: "Benefício" },
  { valor: "PESSOAL", rotulo: "Pessoal" },
  { valor: "MATERIAL", rotulo: "Material" },
  { valor: "SERVICO", rotulo: "Serviço" },
  { valor: "OUTROS", rotulo: "Outros" },
];

function GraficoPizza({ porEsfera }: { porEsfera: ResumoEsfera[] }) {
  if (!porEsfera.length) return null;

  const total = porEsfera.reduce((s, e) => s + parseFloat(e.total_repasse), 0);
  if (total === 0) return null;

  const cx = 60, cy = 60, r = 52;
  let acum = 0;
  const fatias = porEsfera.map((e) => {
    const pct = parseFloat(e.total_repasse) / total;
    const inicio = acum;
    acum += pct;
    const fim = acum;
    const a0 = inicio * Math.PI * 2 - Math.PI / 2;
    const a1 = fim * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(a0);
    const y1 = cy + r * Math.sin(a0);
    const x2 = cx + r * Math.cos(a1);
    const y2 = cy + r * Math.sin(a1);
    const grande = pct > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2} Z`;
    return { d, fill: ESFERA_COR[e.esfera] ?? "#94a3b8", nome: ESFERA_ROTULO[e.esfera] ?? e.esfera, pct: (pct * 100).toFixed(1) };
  });

  return (
    <div className="flex flex-col items-center gap-3 rounded-cartao border border-ink-soft/15 bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Distribuição por Esfera</h3>
      <svg viewBox="0 0 120 120" className="h-32 w-32">
        {fatias.map((f, i) => (
          <path key={i} d={f.d} fill={f.fill} stroke="#fff" strokeWidth="1" />
        ))}
      </svg>
      <div className="flex flex-wrap justify-center gap-3 text-xs">
        {fatias.map((f, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: f.fill }} />
            <span>{f.nome} ({f.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FinanceiroPainel() {
  const [dashboard, setDashboard] = useState<DashboardFinanceiro | null>(null);
  const [repasses, setRepasses] = useState<RepasseListItem[]>([]);
  const [gastos, setGastos] = useState<GastoOut[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [repasseSelecionado, setRepasseSelecionado] = useState<string | null>(null);
  const [gastosCarregando, setGastosCarregando] = useState(false);

  const [modalRepasseAberto, setModalRepasseAberto] = useState(false);
  const [modalGastoAberto, setModalGastoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [formRepasse, setFormRepasse] = useState({
    esfera: "FEDERAL",
    programa: "",
    valor_total: "",
    data_repasse: new Date().toISOString().slice(0, 10),
    data_vigencia_inicio: new Date().toISOString().slice(0, 10),
    data_vigencia_fim: "",
    observacoes: "",
  });

  const [formGasto, setFormGasto] = useState({
    categoria: "BENEFICIO",
    descricao: "",
    valor: "",
    data_gasto: new Date().toISOString().slice(0, 10),
    comprovante_url: "",
  });

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const [dashRes, repRes] = await Promise.allSettled([
      servicoFinanceiro.dashboard(),
      servicoFinanceiro.listarRepasses({ limit: 50 }),
    ]);
    if (dashRes.status === "fulfilled") setDashboard(dashRes.value);
    else setErro("Erro ao carregar dashboard");

    if (repRes.status === "fulfilled") setRepasses(repRes.value);
    else if (!erro) setErro("Erro ao carregar repasses");

    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const carregarGastos = useCallback(async (repasseId: string) => {
    setGastosCarregando(true);
    setRepasseSelecionado(repasseId);
    const data = await servicoFinanceiro.listarGastos(repasseId, { limit: 100 });
    setGastos(data);
    setGastosCarregando(false);
  }, []);

  const aoCriarRepasse = async () => {
    setSalvando(true);
    await servicoFinanceiro.criarRepasse({
      esfera: formRepasse.esfera,
      programa: formRepasse.programa,
      valor_total: parseFloat(formRepasse.valor_total) || 0,
      data_repasse: formRepasse.data_repasse,
      data_vigencia_inicio: formRepasse.data_vigencia_inicio,
      data_vigencia_fim: formRepasse.data_vigencia_fim || null,
      observacoes: formRepasse.observacoes || null,
    });
    setSalvando(false);
    setModalRepasseAberto(false);
    setFormRepasse({ esfera: "FEDERAL", programa: "", valor_total: "", data_repasse: new Date().toISOString().slice(0, 10), data_vigencia_inicio: new Date().toISOString().slice(0, 10), data_vigencia_fim: "", observacoes: "" });
    await carregarDados();
  };

  const aoCriarGasto = async () => {
    if (!repasseSelecionado) return;
    setSalvando(true);
    await servicoFinanceiro.criarGasto(repasseSelecionado, {
      categoria: formGasto.categoria,
      descricao: formGasto.descricao,
      valor: parseFloat(formGasto.valor) || 0,
      data_gasto: formGasto.data_gasto,
      comprovante_url: formGasto.comprovante_url || null,
    });
    setSalvando(false);
    setModalGastoAberto(false);
    setFormGasto({ categoria: "BENEFICIO", descricao: "", valor: "", data_gasto: new Date().toISOString().slice(0, 10), comprovante_url: "" });
    await carregarGastos(repasseSelecionado);
    await carregarDados();
  };

  const aoEncerrar = async (id: string) => {
    await servicoFinanceiro.encerrarRepasse(id);
    await carregarDados();
  };

  const aoExcluirGasto = async (gastoId: string) => {
    if (!repasseSelecionado) return;
    await servicoFinanceiro.excluirGasto(repasseSelecionado, gastoId);
    await carregarGastos(repasseSelecionado);
    await carregarDados();
  };

  const colunasRepasse: Coluna<RepasseListItem>[] = useMemo(() => [
    { chave: "programa", titulo: "Programa", ordenavel: true },
    { chave: "esfera", titulo: "Esfera", ordenavel: true, render: (r) => <EsferaTag esfera={r.esfera} /> },
    { chave: "valor_total", titulo: "Valor Total", alinhamento: "direita", ordemvel: true, render: (r) => fmtMoeda(r.valor_total) },
    { chave: "valor_utilizado", titulo: "Utilizado", alinhamento: "direita", ordenavel: true, render: (r) => fmtMoeda(r.valor_utilizado) },
    { chave: "data_vigencia_fim", titulo: "Vigência", ordenavel: true, render: (r) => fmtData(r.data_vigencia_fim) },
    { chave: "status", titulo: "Status", ordenavel: true, render: (r) => <StatusTag status={r.status} /> },
    { chave: "acoes", titulo: "Ações", alinhamento: "centro", render: (r) => (
      <div className="flex items-center justify-center gap-1">
        {r.status === "ATIVO" && (
          <Botao variante="primario" tamanho="sm" onClick={(e) => { e.stopPropagation(); setModalGastoAberto(true); setRepasseSelecionado(r.id); }}>
            <Plus className="h-3 w-3" /> Gasto
          </Botao>
        )}
        <Botao variante="secundario" tamanho="sm" onClick={(e) => { e.stopPropagation(); carregarGastos(r.id); }}>
          <Receipt className="h-3 w-3" /> Ver
        </Botao>
        {r.status === "ATIVO" && (
          <Botao variante="perigo" tamanho="sm" onClick={(e) => { e.stopPropagation(); aoEncerrar(r.id); }}>
            <X className="h-3 w-3" /> Encerrar
          </Botao>
        )}
      </div>
    )},
  ], []);

  const colunasGasto: Coluna<GastoOut>[] = useMemo(() => [
    { chave: "data_gasto", titulo: "Data", ordenavel: true, render: (g) => fmtData(g.data_gasto) },
    { chave: "categoria", titulo: "Categoria", ordenavel: true, render: (g) => CATEGORIA_ROTULO[g.categoria] ?? g.categoria },
    { chave: "descricao", titulo: "Descrição", ordenavel: true },
    { chave: "valor", titulo: "Valor", alinhamento: "direita", ordenavel: true, render: (g) => fmtMoeda(g.valor) },
    { chave: "acoes", titulo: "", alinhamento: "centro", render: (g) => (
      <Botao variante="perigo" tamanho="sm" onClick={() => aoExcluirGasto(g.id)}>
        <X className="h-3 w-3" />
      </Botao>
    )},
  ], [repasseSelecionado]);

  if (carregando) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><Banknote className="w-5 h-5" /> Gestão Financeira</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variante="cartao" />)}
        </div>
        <Skeleton variante="tabela" linhas={5} />
      </div>
    );
  }

  if (erro && !dashboard && !repasses.length) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><Banknote className="w-5 h-5" /> Gestão Financeira</h2>
        <EstadoErro aoTentarNovamente={carregarDados} />
      </div>
    );
  }

  const temRepasseSel = repasses.find(r => r.id === repasseSelecionado);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Banknote className="w-5 h-5" /> Gestão Financeira
        </h2>
        <Botao variante="primario" iconeInicio={<Plus className="h-4 w-4" />} onClick={() => setModalRepasseAberto(true)}>
          Novo Repasse
        </Botao>
      </div>

      {/* Cards de Resumo */}
      {dashboard && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dashboard.por_esfera.map((e) => (
            <div key={e.esfera} className="rounded-cartao border border-ink-soft/15 bg-surface p-4 shadow-um">
              <div className="flex items-center gap-2 text-sm text-ink-soft">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: ESFERA_COR[e.esfera] }} />
                {ESFERA_ROTULO[e.esfera] ?? e.esfera}
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">{fmtMoeda(e.total_repasse)}</div>
              <div className="mt-1 text-xs text-ink-soft">
                Utilizado: {fmtMoeda(e.total_utilizado)} ({fmtPct(e.percentual_utilizado)})
              </div>
              <div className="mt-1 text-xs font-semibold text-primary">Saldo: {fmtMoeda(e.saldo)}</div>
            </div>
          ))}
          <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4 shadow-um">
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <Landmark className="h-4 w-4" /> Saldo Disponível
            </div>
            <div className="mt-2 text-2xl font-bold text-ink">{fmtMoeda(dashboard.saldo_disponivel)}</div>
            <div className="mt-1 text-xs text-ink-soft">
              Total: {fmtMoeda(dashboard.total_repasse)} | Gasto: {fmtMoeda(dashboard.total_gasto)}
            </div>
            <div className="mt-1 text-xs font-semibold text-primary">
              {fmtPct(dashboard.percentual_utilizado_geral)} utilizado
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gráfico de Pizza */}
        <div className="lg:col-span-1">
          {dashboard?.por_esfera && <GraficoPizza porEsfera={dashboard.por_esfera} />}
        </div>

        {/* Tabela de Repasses */}
        <div className="lg:col-span-2">
          {repasses.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum repasse"
              descricao="Cadastre repasses financeiros para começar a gestão."
              acao={{ rotulo: "Novo Repasse", aoClicar: () => setModalRepasseAberto(true) }}
            />
          ) : (
            <Tabela
              colunas={colunasRepasse}
              dados={repasses}
              chaveLinha={(r) => r.id}
              caption="Repasses financeiros"
            />
          )}
        </div>
      </div>

      {/* Gastos do repasse selecionado */}
      {temRepasseSel && (
        <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Gastos: {temRepasseSel.programa}
              </h3>
              <p className="text-xs text-ink-soft">
                {ESFERA_ROTULO[temRepasseSel.esfera] ?? temRepasseSel.esfera} &middot; Total: {fmtMoeda(temRepasseSel.valor_total)} &middot; Utilizado: {fmtMoeda(temRepasseSel.valor_utilizado)}
              </p>
            </div>
            <div className="flex gap-2">
              {temRepasseSel?.status === "ATIVO" && (
                <Botao variante="primario" tamanho="sm" iconeInicio={<Plus className="h-3 w-3" />} onClick={() => setModalGastoAberto(true)}>
                  Adicionar Gasto
                </Botao>
              )}
              <Botao variante="texto" tamanho="sm" onClick={() => { setRepasseSelecionado(null); setGastos([]); }}>
                <X className="h-3 w-3" />
              </Botao>
            </div>
          </div>

          {gastosCarregando ? (
            <Skeleton variante="tabela" linhas={3} />
          ) : gastos.length === 0 ? (
            <EstadoVazio titulo="Nenhum gasto" descricao="Este repasse ainda não possui gastos registrados." />
          ) : (
            <Tabela
              colunas={colunasGasto}
              dados={gastos}
              chaveLinha={(g) => g.id}
              caption="Gastos do repasse"
            />
          )}
        </div>
      )}

      {/* Modal Criar Repasse */}
      <Modal aberto={modalRepasseAberto} aoFechar={() => setModalRepasseAberto(false)} titulo="Novo Repasse Financeiro" tamanho="lg">
        <div className="space-y-3">
          <Select label="Esfera" opcoes={ESFERA_OPCOES} value={formRepasse.esfera} onChange={(e) => setFormRepasse(p => ({ ...p, esfera: e.target.value }))} />
          <Input label="Programa / Convênio" placeholder="Ex: Piso Mineiro Fixo" value={formRepasse.programa} onChange={(e) => setFormRepasse(p => ({ ...p, programa: e.target.value }))} />
          <Input label="Valor Total (R$)" type="number" step="0.01" min="0" value={formRepasse.valor_total} onChange={(e) => setFormRepasse(p => ({ ...p, valor_total: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data do Repasse" type="date" value={formRepasse.data_repasse} onChange={(e) => setFormRepasse(p => ({ ...p, data_repasse: e.target.value }))} />
            <Input label="Início Vigência" type="date" value={formRepasse.data_vigencia_inicio} onChange={(e) => setFormRepasse(p => ({ ...p, data_vigencia_inicio: e.target.value }))} />
          </div>
          <Input label="Fim Vigência" type="date" value={formRepasse.data_vigencia_fim} onChange={(e) => setFormRepasse(p => ({ ...p, data_vigencia_fim: e.target.value }))} />
          <Input label="Observações" value={formRepasse.observacoes} onChange={(e) => setFormRepasse(p => ({ ...p, observacoes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Botao variante="secundario" onClick={() => setModalRepasseAberto(false)}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} onClick={aoCriarRepasse}>Salvar</Botao>
        </div>
      </Modal>

      {/* Modal Adicionar Gasto */}
      <Modal aberto={modalGastoAberto} aoFechar={() => setModalGastoAberto(false)} titulo="Registrar Gasto" tamanho="md">
        <div className="space-y-3">
          <Select label="Categoria" opcoes={CATEGORIA_OPCOES} value={formGasto.categoria} onChange={(e) => setFormGasto(p => ({ ...p, categoria: e.target.value }))} />
          <Input label="Descrição" placeholder="Ex: Compra de cestas básicas" value={formGasto.descricao} onChange={(e) => setFormGasto(p => ({ ...p, descricao: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valor (R$)" type="number" step="0.01" min="0.01" value={formGasto.valor} onChange={(e) => setFormGasto(p => ({ ...p, valor: e.target.value }))} />
            <Input label="Data do Gasto" type="date" value={formGasto.data_gasto} onChange={(e) => setFormGasto(p => ({ ...p, data_gasto: e.target.value }))} />
          </div>
          <Input label="Comprovante (URL)" placeholder="https://..." value={formGasto.comprovante_url} onChange={(e) => setFormGasto(p => ({ ...p, comprovante_url: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Botao variante="secundario" onClick={() => setModalGastoAberto(false)}>Cancelar</Botao>
          <Botao variante="primario" carregando={salvando} onClick={aoCriarGasto}>Salvar</Botao>
        </div>
      </Modal>
    </div>
  );
}

function EsferaTag({ esfera }: { esfera: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ background: ESFERA_COR[esfera] ?? "#94a3b8" }}
    >
      {ESFERA_ROTULO[esfera] ?? esfera}
    </span>
  );
}

function StatusTag({ status }: { status: string }) {
  const cor = status === "ATIVO" ? "bg-green-100 text-green-800" : status === "ENCERRADO" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700";
  const rotulo = status === "ATIVO" ? "Ativo" : status === "ENCERRADO" ? "Encerrado" : "Cancelado";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>
      {rotulo}
    </span>
  );
}
