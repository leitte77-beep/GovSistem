"use client";

import type { DocumentField, DocumentModelConfig } from "@/types/document_model";
import {
  ARTICLE_CHILD_ELEMENTS,
  FIELD_TYPE_LABEL,
  ROOT_ELEMENTS,
  type ElementDef,
} from "./constants";

interface Props {
  config: DocumentModelConfig;
  selectedSectionId: string | null;
  selectedFieldKey: string | null;
  readOnly?: boolean;
  onAddElement: (def: ElementDef) => void;
  onAddChildElement: (parentId: string, def: ElementDef) => void;
  onAddField: () => void;
  onSelectField: (key: string) => void;
  onDeleteField: (key: string) => void;
  onInsertField: (key: string) => void;
  onOpenBlocks: () => void;
  onSaveSelectionAsBlock: () => void;
  canManageBlocks?: boolean;
}

export default function ElementsPanel({
  config,
  selectedSectionId,
  selectedFieldKey,
  readOnly,
  onAddElement,
  onAddChildElement,
  onAddField,
  onSelectField,
  onDeleteField,
  onInsertField,
  onOpenBlocks,
  onSaveSelectionAsBlock,
  canManageBlocks,
}: Props) {
  const selected = config.sections.find((s) => s.id === selectedSectionId);
  const isArticleSelected = selected?.kind === "article";

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Elementos e campos</h2>
        <p className="text-xs text-gray-500">Monte o documento sem escrever JSON.</p>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Elementos
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {ROOT_ELEMENTS.map((def) => (
            <button
              key={def.kind}
              type="button"
              disabled={readOnly}
              onClick={() => onAddElement(def)}
              title={def.description}
              className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 text-center text-xs text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px] text-gray-500">
                {def.icon}
              </span>
              {def.label}
            </button>
          ))}
        </div>

        {isArticleSelected && (
          <>
            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Dentro do artigo
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {ARTICLE_CHILD_ELEMENTS.map((def) => (
                <button
                  key={def.kind}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onAddChildElement(selected!.id, def)}
                  title={def.description}
                  className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 text-center text-xs text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[20px] text-gray-500">
                    {def.icon}
                  </span>
                  {def.label}
                </button>
              ))}
            </div>
          </>
        )}

        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Blocos reutilizáveis
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenBlocks}
            title="Abrir a biblioteca de blocos"
            className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 text-center text-xs text-gray-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="material-symbols-outlined text-[20px] text-gray-500">widgets</span>
            Biblioteca
          </button>
          <button
            type="button"
            disabled={readOnly || !selectedSectionId || !canManageBlocks}
            onClick={onSaveSelectionAsBlock}
            title={
              selectedSectionId
                ? "Salvar o elemento selecionado como bloco"
                : "Selecione um elemento no documento primeiro"
            }
            className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 text-center text-xs text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px] text-gray-500">bookmark_add</span>
            Salvar seleção
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Campos dinâmicos
          </h3>
          <button
            type="button"
            disabled={readOnly}
            onClick={onAddField}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Campo
          </button>
        </div>

        {config.fields.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Nenhum campo. Crie campos para preencher o documento.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {config.fields.map((field: DocumentField) => (
              <li
                key={field.key}
                className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                  selectedFieldKey === field.key
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onSelectField(field.key)}
                >
                  <span className="font-medium text-gray-800">{field.label}</span>
                  <span className="ml-1 text-gray-500">
                    {FIELD_TYPE_LABEL[field.type]}
                    {field.required ? " · obrigatório" : ""}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-blue-600">
                    {`{{${field.key}}}`}
                  </span>
                </button>
                {!readOnly && (
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onInsertField(field.key)}
                      title="Inserir no texto selecionado"
                      className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        input
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteField(field.key)}
                      title="Remover campo"
                      className="rounded p-0.5 text-red-500 hover:bg-red-50"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
