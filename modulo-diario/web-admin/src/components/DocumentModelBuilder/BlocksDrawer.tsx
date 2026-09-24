"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type {
  DocumentModelBlock,
  DocumentSection,
  DocumentSectionKind,
} from "@/types/document_model";
import {
  ROOT_ELEMENTS,
  SECTION_KIND_LABEL,
  instantiateSections,
  sectionFromKind,
} from "./constants";

interface Props {
  open: boolean;
  onClose: () => void;
  draftSections?: DocumentSection[];
  canManage: boolean;
  onInsertSections: (sections: DocumentSection[]) => void;
}

function blockSummary(block: DocumentModelBlock): string {
  const sections = block.content_json?.sections ?? [];
  const text = sections
    .map((s) => s.text)
    .filter(Boolean)
    .join(" ")
    .trim();
  if (text) return text;
  return sections.length > 0
    ? `${sections.length} elemento(s)`
    : (block.description ?? "Bloco vazio");
}

export default function BlocksDrawer({
  open,
  onClose,
  draftSections,
  canManage,
  onInsertSections,
}: Props) {
  const [blocks, setBlocks] = useState<DocumentModelBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<DocumentSectionKind>("paragraph");
  const [newText, setNewText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBlocks(await api.listDocumentModelBlocks());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar blocos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setSaveName("");
      setShowNew(false);
      load();
    }
  }, [open, load]);

  useEscapeKey(open, onClose);

  if (!open) return null;

  const insert = (block: DocumentModelBlock) => {
    const raw = block.content_json?.sections ?? [];
    let sections = raw;
    if (sections.length === 0 && block.content_json?.text) {
      sections = [sectionFromKind(block.kind as DocumentSectionKind, String(block.content_json.text))];
    }
    if (sections.length === 0) {
      toast.error("Este bloco não possui conteúdo.");
      return;
    }
    onInsertSections(instantiateSections(sections));
    toast.success(`Bloco "${block.name}" inserido.`);
  };

  const saveSelection = async () => {
    if (!draftSections || draftSections.length === 0) return;
    const name = saveName.trim();
    if (!name) {
      toast.error("Informe um nome para o bloco.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createDocumentModelBlock({
        name,
        kind: draftSections[0].kind,
        content_json: { sections: draftSections },
      });
      toast.success("Bloco salvo na biblioteca.");
      setSaveName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar bloco.");
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Informe um nome para o bloco.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const section = sectionFromKind(newKind, newText);
      await api.createDocumentModelBlock({
        name,
        kind: newKind,
        content_json: { sections: [section] },
      });
      toast.success("Bloco criado.");
      setNewName("");
      setNewText("");
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar bloco.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (block: DocumentModelBlock) => {
    if (!window.confirm(`Excluir o bloco "${block.name}" da biblioteca?`)) return;
    setBusy(true);
    try {
      await api.deleteDocumentModelBlock(block.id);
      toast.success("Bloco excluído.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir bloco.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Biblioteca de blocos"
        className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Biblioteca de blocos</h2>
            <p className="text-xs text-gray-500">
              Reutilize trechos padrão (cabeçalho, assinatura, comandos) em qualquer modelo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>
          )}

          {draftSections && draftSections.length > 0 && canManage && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                Salvar seleção atual como bloco
              </h3>
              <div className="mt-2 flex gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Ex.: Registre-se e Publique-se"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={saveSelection}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
              <p className="mt-1 text-xs text-blue-700">
                {draftSections.length} elemento(s) selecionado(s) será(ão) salvos.
              </p>
            </div>
          )}

          {canManage && (
            <div className="rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">add_box</span>
                  Criar bloco de texto
                </span>
                <span className="material-symbols-outlined text-base">
                  {showNew ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showNew && (
                <div className="space-y-2 border-t border-gray-100 px-4 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome do bloco"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={newKind}
                      onChange={(e) => setNewKind(e.target.value as DocumentSectionKind)}
                      aria-label="Tipo do bloco"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {ROOT_ELEMENTS.map((e) => (
                        <option key={e.kind} value={e.kind}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    rows={2}
                    placeholder="Texto do bloco (pode conter {{campos}})"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={createNew}
                    disabled={busy}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Criar bloco
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Blocos disponíveis
            </h3>
            {loading ? (
              <p className="text-sm text-gray-500">Carregando…</p>
            ) : blocks.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhum bloco na biblioteca. Selecione um elemento no documento e salve como bloco.
              </p>
            ) : (
              <ul className="space-y-2">
                {blocks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{b.name}</div>
                      <div className="text-xs text-gray-500">
                        {SECTION_KIND_LABEL[b.kind as DocumentSectionKind] ?? b.kind}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{blockSummary(b)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => insert(b)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <span className="material-symbols-outlined text-[15px]">add</span>
                        Inserir
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => remove(b)}
                          disabled={busy}
                          aria-label={`Excluir bloco ${b.name}`}
                          className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
