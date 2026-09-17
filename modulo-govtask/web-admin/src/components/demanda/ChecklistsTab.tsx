"use client";

/**
 * Checklists da demanda (§32, §67, §145).
 *
 * A tela responde "o que ainda falta". Item obrigatório pendente de checklist
 * obrigatório **impede** a conclusão da demanda — a interface avisa isso antes
 * de alguém tentar concluir e levar um 409.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Paperclip, Plus, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import type { Checklist } from "@/types/govtask";

export function ChecklistsTab({ demandaId, podeEditar }: { demandaId: string; podeEditar: boolean }) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ titulo: "", obrigatorio: true, itens: "" });
  const [itemNovo, setItemNovo] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setChecklists(await api.listarChecklists(demandaId));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar os checklists");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    const itens = form.itens.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!form.titulo.trim()) return notify.error("Dê um título ao checklist");
    if (!itens.length) return notify.error("Liste ao menos um item, um por linha");
    setSalvando(true);
    try {
      await api.criarChecklist(demandaId, {
        titulo: form.titulo.trim(),
        obrigatorio: form.obrigatorio,
        // Prefixar com "@" marca o item como "só fecha com documento".
        itens: itens.map((linha) => ({
          descricao: linha.replace(/^@\s*/, ""),
          exige_documento: linha.startsWith("@"),
        })),
      });
      notify.success("Checklist criado");
      setNovo(false);
      setForm({ titulo: "", obrigatorio: true, itens: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível criar o checklist");
    } finally {
      setSalvando(false);
    }
  };

  const concluir = async (checklistId: string, itemId: string, exigeDocumento: boolean) => {
    if (exigeDocumento) {
      const documentoId = window.prompt(
        "Este item só fecha com documento. Cole o id do documento desta demanda (aba Documentos):"
      );
      if (!documentoId) return;
      try {
        await api.concluirItemChecklist(demandaId, checklistId, itemId, { documento_id: documentoId.trim() });
        await carregar();
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "Não foi possível concluir o item");
      }
      return;
    }
    try {
      await api.concluirItemChecklist(demandaId, checklistId, itemId, {});
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível concluir o item");
    }
  };

  const reabrir = async (checklistId: string, itemId: string) => {
    const motivo = window.prompt("Reabrir retira uma afirmação do registro. Qual o motivo?");
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) notify.error("Informe um motivo com ao menos 5 caracteres");
      return;
    }
    try {
      await api.reabrirItemChecklist(demandaId, checklistId, itemId, motivo.trim());
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível reabrir o item");
    }
  };

  const adicionarItem = async (checklistId: string) => {
    const descricao = (itemNovo[checklistId] ?? "").trim();
    if (!descricao) return;
    try {
      await api.adicionarItemChecklist(demandaId, checklistId, { descricao });
      setItemNovo({ ...itemNovo, [checklistId]: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível adicionar o item");
    }
  };

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  const bloqueios = checklists.flatMap((c) =>
    c.obrigatorio ? c.itens.filter((i) => i.obrigatorio && !i.concluido_em).map((i) => `${c.titulo}: ${i.descricao}`) : []
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900">Checklists</h2>
          <p className="text-sm text-slate-600">O que precisa estar pronto antes de avançar.</p>
        </div>
        {podeEditar && (
          <button onClick={() => setNovo((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus className="h-4 w-4" />Novo checklist
          </button>
        )}
      </div>

      {bloqueios.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-700" />
          <div className="text-sm text-red-800">
            <p className="font-bold">A demanda não pode ser concluída enquanto faltar:</p>
            <ul className="mt-1 list-inside list-disc">
              {bloqueios.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        </div>
      )}

      {novo && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <label className="block text-xs font-semibold text-slate-600">
            Título *
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Formalização do pedido" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Itens, um por linha. Comece a linha com @ para exigir documento.
            <textarea value={form.itens} onChange={(e) => setForm({ ...form, itens: e.target.value })} rows={5} placeholder={"@Ofício assinado\nPlano de Trabalho\n@Certidão negativa"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-normal text-slate-800" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.obrigatorio} onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })} className="h-4 w-4" />
            Obrigatório — impede a conclusão da demanda enquanto houver item pendente
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setNovo(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
            <button onClick={criar} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {salvando ? "Criando…" : "Criar checklist"}
            </button>
          </div>
        </div>
      )}

      {!checklists.length && !novo && (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Nenhum checklist nesta demanda.
        </p>
      )}

      {checklists.map((c) => (
        <article key={c.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">
                {c.titulo}
                {c.obrigatorio && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">OBRIGATÓRIO</span>}
              </h3>
              <span className="text-sm font-semibold text-slate-600">{c.concluidos} de {c.total} completos</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-600" style={{ width: `${c.total ? (c.concluidos / c.total) * 100 : 0}%` }} />
            </div>
          </header>

          <ul className="divide-y divide-slate-100">
            {c.itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <button
                  onClick={() => (i.concluido_em ? reabrir(c.id, i.id) : concluir(c.id, i.id, i.exige_documento))}
                  disabled={!podeEditar}
                  title={i.concluido_em ? "Reabrir item" : "Marcar como concluído"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 disabled:opacity-50 ${
                    i.concluido_em ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-transparent hover:border-blue-500"
                  }`}
                >
                  {i.concluido_em ? <Check className="h-4 w-4" /> : <RotateCcw className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${i.concluido_em ? "text-slate-500 line-through" : "font-medium text-slate-800"}`}>
                    {i.descricao}
                    {i.exige_documento && <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-slate-400" />}
                    {!i.obrigatorio && <span className="ml-2 text-xs text-slate-400">(opcional)</span>}
                  </p>
                  {i.concluido_em && <p className="mt-0.5 text-xs text-slate-500">Concluído em {formatDate(i.concluido_em)}</p>}
                </div>
              </li>
            ))}
          </ul>

          {podeEditar && (
            <div className="flex gap-2 border-t border-slate-100 bg-slate-50 p-4">
              <input
                value={itemNovo[c.id] ?? ""}
                onChange={(e) => setItemNovo({ ...itemNovo, [c.id]: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") adicionarItem(c.id); }}
                placeholder="Adicionar item…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              />
              <button onClick={() => adicionarItem(c.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-500">
                Adicionar
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
