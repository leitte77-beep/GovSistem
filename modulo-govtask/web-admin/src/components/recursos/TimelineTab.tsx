"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { formatDayTime } from "@/lib/utils";
import type { TimelineEvent } from "@/types/govtask";
import { Send } from "lucide-react";

type Props = {
  convenioId: string;
  events: TimelineEvent[];
  onRefresh: () => void;
};

const TIPO_EVENTO_LABELS: Record<string, string> = {
  CONVENIO_CRIADO: "Criação",
  PROTOCOLO_REGISTRADO: "Protocolo externo",
  ETAPA_ABERTA: "Etapa aberta",
  ETAPA_CONCLUIDA: "Etapa concluída",
  TAREFA_CRIADA: "Tarefa criada",
  TAREFA_ATRIBUIDA: "Tarefa atribuída",
  TAREFA_ACEITA: "Tarefa aceita",
  TAREFA_ENTREGUE: "Tarefa entregue",
  TAREFA_DEVOLVIDA: "Tarefa devolvida",
  TAREFA_CONCLUIDA: "Tarefa aprovada",
  PRAZO_DEFINIDO: "Prazo definido",
  PRAZO_PRORROGADO: "Prazo prorrogado",
  CONTESTACAO_ABERTA: "Contestação aberta",
  CONTESTACAO_DECIDIDA: "Contestação decidida",
  ANEXO_ADICIONADO: "Documento anexado",
  ENCAMINHADO_GOVERNO: "Encaminhado ao governo",
  RESPOSTA_GOVERNO_REGISTRADA: "Resposta do governo",
  STATUS_ALTERADO: "Status alterado",
  DILIGENCIA_RECEBIDA: "Diligência",
  DILIGENCIA_RESPONDIDA: "Diligência respondida",
  DILIGENCIA_ENCERRADA: "Diligência encerrada",
  REPASSE_REGISTRADO: "Repasse registrado",
  MEDICAO_REGISTRADA: "Medição registrada",
  MEDICAO_APROVADA: "Medição aprovada",
  MOVIMENTO_FINANCEIRO: "Movimento financeiro",
  CONTRATO_CADASTRADO: "Contrato cadastrado",
  ADITIVO_REGISTRADO: "Aditivo registrado",
  LICITACAO_VINCULADA: "Licitação",
  PRESTACAO_CRIADA: "Prestação criada",
  PRESTACAO_ENVIADA: "Prestação enviada",
  PRESTACAO_APROVADA: "Prestação aprovada",
  ENTREGA_REGISTRADA: "Entrega registrada",
  DOCUMENTO_ENVIADO_EXTERNO: "Documento enviado",
  AUDITORIA_REGISTRADA: "Auditoria",
  OBSERVACAO_REGISTRADA: "Observação",
};

export function TimelineTab({ convenioId, events, onRefresh }: Props) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const registrar = async () => {
    if (!texto.trim()) return;
    setSalvando(true);
    try {
      await api.registrarObservacaoTimeline(convenioId, texto.trim());
      setTexto("");
      notify.success("Movimentação registrada!");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message || "Não foi possível registrar");
    } finally {
      setSalvando(false);
    }
  };

  const ordenados = [...events].sort(
    (a, b) => new Date(b.ocorrido_em).getTime() - new Date(a.ocorrido_em).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Registrar observação */}
      <div className="bg-white border border-[#E4E7EC] rounded-xl p-4">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Registrar observação ou movimentação no histórico..."
          className="w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-3 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
        />
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={registrar}
            disabled={!texto.trim() || salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] disabled:bg-[#A4BCFD] disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" /> Registrar
          </button>
        </div>
      </div>

      {/* Histórico */}
      {ordenados.length === 0 ? (
        <p className="text-[13px] text-[#98A2B3] text-center py-8">
          Nenhuma movimentação registrada neste processo.
        </p>
      ) : (
        <ul className="space-y-5">
          {ordenados.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="mt-2 w-2 h-2 rounded-full bg-[#2E90FA] shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] text-[#98A2B3]">
                  <span className="font-medium text-[#667085]">
                    {TIPO_EVENTO_LABELS[e.tipo_evento] || e.tipo_evento}
                  </span>
                  {"  ·  "}
                  {formatDayTime(e.ocorrido_em)}
                </p>
                <p className="text-[14px] text-[#101828] mt-0.5 leading-snug">{e.descricao}</p>
                {e.ator?.name && <p className="text-[12px] text-[#98A2B3] mt-0.5">por {e.ator.name}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
