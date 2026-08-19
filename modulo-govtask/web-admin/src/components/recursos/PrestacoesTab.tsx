"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatDate, STATUS_PRESTACAO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Prestacao } from "@/types/govtask";
import { Plus, X, CheckCircle, Send, ClipboardCheck } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

const CHECKLIST_PADRAO = [
  "Relatório de execução",
  "Relatório fotográfico",
  "Notas fiscais",
  "Comprovantes de pagamento",
  "Extratos bancários",
  "Medições",
  "Documentos licitatórios",
  "Contrato",
  "Termo de recebimento",
  "Registros patrimoniais",
];

export function PrestacoesTab({ convenioId, canEdit }: Props) {
  const [prestacoes, setPrestacoes] = useState<Prestacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [formEnvio, setFormEnvio] = useState({ sistema_envio: "", protocolo: "", observacao: "" });
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPrestacoes(await api.listPrestacoes(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    try {
      const p = await api.criarPrestacao(convenioId, { titulo: titulo || undefined });
      for (const item of CHECKLIST_PADRAO) {
        await api.adicionarItemPrestacao(convenioId, p.id, item);
      }
      notify.success("Prestação criada com checklist padrão!");
      setShowCriar(false);
      setTitulo("");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const alternarItem = async (prestacaoId: string, itemId: string, conferido: boolean) => {
    try {
      await api.alternarItemPrestacao(convenioId, prestacaoId, itemId, !conferido);
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const enviar = async (id: string) => {
    try {
      await api.enviarPrestacao(convenioId, id, {
        sistema_envio: formEnvio.sistema_envio || undefined,
        protocolo: formEnvio.protocolo || undefined,
        observacao: formEnvio.observacao || undefined,
      });
      notify.success("Prestação enviada!");
      setEnviando(null);
      setFormEnvio({ sistema_envio: "", protocolo: "", observacao: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const decidir = async (id: string, status: string) => {
    const parecer = status.includes("REJEITADA") || status.includes("DILIGENCIA")
      ? window.prompt("Justificativa/parecer:")
      : undefined;
    try {
      await api.decidirPrestacao(convenioId, id, { status, parecer: parecer || undefined });
      notify.success("Decisão registrada!");
      setDecidindo(null);
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Prestações de contas com checklist de conferência.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Nova Prestação</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-32 rounded-card" />
      ) : prestacoes.length === 0 ? (
        <EmptyState icon="clipboard-list" title="Nenhuma prestação" description="Crie a prestação de contas quando o recurso estiver em fase de prestação." />
      ) : (
        <div className="space-y-4">
          {prestacoes.map((p) => (
            <Card key={p.id} padding="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <ClipboardCheck className="w-5 h-5 text-[#1D4ED8]" />
                  <h3 className="text-h3 text-text-title">{p.titulo || "Prestação de Contas"}</h3>
                  <Badge label={STATUS_PRESTACAO_LABELS[p.status] || p.status} color={RECURSOS_STATUS_COLORS[p.status] || "bg-[#F6F7F9] text-[#667085]"} />
                </div>
                <div className="text-right shrink-0">
                  <p className="text-h2 text-text-title tabular-nums">{p.percentual_preparacao}%</p>
                  <p className="text-meta text-text-subtle">preparada</p>
                </div>
              </div>

              <div className="flex justify-between items-center text-meta text-text-subtle mb-1 mt-2">
                <span>Checklist de conferência</span>
                <span>{p.itens.filter((i) => i.conferido).length} de {p.itens.length} documentos</span>
              </div>
              <div className="h-2 bg-[#F6F7F9] rounded-pill overflow-hidden mb-3">
                <div className="h-full bg-[#067647] transition-all duration-700" style={{ width: `${p.percentual_preparacao}%` }} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {p.itens.map((item) => (
                  <button
                    key={item.id}
                    disabled={!canEdit || ["ENVIADA", "EM_ANALISE", "APROVADA", "APROVADA_COM_OBSERVACAO", "ENCERRADA"].includes(p.status)}
                    onClick={() => alternarItem(p.id, item.id, item.conferido)}
                    className={`flex items-center gap-2 p-2 rounded-btn text-body-sm text-left transition-colors ${canEdit ? "hover:bg-[#F6F7F9]" : ""} ${item.conferido ? "text-[#067647]" : "text-text-body"}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${item.conferido ? "bg-[#067647] border-[#067647]" : "border-[#D0D5DD] bg-white"}`}>
                      {item.conferido && <CheckCircle className="w-3 h-3 text-white" />}
                    </span>
                    {item.descricao}
                  </button>
                ))}
              </div>

              {p.data_envio && (
                <p className="text-meta text-text-subtle mt-2">
                  Enviada em {formatDate(p.data_envio)}{p.sistema_envio ? ` via ${p.sistema_envio}` : ""}{p.protocolo ? ` — Protocolo ${p.protocolo}` : ""}
                </p>
              )}
              {p.parecer && <p className="text-body-sm text-text-body mt-2 bg-[#F6F7F9] p-2 rounded-btn">Parecer: {p.parecer}</p>}

              {canEdit && ["EM_PREPARACAO", "PRONTA"].includes(p.status) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-surface-border">
                  <Button size="sm" icon={Send} onClick={() => setEnviando(p.id)}>Enviar ao órgão</Button>
                </div>
              )}
              {canEdit && ["ENVIADA", "EM_ANALISE"].includes(p.status) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-surface-border flex-wrap">
                  <Button size="sm" icon={CheckCircle} onClick={() => decidir(p.id, "APROVADA")}>Aprovar</Button>
                  <Button size="sm" variant="secondary" onClick={() => decidir(p.id, "EM_DILIGENCIA")}>Diligência</Button>
                  <Button size="sm" variant="danger" onClick={() => decidir(p.id, "REJEITADA")}>Rejeitar</Button>
                </div>
              )}

              {enviando === p.id && (
                <div className="mt-3 pt-3 border-t border-surface-border space-y-2">
                  <input value={formEnvio.sistema_envio} onChange={(e) => setFormEnvio({ ...formEnvio, sistema_envio: e.target.value })} className={inputCls} placeholder="Sistema (ex: Transferegov)" />
                  <input value={formEnvio.protocolo} onChange={(e) => setFormEnvio({ ...formEnvio, protocolo: e.target.value })} className={inputCls} placeholder="Protocolo" />
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setEnviando(null); setFormEnvio({ sistema_envio: "", protocolo: "", observacao: "" }); }}>Cancelar</Button>
                    <Button size="sm" icon={Send} onClick={() => enviar(p.id)}>Confirmar Envio</Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-md shadow-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Nova Prestação de Contas</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-body-sm text-text-body mb-3">Um checklist padrão de documentos será criado automaticamente.</p>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Título (opcional)" />
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="secondary" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button icon={Plus} onClick={criar}>Criar Prestação</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
