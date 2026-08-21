"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { Setor } from "@/types/govtask";
import { Send, X } from "lucide-react";

/**
 * O gesto central do módulo: o assessor manda uma demanda para um
 * departamento. Cinco campos, um botão — a etapa do processo é resolvida pelo
 * backend, para que o coordenador não precise pensar na estrutura interna.
 */
export function EncaminharDemanda({
  convenioId,
  processoTitulo,
  aberto,
  onFechar,
  onEncaminhado,
}: {
  convenioId: string;
  processoTitulo?: string;
  aberto: boolean;
  onFechar: () => void;
  onEncaminhado?: () => void;
}) {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [pessoas, setPessoas] = useState<{ id: string; name: string }[]>([]);
  const [enviando, setEnviando] = useState(false);

  const [setorId, setSetorId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [prazoInterno, setPrazoInterno] = useState("");
  const [prazo, setPrazo] = useState("");
  const [prioridade, setPrioridade] = useState("NORMAL");

  useEffect(() => {
    if (!aberto) return;
    api.listSetores().then((s) => setSetores(s.filter((x) => x.ativo))).catch(() => {});
    api.listUsers().then(setPessoas).catch(() => {});
  }, [aberto]);

  useEffect(() => {
    if (aberto) return;
    setSetorId("");
    setTitulo("");
    setDescricao("");
    setResponsavelId("");
    setPrazoInterno("");
    setPrazo("");
    setPrioridade("NORMAL");
  }, [aberto]);

  if (!aberto) return null;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setorId || !titulo.trim()) {
      notify.error("Informe o departamento e o assunto da demanda");
      return;
    }
    setEnviando(true);
    try {
      const r = await api.encaminharDemanda(convenioId, {
        setor_destino_id: setorId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        atribuida_a_id: responsavelId || undefined,
        prioridade,
        prazo: prazo ? new Date(prazo).toISOString() : undefined,
        prazo_interno: prazoInterno ? new Date(prazoInterno).toISOString() : undefined,
      });
      notify.success(`Demanda encaminhada para ${r.setor}`);
      if (r.aviso) notify.error(r.aviso);
      onFechar();
      onEncaminhado?.();
    } catch (err: any) {
      notify.error(err.message || "Não foi possível encaminhar a demanda");
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3 py-2.5 text-[14px] text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const rotulo = "block text-[13px] font-medium text-[#344054] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onFechar} />
      <form
        onSubmit={enviar}
        className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-elevated max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-[#E4E7EC] sticky top-0 bg-white rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-[#101828]">Encaminhar para departamento</h2>
            {processoTitulo && (
              <p className="text-[13px] text-[#667085] mt-0.5 truncate">{processoTitulo}</p>
            )}
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-lg text-[#98A2B3] hover:bg-[#F9FAFB]" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={rotulo} htmlFor="dep">Departamento</label>
            <select id="dep" value={setorId} onChange={(e) => setSetorId(e.target.value)} className={campo} required>
              <option value="">Selecione o departamento</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo} htmlFor="assunto">O que precisa ser feito</label>
            <input
              id="assunto"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Elaborar projeto executivo da creche"
              className={campo}
              required
            />
          </div>

          <div>
            <label className={rotulo} htmlFor="detalhe">Orientações (opcional)</label>
            <textarea
              id="detalhe"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Documentos necessários, exigências do governo, observações..."
              className={cn(campo, "resize-y")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={rotulo} htmlFor="prazo-interno">Prazo interno</label>
              <input id="prazo-interno" type="date" value={prazoInterno} onChange={(e) => setPrazoInterno(e.target.value)} className={campo} />
              <p className="text-[12px] text-[#98A2B3] mt-1">Sua margem para revisar antes de protocolar</p>
            </div>
            <div>
              <label className={rotulo} htmlFor="prazo-governo">Prazo do governo</label>
              <input id="prazo-governo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={campo} />
              <p className="text-[12px] text-[#98A2B3] mt-1">Data limite externa, quando houver</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={rotulo} htmlFor="resp">Responsável (opcional)</label>
              <select id="resp" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={campo}>
                <option value="">Todo o departamento</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="prio">Prioridade</label>
              <select id="prio" value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={campo}>
                <option value="BAIXA">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-[#E4E7EC] sticky bottom-0 bg-white">
          <button type="button" onClick={onFechar} className="px-4 py-2.5 rounded-lg text-[13px] font-medium text-[#344054] hover:bg-[#F9FAFB]">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1D4ED8] text-white text-[13px] font-semibold hover:bg-[#1E40AF] disabled:opacity-60 transition-colors"
          >
            <Send className="w-4 h-4" />
            {enviando ? "Encaminhando..." : "Encaminhar"}
          </button>
        </div>
      </form>
    </div>
  );
}
