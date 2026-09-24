"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ChevronLeft, ChevronRight,
  Droplets, Fuel, Pencil, Repeat, Scale, SlidersHorizontal, X,
} from "lucide-react";
import { api, Combustivel, Fornecedor, Movimentacao, ResumoTanque, Tanque } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequirePermission } from "@/components/RequirePermission";
import { MenuAcoes } from "@/components/veiculo/MenuAcoes";
import { StatusTanqueBadge } from "@/components/tanque/StatusTanqueBadge";
import { FotoCombustivel } from "@/components/tanque/FotoCombustivel";
import { TanqueFormDrawer } from "@/components/tanque/TanqueFormDrawer";
import { EntradaFormDrawer } from "@/components/tanque/EntradaFormDrawer";
import { AjusteModal, InventarioModal, TransferenciaModal } from "@/components/tanque/AcoesModals";
import { ConfirmarModal } from "@/components/tanque/Drawer";
import { corStatusTanque, rotuloMovimentacao } from "@/lib/combustiveis";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

export default function PaginaTanque() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerenciar = hasPermission("fuel.manage");

  const [tanque, setTanque] = useState<Tanque | null>(null);
  const [resumo, setResumo] = useState<ResumoTanque | null>(null);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [todosTanques, setTodosTanques] = useState<Tanque[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [totalMovs, setTotalMovs] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(50);
  const [periodo, setPeriodo] = useState(30);
  const [evolucao, setEvolucao] = useState<{ data: string; saldo: number }[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Ações
  const [drawer, setDrawer] = useState(false);
  const [entradaDrawer, setEntradaDrawer] = useState(false);
  const [acao, setAcao] = useState<"ajuste" | "inventario" | "transferencia" | "inativar" | null>(null);
  const [positivo, setPositivo] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const [tq, rs, cs, ts, fs] = await Promise.all([
        api.getTanque(id),
        api.resumoTanque(id),
        api.listCombustiveis(),
        api.listTanques(),
        api.listFornecedores({ skip: 0, limit: 200 }),
      ]);
      setTanque(tq);
      setResumo(rs);
      setCombustiveis(cs);
      setTodosTanques(ts);
      setFornecedores(fs.itens);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  const carregarMovs = useCallback(async () => {
    try {
      const r = await api.movimentacoesTanque(id, { skip, limit });
      setMovs(r.itens);
      setTotalMovs(r.total);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id, skip, limit]);

  const carregarEvolucao = useCallback(async () => {
    try {
      const r = await api.evolucaoTanque(id, periodo);
      setEvolucao(r.pontos);
    } catch {
      setEvolucao([]);
    }
  }, [id, periodo]);

  useEffect(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]);

  useEffect(() => {
    carregarMovs();
  }, [carregarMovs]);

  useEffect(() => {
    carregarEvolucao();
  }, [carregarEvolucao]);

  const recarregar = () => {
    carregar();
    carregarMovs();
  };

  if (carregando || !tanque) {
    return <div className="space-y-4"><div className="h-40 animate-pulse rounded-card bg-surface-bg" /><div className="h-40 animate-pulse rounded-card bg-surface-bg" /></div>;
  }

  const capacidade = Number(tanque.capacidade_maxima);
  const temCapacidade = capacidade > 0;
  const pct = tanque.percentual_disponivel;
  const paginas = Math.ceil(totalMovs / limit);
  const pagina = Math.floor(skip / limit) + 1;

  const indicadores = [
    { rotulo: "Estoque atual", valor: `${Number(tanque.estoque_atual).toLocaleString("pt-BR")} L` },
    { rotulo: "Capacidade", valor: temCapacidade ? `${capacidade.toLocaleString("pt-BR")} L` : "Não informada" },
    { rotulo: "Percentual", valor: temCapacidade ? `${(pct ?? 0).toFixed(1)}%` : "—" },
    { rotulo: "Custo médio/L", valor: resumo?.custo_medio_por_litro ? `R$ ${resumo.custo_medio_por_litro.toFixed(4)}` : "—" },
    { rotulo: "Consumo médio diário", valor: resumo?.consumo_medio_diario_litros ? `${resumo.consumo_medio_diario_litros.toFixed(1)} L/dia` : "—" },
    { rotulo: "Autonomia estimada", valor: resumo?.autonomia_dias ? `~${Math.round(resumo.autonomia_dias)} dias` : "—" },
    { rotulo: "Valor estimado do estoque", valor: resumo?.valor_estoque ? `R$ ${resumo.valor_estoque.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
    { rotulo: "Estoque mínimo", valor: `${Number(tanque.estoque_minimo).toLocaleString("pt-BR")} L` },
  ];

  const acoes = podeGerenciar
    ? [
        { key: "ajuste_pos", label: "Ajuste positivo", icon: <ArrowUpFromLine size={16} />, onClick: () => { setPositivo(true); setAcao("ajuste"); } },
        { key: "ajuste_neg", label: "Ajuste negativo", icon: <ArrowDownToLine size={16} />, onClick: () => { setPositivo(false); setAcao("ajuste"); } },
        { key: "transferencia", label: "Transferir combustível", icon: <Repeat size={16} />, onClick: () => setAcao("transferencia") },
        { key: "editar", label: "Editar tanque", icon: <Pencil size={16} />, onClick: () => setDrawer(true) },
        { key: "inativar", label: "Inativar", icon: <X size={16} />, cor: "danger" as const, onClick: () => setAcao("inativar") },
      ]
    : [];

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-5">
        <Link href="/tanques" className="inline-flex items-center gap-1 text-body-sm text-text-subtle hover:text-[#1D4ED8]">
          <ArrowLeft size={16} /> Combustíveis
        </Link>

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 rounded-card border border-surface-border bg-white p-5 shadow-card sm:flex-row sm:items-center">
          <FotoCombustivel
            src={tanque.foto_url}
            alt={`Foto do ${tanque.nome}`}
            className="h-24 w-32 flex-shrink-0 rounded-btn object-cover"
            fallback={<Droplets className="h-10 w-10" />}
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h1 text-text-title">{tanque.nome}</h1>
              <StatusTanqueBadge ativo={tanque.ativo} status={tanque.status_estoque} estoqueAtual={tanque.estoque_atual} />
            </div>
            <p className="flex items-center gap-1 text-body-sm text-text-subtle"><Fuel size={14} /> {tanque.combustivel_nome ?? "—"}{tanque.localizacao ? ` · ${tanque.localizacao}` : ""}</p>
            <p className="mt-1 text-body text-text-title">
              {Number(tanque.estoque_atual).toLocaleString("pt-BR")} L{" "}
              {temCapacidade ? <>de {capacidade.toLocaleString("pt-BR")} L</> : "em estoque"}
              {!temCapacidade && <span className="text-meta text-text-subtle"> · Capacidade não informada</span>}
            </p>
            <div className="mt-2 flex h-3 max-w-sm overflow-hidden rounded-full bg-surface-bg">
              <div className={`h-full ${corStatusTanque(tanque.status_estoque)}`} style={{ width: `${temCapacidade ? Math.max(0, Math.min(pct ?? 0, 100)) : 0}%` }} />
            </div>
            <p className="mt-1 text-meta text-text-subtle">Estoque mínimo: {Number(tanque.estoque_minimo).toLocaleString("pt-BR")} L</p>
          </div>

          {podeGerenciar && (
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary" onClick={() => setEntradaDrawer(true)}><ArrowDownToLine size={16} /> Registrar entrada</button>
              <button className="btn btn-secondary" onClick={() => setAcao("inventario")}><Scale size={16} /> Conferir estoque</button>
              <MenuAcoes acoes={acoes} />
            </div>
          )}
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {indicadores.map((ind) => (
            <div key={ind.rotulo} className="rounded-card border border-surface-border bg-white p-4 shadow-card">
              <div className="text-meta text-text-subtle">{ind.rotulo}</div>
              <div className="mt-1 text-h3 text-text-title tabular-nums">{ind.valor}</div>
            </div>
          ))}
        </div>

        <p className="text-meta text-text-subtle">Estimativa baseada nos últimos 30 dias.</p>

        {/* Gráfico de evolução */}
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-h3 text-text-title">Evolução do estoque</h2>
            <div className="flex gap-1">
              {PERIODOS.map((p) => (
                <button
                  key={p.dias}
                  onClick={() => setPeriodo(p.dias)}
                  className={`rounded-pill px-3 py-1 text-meta font-medium ${periodo === p.dias ? "bg-[#1D4ED8] text-white" : "bg-surface-bg text-text-subtle hover:text-text-title"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <GraficoEvolucao pontos={evolucao} cor={corStatusTanque(tanque.status_estoque)} />
        </div>

        {/* Histórico */}
        <div className="rounded-card border border-surface-border bg-white shadow-card">
          <div className="border-b border-surface-border px-4 py-3">
            <h2 className="text-label font-semibold text-text-title">Histórico de movimentações</h2>
          </div>
          <ul className="divide-y divide-surface-border">
            {movs.length === 0 && <li className="px-4 py-6 text-center text-body-sm text-text-subtle">Sem movimentações.</li>}
            {movs.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-body-sm">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${m.sinal > 0 ? "bg-[#9DF6B3] text-[#106D34]" : "bg-[#FFDAD6] text-[#BA1A1A]"}`}>
                    {m.sinal > 0 ? <ArrowUpFromLine size={16} /> : <ArrowDownToLine size={16} />}
                  </span>
                  <div>
                    <p className="font-medium text-text-title">
                      {rotuloMovimentacao(m.tipo, m.origem)}{" "}
                      <span className={m.sinal > 0 ? "text-[#067647]" : "text-[#B42318]"}>
                        {m.sinal > 0 ? "+" : "−"}{Number(m.quantidade).toLocaleString("pt-BR")} L
                      </span>
                    </p>
                    <p className="text-meta text-text-subtle">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                      {m.responsavel_nome && <> · {m.responsavel_nome}</>}
                    </p>
                  </div>
                </div>
                <div className="text-meta text-text-subtle tabular-nums">
                  {m.descricao ?? ""}
                  {m.saldo_apos != null && <> · Saldo {Number(m.saldo_apos).toLocaleString("pt-BR")} L</>}
                </div>
              </li>
            ))}
          </ul>
          {totalMovs > limit && (
            <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-body-sm text-text-subtle">
              <span className="text-meta">{totalMovs} movimentações</span>
              <div className="flex items-center gap-1">
                <button className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => setSkip(Math.max(skip - limit, 0))}><ChevronLeft size={16} /></button>
                <span className="px-2 text-meta">Página {pagina} de {Math.max(paginas, 1)}</span>
                <button className="btn btn-ghost btn-sm" disabled={pagina >= paginas} onClick={() => setSkip(skip + limit)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Drawer e modais */}
        <TanqueFormDrawer aberto={drawer} onClose={() => setDrawer(false)} tanque={tanque} combustiveis={combustiveis} onSalvo={recarregar} />
        <EntradaFormDrawer aberto={entradaDrawer} onClose={() => setEntradaDrawer(false)} tanques={todosTanques} fornecedores={fornecedores} onSalvo={recarregar} tanqueInicialId={tanque.id} />

        {acao === "ajuste" && (
          <AjusteModal aberto onClose={() => setAcao(null)} tanque={tanque} positivo={positivo} onConcluido={recarregar} />
        )}
        {acao === "inventario" && (
          <InventarioModal aberto onClose={() => setAcao(null)} tanque={tanque} onConcluido={recarregar} />
        )}
        {acao === "transferencia" && (
          <TransferenciaModal aberto onClose={() => setAcao(null)} tanque={tanque} tanques={todosTanques} onConcluido={recarregar} />
        )}
        {acao === "inativar" && (
          <ConfirmarModal
            aberto
            onClose={() => setAcao(null)}
            titulo="Inativar tanque"
            descricao={`Deseja inativar o tanque "${tanque.nome}"? O histórico é preservado.`}
            confirmarLabel="Inativar"
            perigo
            onConfirmar={async () => {
              await api.updateTanque(tanque.id, { ativo: false });
              toast.success("Tanque inativado.");
              carregar();
            }}
          />
        )}
      </div>
    </RequirePermission>
  );
}

function GraficoEvolucao({ pontos, cor }: { pontos: { data: string; saldo: number }[]; cor: string }) {
  const valores = useMemo(() => pontos.map((p) => p.saldo), [pontos]);
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const range = Math.max(max - min, 1);

  if (pontos.length === 0) {
    return <p className="py-10 text-center text-body-sm text-text-subtle">Sem dados suficientes para o período.</p>;
  }

  return (
    <div className="mt-4">
      <div className="flex h-44 items-end gap-[2px]">
        {pontos.map((p, i) => {
          const h = ((p.saldo - min) / range) * 100;
          return (
            <div key={i} className="group relative flex-1" title={`${new Date(p.data + "T12:00").toLocaleDateString("pt-BR")}: ${p.saldo.toLocaleString("pt-BR")} L`}>
              <div
                className={`mx-auto w-full rounded-t-sm ${cor} opacity-80 transition-opacity group-hover:opacity-100`}
                style={{ height: `${Math.max(h, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-meta text-text-subtle">
        <span>{pontos[0] ? new Date(pontos[0].data + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}</span>
        <span>{pontos[pontos.length - 1] ? new Date(pontos[pontos.length - 1].data + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}</span>
      </div>
    </div>
  );
}
