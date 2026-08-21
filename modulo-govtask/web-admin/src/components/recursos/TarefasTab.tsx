"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { StatusPill } from "@/components/ui/StatusPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { formatDate, PRIORITY_LABELS, cn } from "@/lib/utils";
import type { Etapa, Setor, TarefaListItem } from "@/types/govtask";
import { Plus, Send, Check, RotateCcw, Clock } from "lucide-react";

type Props = {
  convenioId: string;
  tarefas: TarefaListItem[];
  etapas: Etapa[];
  canEdit: boolean;
  onRefresh: () => void;
};

/** Agrupamento exibido no painel, na ordem em que aparece na tela. */
const GRUPOS: { titulo: string; status: string[] }[] = [
  { titulo: "Não iniciada", status: ["AGUARDANDO_ACEITE"] },
  { titulo: "Em andamento", status: ["EM_ANDAMENTO"] },
  { titulo: "Aguardando terceiro", status: ["ENTREGUE", "DEVOLVIDA", "CONTESTADA"] },
  { titulo: "Concluída", status: ["CONCLUIDA"] },
  { titulo: "Cancelada", status: ["CANCELADA"] },
];

export function TarefasTab({ convenioId, tarefas, etapas, canEdit, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    setor_destino_id: "",
    prioridade: "NORMAL",
    prazo_interno: "",
    prazo: "",
  });

  useEffect(() => {
    api.listSetores().then(setSetores).catch(() => {});
  }, []);

  // A tarefa pertence a uma etapa: usa a etapa em andamento, senão a primeira pendente.
  const etapaAlvo =
    etapas.find((e) => e.status === "EM_ANDAMENTO") ||
    etapas.find((e) => e.status === "PENDENTE") ||
    etapas[0];

  const criar = async () => {
    if (!form.titulo.trim()) return notify.error("Informe o título da tarefa");
    if (!etapaAlvo) return notify.error("Cadastre uma etapa no processo antes de criar tarefas");
    setSalvando(true);
    try {
      const tarefa: any = await api.createTarefa(etapaAlvo.id, {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || undefined,
        setor_destino_id: form.setor_destino_id || undefined,
        prioridade: form.prioridade,
        prazo: form.prazo ? new Date(form.prazo).toISOString() : undefined,
      });
      // prazo_interno só é aceito na atualização da tarefa
      if (form.prazo_interno && tarefa?.id) {
        await api
          .updateTarefa(tarefa.id, { prazo_interno: new Date(form.prazo_interno).toISOString() })
          .catch(() => {});
      }
      notify.success("Tarefa criada!");
      setForm({ titulo: "", descricao: "", setor_destino_id: "", prioridade: "NORMAL", prazo_interno: "", prazo: "" });
      setShowForm(false);
      onRefresh();
    } catch (e: any) {
      notify.error(e.message || "Não foi possível criar a tarefa");
    } finally {
      setSalvando(false);
    }
  };

  const acao = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      notify.success(msg);
      onRefresh();
    } catch (e: any) {
      notify.error(e.message || "Não foi possível concluir a ação");
    }
  };

  const inputCls =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const labelCls = "block text-[13px] text-[#475467] mb-1.5";

  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: tarefas.filter((t) => g.status.includes(t.status)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#475467]">{tarefas.length} tarefa(s)</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova tarefa
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Título *</label>
              <input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Elaborar parecer jurídico"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Descrição</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                className={`${inputCls} resize-y`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Departamento</label>
                <select
                  value={form.setor_destino_id}
                  onChange={(e) => setForm({ ...form, setor_destino_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Prioridade</label>
                <select
                  value={form.prioridade}
                  onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                  className={inputCls}
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Prazo interno</label>
                <input
                  type="date"
                  value={form.prazo_interno}
                  onChange={(e) => setForm({ ...form, prazo_interno: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Prazo externo</label>
                <input
                  type="date"
                  value={form.prazo}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={criar}
              disabled={!form.titulo.trim() || salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] disabled:bg-[#A4BCFD] disabled:cursor-not-allowed transition-colors"
            >
              Criar tarefa
            </button>
          </div>
          {!etapaAlvo && (
            <p className="text-[12px] text-[#B54708] mt-3">
              Este processo ainda não possui etapas — cadastre uma etapa antes de criar tarefas.
            </p>
          )}
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="text-[13px] text-[#98A2B3] text-center py-10">Nenhuma tarefa neste processo.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.titulo}>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#98A2B3] mb-2.5">
              {g.titulo} ({g.items.length})
            </h3>
            <div className="space-y-3">
              {g.items.map((t) => (
                <div key={t.id} className="bg-white border border-[#E4E7EC] rounded-xl p-4 flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/tarefas/${t.id}`}
                      className="text-[14px] font-semibold text-[#101828] hover:text-[#1D4ED8] transition-colors"
                    >
                      {t.titulo}
                    </Link>
                    {t.descricao && <p className="text-[13px] text-[#667085] mt-0.5">{t.descricao}</p>}
                    <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                      <StatusPill status={t.status} />
                      <PriorityBadge priority={t.prioridade} />
                      {t.setor_destino?.nome && (
                        <span className="text-[12px] text-[#667085]">{t.setor_destino.nome}</span>
                      )}
                      {t.prazo && (
                        <span
                          className={cn(
                            "text-[12px] flex items-center gap-1",
                            t.atrasada ? "text-[#B42318] font-medium" : "text-[#667085]"
                          )}
                        >
                          <Clock className="w-3.5 h-3.5" /> {formatDate(t.prazo)}
                        </span>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <AcaoBotao
                        title={t.status === "AGUARDANDO_ACEITE" ? "Aceitar tarefa" : "Registrar entrega"}
                        icon={Send}
                        disabled={!["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "DEVOLVIDA"].includes(t.status)}
                        onClick={() =>
                          acao(
                            () =>
                              t.status === "AGUARDANDO_ACEITE"
                                ? api.aceitarTarefa(t.id)
                                : api.entregarTarefa(t.id),
                            t.status === "AGUARDANDO_ACEITE" ? "Tarefa aceita!" : "Entrega registrada!"
                          )
                        }
                      />
                      <AcaoBotao
                        title="Aprovar e concluir"
                        icon={Check}
                        disabled={t.status !== "ENTREGUE"}
                        onClick={() => acao(() => api.concluirTarefa(t.id), "Tarefa concluída!")}
                      />
                      <AcaoBotao
                        title="Devolver para ajustes"
                        icon={RotateCcw}
                        disabled={t.status !== "ENTREGUE"}
                        onClick={() => {
                          const motivo = window.prompt("Motivo da devolução:");
                          if (!motivo) return;
                          acao(() => api.devolverTarefa(t.id, motivo), "Tarefa devolvida!");
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function AcaoBotao({
  title,
  icon: Icon,
  disabled,
  onClick,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg transition-colors",
        disabled
          ? "text-[#D0D5DD] cursor-not-allowed"
          : "text-[#98A2B3] hover:text-[#1D4ED8] hover:bg-[#1D4ED8]/5"
      )}
    >
      <Icon className="w-[18px] h-[18px]" />
    </button>
  );
}
