"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Download, Lock, Send, Unlock, XCircle } from "lucide-react";
import { api, SimamCompetencia, SimamCompetenciaResumo } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ARQUIVOS: { nome: string; titulo: string }[] = [
  { nome: "VeiculoEquipamento", titulo: "Veículos e equipamentos" },
  { nome: "HodometroHorimetro", titulo: "Hodômetros e horímetros" },
  { nome: "ConsumoCombustivel", titulo: "Consumo de combustível" },
  { nome: "EstornoConsumoCombustivel", titulo: "Estornos de consumo" },
  { nome: "EntradaExtraCombustivel", titulo: "Entradas extraorçamentárias" },
  { nome: "SaidaExtraCombustivel", titulo: "Saídas extraordinárias" },
  { nome: "EstoqueCombustivel", titulo: "Estoque de combustível" },
];

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  ABERTA: { rotulo: "Aberta", classe: "bg-surface-bg text-text-subtle" },
  FECHADA: { rotulo: "Fechada", classe: "bg-[#FEF3C7] text-[#92400E]" },
  EXPORTADA: { rotulo: "Enviada", classe: "bg-[#DCFCE7] text-[#166534]" },
};

function mesAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

export default function SimamPage() {
  const { hasPermission } = useAuth();
  const pode = hasPermission("config.manage");
  const [sel, setSel] = useState(mesAnterior);
  const [meses, setMeses] = useState<SimamCompetenciaResumo[]>([]);
  const [dados, setDados] = useState<SimamCompetencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Link de pendência "feche antes 08/2026" chega com ?ano=&mes=.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ano = Number(q.get("ano"));
    const mes = Number(q.get("mes"));
    if (ano && mes >= 1 && mes <= 12) setSel({ ano, mes });
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, det] = await Promise.all([api.simamCompetencias(sel.ano), api.simamCompetencia(sel.ano, sel.mes)]);
      setMeses(lista);
      setDados(det);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [sel]);
  useEffect(() => { carregar(); }, [carregar]);

  async function acao(tipo: "fechar" | "reabrir" | "exportada") {
    let justificativa: string | undefined;
    if (tipo === "reabrir") {
      justificativa = window.prompt("Por que reabrir a competência?") ?? undefined;
      if (!justificativa || justificativa.trim().length < 5) return;
    }
    if (tipo === "exportada" && !window.confirm(
      "Confirma que o arquivo desta competência foi enviado ao TCE? Depois disso ela não pode ser reaberta: correções viram estorno."
    )) return;
    setOcupado(true);
    try {
      await api.simamAcao(sel.ano, sel.mes, tipo, justificativa);
      toast.success(tipo === "fechar" ? "Competência fechada." : tipo === "reabrir" ? "Competência reaberta." : "Marcada como enviada ao TCE.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function baixar() {
    setOcupado(true);
    try {
      await api.simamBaixarZip(sel.ano, sel.mes);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const hoje = new Date();
  const mesEncerrado = sel.ano * 100 + sel.mes < hoje.getFullYear() * 100 + hoje.getMonth() + 1;
  const status = dados?.status ?? "ABERTA";

  return (
    <RequirePermission perms="reports.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h2 text-text-title">SIM-AM · TCE-PR</h1>
            <p className="text-meta text-text-subtle">Arquivos mensais de frota e combustível, calculados a partir dos lançamentos.</p>
          </div>
          <select value={sel.ano} onChange={(e) => setSel({ ano: Number(e.target.value), mes: sel.mes })}
            className="rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm">
            {[hoje.getFullYear() - 1, hoje.getFullYear()].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
          {MESES.map((nome, i) => {
            const m = meses.find((x) => x.mes === i + 1);
            const st = STATUS[m?.status ?? "ABERTA"];
            const ativo = sel.mes === i + 1;
            return (
              <button key={nome} onClick={() => setSel({ ano: sel.ano, mes: i + 1 })}
                className={`rounded-card border px-2 py-2 text-center transition-colors ${ativo ? "border-[#1D4ED8] bg-[#EFF6FF]" : "border-surface-border bg-white hover:bg-surface-bg"}`}>
                <span className="block text-body-sm font-semibold text-text-title">{nome}</span>
                <span className={`mt-1 inline-block rounded-pill px-2 py-0.5 text-[11px] ${st.classe}`}>{st.rotulo}</span>
              </button>
            );
          })}
        </div>

        {carregando && !dados && <p className="animate-pulse text-text-subtle">Calculando competência…</p>}

        {dados && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card">
              <div>
                <h2 className="text-label font-semibold text-text-title">
                  Competência {String(sel.mes).padStart(2, "0")}/{sel.ano}
                  <span className={`ml-2 rounded-pill px-2 py-0.5 text-meta ${STATUS[status].classe}`}>{STATUS[status].rotulo}</span>
                </h2>
                <p className="text-meta text-text-subtle">
                  {status === "ABERTA" && (mesEncerrado
                    ? "Confira as pendências e feche: os lançamentos do mês ficam travados e o arquivo é gerado."
                    : "Mês em andamento: a prévia mostra o que já foi lançado. O fechamento abre no mês seguinte.")}
                  {status === "FECHADA" && "Retrato congelado. Baixe o ZIP, envie ao TCE e marque como enviada."}
                  {status === "EXPORTADA" && "Enviada ao TCE. Cancelamentos e reduções de litros deste mês geram estorno na competência aberta."}
                </p>
              </div>
              {pode && (
                <div className="flex flex-wrap gap-2">
                  {status === "ABERTA" && mesEncerrado && (
                    <button className="btn btn-primary" disabled={ocupado || dados.erros.length > 0} onClick={() => acao("fechar")}
                      title={dados.erros.length ? "Corrija as pendências antes de fechar" : undefined}>
                      <Lock size={16} /> Fechar competência
                    </button>
                  )}
                  {status === "FECHADA" && (<>
                    <button className="btn btn-secondary" disabled={ocupado} onClick={() => acao("reabrir")}><Unlock size={16} /> Reabrir</button>
                    <button className="btn btn-secondary" disabled={ocupado} onClick={baixar}><Download size={16} /> Baixar ZIP</button>
                    <button className="btn btn-primary" disabled={ocupado} onClick={() => acao("exportada")}><Send size={16} /> Marcar como enviada</button>
                  </>)}
                  {status === "EXPORTADA" && (
                    <button className="btn btn-secondary" disabled={ocupado} onClick={baixar}><Download size={16} /> Baixar ZIP enviado</button>
                  )}
                </div>
              )}
            </section>

            {status === "ABERTA" && (
              <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
                <h2 className="mb-2 flex items-center gap-2 text-label font-semibold text-text-title">
                  {dados.erros.length === 0
                    ? <><CheckCircle2 size={18} className="text-[#067647]" /> Nenhuma pendência</>
                    : <><XCircle size={18} className="text-[#B42318]" /> {dados.erros.length} pendência(s) impedem o fechamento</>}
                </h2>
                <Pendencias itens={dados.erros} cor="text-[#B42318]" />
                {dados.avisos.length > 0 && (
                  <>
                    <h3 className="mb-1 mt-3 flex items-center gap-2 text-body-sm font-semibold text-[#B54708]">
                      <AlertTriangle size={16} /> {dados.avisos.length} aviso(s) para conferir (não bloqueiam)
                    </h3>
                    <Pendencias itens={dados.avisos} cor="text-[#B54708]" />
                  </>
                )}
              </section>
            )}

            <section className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
              {ARQUIVOS.map(({ nome, titulo }) => {
                const linhas = dados.arquivos[nome] ?? [];
                const erros = dados.erros.filter((e) => e.arquivo === nome).length;
                return (
                  <div key={nome} className="border-b border-surface-border last:border-0">
                    <button onClick={() => setAberto(aberto === nome ? null : nome)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-bg">
                      <span className="flex items-center gap-2 text-body-sm">
                        {erros ? <XCircle size={16} className="text-[#B42318]" /> : <CheckCircle2 size={16} className="text-[#067647]" />}
                        <span className="font-medium text-text-title">{titulo}</span>
                        <span className="text-meta text-text-subtle">{nome}.txt</span>
                      </span>
                      <span className="text-meta text-text-subtle">{linhas.length} registro(s)</span>
                    </button>
                    {aberto === nome && <Tabela campos={dados.layout[nome] ?? []} linhas={linhas} />}
                  </div>
                );
              })}
            </section>

            {dados.historico.length > 0 && (
              <section className="rounded-card border border-surface-border bg-white p-4 text-meta text-text-subtle shadow-card">
                <h2 className="mb-2 text-label font-semibold text-text-title">Histórico</h2>
                <ul className="space-y-1">
                  {dados.historico.map((h, i) => (
                    <li key={i}>
                      {new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                      {STATUS[h.evento]?.rotulo ?? (h.evento === "REABERTA" ? "Reaberta" : h.evento)}
                      {h.detalhe ? ` — ${h.detalhe}` : ""}
                    </li>
                  ))}
                </ul>
                {dados.arquivo_sha256 && <p className="mt-2 break-all">SHA-256 do ZIP: {dados.arquivo_sha256}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </RequirePermission>
  );
}

function Pendencias({ itens, cor }: { itens: { mensagem: string; link: string | null; arquivo: string }[]; cor: string }) {
  if (!itens.length) return null;
  return (
    <ul className="space-y-1 text-body-sm">
      {itens.map((p, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-2">
          <span className={cor}>•</span>
          <span className="text-text-body">{p.mensagem}</span>
          {p.link && <Link href={p.link} className="text-meta text-primary hover:underline">corrigir</Link>}
        </li>
      ))}
    </ul>
  );
}

function Tabela({ campos, linhas }: { campos: string[]; linhas: Record<string, string | number | null>[] }) {
  if (!linhas.length) return <p className="px-4 pb-4 text-meta text-text-subtle">Nada a informar neste mês.</p>;
  const rotulo = linhas.some((l) => l._placa) ? "_placa" : linhas.some((l) => l._combustivel) ? "_combustivel" : null;
  const colunas = campos.filter((c) => c !== "idPessoa");
  return (
    <div className="overflow-x-auto px-4 pb-4">
      <table className="w-full min-w-200 text-meta">
        <thead>
          <tr className="border-b border-surface-border text-left text-text-subtle">
            {rotulo && <th className="py-2 pr-3">{rotulo === "_placa" ? "Placa" : "Combustível"}</th>}
            {colunas.map((c) => <th key={c} className="py-2 pr-3 font-mono font-normal">{c}</th>)}
            {linhas.some((l) => l._media) && <th className="py-2 pr-3">km/L</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-surface-border last:border-0">
              {rotulo && <td className="py-2 pr-3 font-medium text-text-title">{l[rotulo]}</td>}
              {colunas.map((c) => (
                <td key={c} className={`py-2 pr-3 ${l[c] === null || l[c] === "" ? "text-text-subtle" : "text-text-body"}`}>
                  {l[c] ?? (c === "nrSequencialConsumo" ? "no fechamento" : "—")}
                </td>
              ))}
              {linhas.some((x) => x._media) && <td className="py-2 pr-3">{l._media ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
