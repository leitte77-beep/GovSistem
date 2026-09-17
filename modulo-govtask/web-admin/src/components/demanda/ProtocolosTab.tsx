"use client";

/**
 * Protocolos externos da demanda (§33, §34).
 *
 * O foco da tela é responder "protocolamos onde, em que número, e o que o órgão
 * respondeu até agora" — por isso o histórico de cada protocolo aparece junto,
 * e não atrás de um clique.
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, Send } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Protocolo, StatusProtocolo } from "@/types/govtask";

const SITUACOES: { valor: StatusProtocolo; rotulo: string }[] = [
  { valor: "PROTOCOLADO", rotulo: "Protocolado" },
  { valor: "EM_ANALISE", rotulo: "Em análise" },
  { valor: "EM_DILIGENCIA", rotulo: "Em diligência" },
  { valor: "DOCUMENTACAO_COMPLEMENTAR", rotulo: "Documentação complementar" },
  { valor: "APROVADO", rotulo: "Aprovado" },
  { valor: "REJEITADO", rotulo: "Rejeitado" },
  { valor: "ARQUIVADO", rotulo: "Arquivado" },
];

const ENCERRADAS: StatusProtocolo[] = ["APROVADO", "REJEITADO", "ARQUIVADO"];

const CORES: Record<string, string> = {
  PROTOCOLADO: "bg-blue-50 text-blue-700 ring-blue-200",
  EM_ANALISE: "bg-blue-50 text-blue-700 ring-blue-200",
  EM_DILIGENCIA: "bg-amber-50 text-amber-800 ring-amber-200",
  DOCUMENTACAO_COMPLEMENTAR: "bg-amber-50 text-amber-800 ring-amber-200",
  APROVADO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJEITADO: "bg-red-50 text-red-800 ring-red-200",
  ARQUIVADO: "bg-slate-100 text-slate-700 ring-slate-200",
};

function rotulo(situacao: string): string {
  return SITUACOES.find((s) => s.valor === situacao)?.rotulo ?? situacao;
}

export function ProtocolosTab({ demandaId, podeEditar }: { demandaId: string; podeEditar: boolean }) {
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [movimentando, setMovimentando] = useState<string | null>(null);
  const [form, setForm] = useState({
    sistema: "", numero: "", orgao: "", data_protocolo: "", url: "",
    prazo_resposta: "", proxima_verificacao: "", observacoes: "",
  });
  const [movimento, setMovimento] = useState<{ situacao: StatusProtocolo; descricao: string; proxima_verificacao: string }>({
    situacao: "EM_ANALISE", descricao: "", proxima_verificacao: "",
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setProtocolos(await api.listarProtocolos(demandaId));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar os protocolos");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    if (!form.sistema.trim() || !form.numero.trim()) {
      return notify.error("Informe o sistema e o número do protocolo");
    }
    if (!form.data_protocolo) return notify.error("Informe a data do protocolo");
    setSalvando(true);
    try {
      await api.criarProtocolo(demandaId, {
        sistema: form.sistema.trim(),
        numero: form.numero.trim(),
        orgao: form.orgao.trim() || undefined,
        data_protocolo: new Date(form.data_protocolo).toISOString(),
        url: form.url.trim() || undefined,
        prazo_resposta: form.prazo_resposta ? new Date(form.prazo_resposta).toISOString() : undefined,
        proxima_verificacao: form.proxima_verificacao || undefined,
        observacoes: form.observacoes.trim() || undefined,
      });
      notify.success("Protocolo registrado");
      setNovo(false);
      setForm({ sistema: "", numero: "", orgao: "", data_protocolo: "", url: "", prazo_resposta: "", proxima_verificacao: "", observacoes: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível registrar o protocolo");
    } finally {
      setSalvando(false);
    }
  };

  const registrarMovimento = async (protocoloId: string) => {
    if (movimento.descricao.trim().length < 3) {
      return notify.error("Descreva o que o órgão informou");
    }
    setSalvando(true);
    try {
      await api.atualizarProtocolo(demandaId, protocoloId, {
        situacao: movimento.situacao,
        descricao: movimento.descricao.trim(),
        proxima_verificacao: movimento.proxima_verificacao || undefined,
      });
      notify.success("Movimentação registrada");
      setMovimentando(null);
      setMovimento({ situacao: "EM_ANALISE", descricao: "", proxima_verificacao: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível registrar a movimentação");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900">Protocolos externos</h2>
          <p className="text-sm text-slate-600">
            Onde a demanda saiu do Município e o que cada órgão respondeu.
          </p>
        </div>
        {podeEditar && (
          <button
            onClick={() => setNovo((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />Novo protocolo
          </button>
        )}
      </div>

      {novo && (
        <div className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-5 sm:grid-cols-2">
          <Campo label="Sistema *" value={form.sistema} onChange={(v) => setForm({ ...form, sistema: v })} placeholder="Transferegov, SEI, e-Protocolo…" />
          <Campo label="Número *" value={form.numero} onChange={(v) => setForm({ ...form, numero: v })} placeholder="989232" />
          <Campo label="Órgão" value={form.orgao} onChange={(v) => setForm({ ...form, orgao: v })} placeholder="Secretaria de Estado da Saúde" />
          <Campo label="Data do protocolo *" type="datetime-local" value={form.data_protocolo} onChange={(v) => setForm({ ...form, data_protocolo: v })} />
          <Campo label="Prazo de resposta" type="date" value={form.prazo_resposta} onChange={(v) => setForm({ ...form, prazo_resposta: v })} />
          <Campo label="Cobrar em" type="date" value={form.proxima_verificacao} onChange={(v) => setForm({ ...form, proxima_verificacao: v })} />
          <Campo label="Link do processo" value={form.url} onChange={(v) => setForm({ ...form, url: v })} placeholder="https://…" className="sm:col-span-2" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button onClick={() => setNovo(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
            <button onClick={criar} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {salvando ? "Registrando…" : "Registrar protocolo"}
            </button>
          </div>
        </div>
      )}

      {!protocolos.length && !novo && (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Nada foi protocolado fora do Município ainda.
        </p>
      )}

      {protocolos.map((p) => {
        const encerrado = ENCERRADAS.includes(p.situacao);
        return (
          <article key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <p className="font-mono text-xs text-slate-500">{p.sistema.toUpperCase()}</p>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900">nº {p.numero}{p.ano ? `/${p.ano}` : ""}</h3>
                <p className="mt-1 text-sm text-slate-600">{p.orgao || "Órgão não informado"} · protocolado em {formatDate(p.data_protocolo)}</p>
                {p.prazo_resposta && <p className="mt-1 text-xs text-slate-500">Prazo de resposta: {formatDate(p.prazo_resposta)}</p>}
                {p.proxima_verificacao && <p className="text-xs font-semibold text-amber-700">Cobrar em {formatDate(p.proxima_verificacao)}</p>}
              </div>
              <div className="flex items-center gap-2">
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-blue-500">
                    <ExternalLink className="h-3.5 w-3.5" />Abrir
                  </a>
                )}
                <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${CORES[p.situacao] ?? CORES.ARQUIVADO}`}>
                  {rotulo(p.situacao)}
                </span>
              </div>
            </header>

            <ol className="divide-y divide-slate-100">
              {p.atualizacoes.map((a) => (
                <li key={a.id} className="flex gap-4 px-5 py-3 text-sm">
                  <span className="w-36 shrink-0 text-xs text-slate-500">{formatDateTime(a.ocorrido_em)}</span>
                  <span className="w-44 shrink-0 text-xs font-semibold text-slate-700">{rotulo(a.situacao)}</span>
                  <span className="text-slate-700">{a.descricao}</span>
                </li>
              ))}
            </ol>

            {podeEditar && !encerrado && (
              movimentando === p.id ? (
                <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-5 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Nova situação
                    <select
                      value={movimento.situacao}
                      onChange={(e) => setMovimento({ ...movimento, situacao: e.target.value as StatusProtocolo })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                    >
                      {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                    </select>
                  </label>
                  <Campo label="Cobrar novamente em" type="date" value={movimento.proxima_verificacao} onChange={(v) => setMovimento({ ...movimento, proxima_verificacao: v })} />
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    O que o órgão informou *
                    <textarea
                      value={movimento.descricao}
                      onChange={(e) => setMovimento({ ...movimento, descricao: e.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
                      placeholder="Órgão solicitou certidão negativa de débitos"
                    />
                  </label>
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Aprovar, rejeitar ou arquivar encerra a tramitação: depois disso o
                    protocolo não recebe novas movimentações.
                  </p>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <button onClick={() => setMovimentando(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                    <button onClick={() => registrarMovimento(p.id)} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      <Send className="h-4 w-4" />Registrar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-100 px-5 py-3">
                  <button onClick={() => setMovimentando(p.id)} className="text-sm font-semibold text-blue-700 hover:underline">
                    Registrar movimentação do órgão
                  </button>
                </div>
              )
            )}
          </article>
        );
      })}
    </section>
  );
}

function Campo({ label, value, onChange, type = "text", placeholder, className = "" }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <label className={`text-xs font-semibold text-slate-600 ${className}`}>
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
      />
    </label>
  );
}
