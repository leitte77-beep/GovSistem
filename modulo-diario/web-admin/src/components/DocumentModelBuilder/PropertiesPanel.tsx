"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  DocumentField,
  DocumentFieldType,
  DocumentLayout,
  DocumentModelConfig,
  DocumentSection,
} from "@/types/document_model";
import type { Authority } from "@/types/matter";
import { FIELD_TYPE_LABEL, SECTION_KIND_LABEL, findSection } from "./constants";

interface SigningCredential {
  id: string;
  label: string;
  is_active: boolean;
  certificate_subject?: string | null;
}

const POSITION_OPTIONS: { value: "left" | "center" | "right"; label: string }[] = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centralizado" },
  { value: "right", label: "Direita" },
];

interface Props {
  config: DocumentModelConfig;
  layout: DocumentLayout;
  selectedSectionId: string | null;
  selectedFieldKey: string | null;
  readOnly?: boolean;
  onUpdateConfig: (patch: Partial<DocumentModelConfig>) => void;
  onUpdateLayout: (patch: Partial<DocumentLayout>) => void;
  onUpdateSection: (id: string, patch: Partial<DocumentSection>) => void;
  onUpdateField: (key: string, patch: Partial<DocumentField>) => void;
  onDeleteSection: (id: string) => void;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

function ConditionalEditor({
  fields,
  whenField,
  whenValue,
  onChange,
  readOnly,
}: {
  fields: DocumentField[];
  whenField?: string | null;
  whenValue?: string | null;
  onChange: (patch: { when_field?: string | null; when_value?: string | null }) => void;
  readOnly?: boolean;
}) {
  const selectedField = fields.find((f) => f.key === whenField);
  const active = Boolean(whenField);
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
        <input
          type="checkbox"
          checked={active}
          disabled={readOnly}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { when_field: fields[0]?.key ?? null, when_value: "" }
                : { when_field: null, when_value: null }
            )
          }
        />
        Exibir apenas sob condição
      </label>
      {active && (
        <div className="mt-2 space-y-2">
          <div>
            <span className={labelCls}>Campo</span>
            <select
              className={inputCls}
              value={whenField ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ when_field: e.target.value || null })}
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>é igual a</span>
            {selectedField?.type === "select" && (selectedField.options?.length ?? 0) > 0 ? (
              <select
                className={inputCls}
                value={whenValue ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange({ when_value: e.target.value })}
              >
                <option value="">— selecione —</option>
                {selectedField.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputCls}
                value={whenValue ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange({ when_value: e.target.value })}
                placeholder="valor"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldProperties({
  config,
  field,
  readOnly,
  onUpdateField,
}: {
  config: DocumentModelConfig;
  field: DocumentField;
  readOnly?: boolean;
  onUpdateField: (key: string, patch: Partial<DocumentField>) => void;
}) {
  const numeric = field.type === "integer" || field.type === "decimal" || field.type === "money";
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Propriedades do campo</h3>
      <div>
        <span className={labelCls}>Nome (rótulo)</span>
        <input
          className={inputCls}
          value={field.label}
          disabled={readOnly}
          onChange={(e) => onUpdateField(field.key, { label: e.target.value })}
        />
      </div>
      <div>
        <span className={labelCls}>Chave interna</span>
        <input
          className={`${inputCls} font-mono`}
          value={field.key}
          disabled={readOnly}
          onChange={(e) =>
            onUpdateField(field.key, { key: e.target.value.replace(/[^a-z0-9_]/g, "") })
          }
        />
        <p className="mt-1 text-[11px] text-gray-400">
          Usada em {"{{" + field.key + "}}"}. Alterar a chave não atualiza textos existentes.
        </p>
      </div>
      <div>
        <span className={labelCls}>Tipo</span>
        <select
          className={inputCls}
          value={field.type}
          disabled={readOnly}
          onChange={(e) =>
            onUpdateField(field.key, { type: e.target.value as DocumentFieldType })
          }
        >
          {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {field.type === "select" && (
        <div>
          <span className={labelCls}>Opções (uma por linha)</span>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={(field.options ?? []).join("\n")}
            disabled={readOnly}
            onChange={(e) =>
              onUpdateField(field.key, {
                options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={Boolean(field.required)}
          disabled={readOnly}
          onChange={(e) => onUpdateField(field.key, { required: e.target.checked })}
        />
        Obrigatório
      </label>
      {numeric && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>Mínimo</span>
            <input
              type="number"
              className={inputCls}
              value={field.min_value ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateField(field.key, {
                  min_value: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <span className={labelCls}>Máximo</span>
            <input
              type="number"
              className={inputCls}
              value={field.max_value ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateField(field.key, {
                  max_value: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}
      <div>
        <span className={labelCls}>Ajuda (opcional)</span>
        <input
          className={inputCls}
          value={field.help ?? ""}
          disabled={readOnly}
          onChange={(e) => onUpdateField(field.key, { help: e.target.value })}
        />
      </div>
      <ConditionalEditor
        fields={config.fields.filter((f) => f.key !== field.key)}
        whenField={field.required_when?.[0]?.field ?? null}
        whenValue={field.required_when?.[0]?.value ?? null}
        readOnly={readOnly}
        onChange={(patch) =>
          onUpdateField(field.key, {
            required_when: patch.when_field
              ? [{ field: patch.when_field, value: patch.when_value ?? "" }]
              : [],
          })
        }
      />
    </div>
  );
}

function SignatureProperties({
  section,
  readOnly,
  onUpdateSection,
}: {
  section: DocumentSection;
  readOnly?: boolean;
  onUpdateSection: (id: string, patch: Partial<DocumentSection>) => void;
}) {
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [credentials, setCredentials] = useState<SigningCredential[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.listAuthorities({ active_only: true }).catch(() => []),
      api.listSigningCredentials().catch(() => []),
    ]).then(([auths, creds]) => {
      if (!active) return;
      setAuthorities(auths);
      setCredentials((creds as SigningCredential[]).filter((c) => c.is_active));
    });
    return () => {
      active = false;
    };
  }, []);

  const setEntry = (idx: number, patch: Record<string, unknown>) => {
    const entries = [...(section.entries ?? [])];
    entries[idx] = { ...entries[idx], ...patch };
    onUpdateSection(section.id, { entries });
  };

  const pickAuthority = (idx: number, authorityId: string) => {
    const authority = authorities.find((a) => a.id === authorityId);
    setEntry(idx, {
      authority_id: authorityId || null,
      ...(authority ? { name: authority.name, role: authority.role ?? "" } : {}),
    });
  };

  return (
    <div className="space-y-3">
      {(section.entries ?? []).map((entry, idx) => (
        <div key={idx} className="space-y-2 rounded-lg border border-gray-200 p-2">
          <div>
            <span className={labelCls}>Autoridade (cadastro)</span>
            <select
              className={inputCls}
              value={entry.authority_id ?? ""}
              disabled={readOnly}
              onChange={(e) => pickAuthority(idx, e.target.value)}
            >
              <option value="">— preencher manualmente —</option>
              {authorities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.role ? ` · ${a.role}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>Nome</span>
            <input
              className={inputCls}
              value={entry.name ?? ""}
              disabled={readOnly}
              onChange={(e) => setEntry(idx, { name: e.target.value })}
            />
          </div>
          <div>
            <span className={labelCls}>Cargo</span>
            <input
              className={inputCls}
              value={entry.role ?? ""}
              disabled={readOnly}
              onChange={(e) => setEntry(idx, { role: e.target.value })}
            />
          </div>
          <div>
            <span className={labelCls}>Certificado de assinatura</span>
            <select
              className={inputCls}
              value={entry.credential_id ?? ""}
              disabled={readOnly}
              onChange={(e) => setEntry(idx, { credential_id: e.target.value || null })}
            >
              <option value="">— não vinculado —</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.certificate_subject ? ` · ${c.certificate_subject}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>Posição visual</span>
            <select
              className={inputCls}
              value={entry.position ?? "center"}
              disabled={readOnly}
              onChange={(e) => setEntry(idx, { position: e.target.value })}
            >
              {POSITION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {!readOnly && (section.entries ?? []).length > 1 && (
            <button
              type="button"
              onClick={() =>
                onUpdateSection(section.id, {
                  entries: (section.entries ?? []).filter((_, i) => i !== idx),
                })
              }
              className="text-xs text-red-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
            >
              Remover esta assinatura
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() =>
            onUpdateSection(section.id, {
              entries: [...(section.entries ?? []), { name: "", role: "", position: "center" }],
            })
          }
          className="text-xs text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          + Adicionar assinatura
        </button>
      )}
    </div>
  );
}

function SectionProperties({
  config,
  section,
  readOnly,
  onUpdateSection,
  onDeleteSection,
}: {
  config: DocumentModelConfig;
  section: DocumentSection;
  readOnly?: boolean;
  onUpdateSection: (id: string, patch: Partial<DocumentSection>) => void;
  onDeleteSection: (id: string) => void;
}) {
  const isSignature = section.kind === "signature_block";
  const isHeading = section.kind === "heading";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {SECTION_KIND_LABEL[section.kind]}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onDeleteSection(section.id)}
            className="text-xs text-red-600 hover:underline"
          >
            Excluir
          </button>
        )}
      </div>

      {isSignature ? (
        <SignatureProperties
          section={section}
          readOnly={readOnly}
          onUpdateSection={onUpdateSection}
        />
      ) : (
        <>
          <div>
            <span className={labelCls}>Texto</span>
            <textarea
              className={`${inputCls} min-h-[110px] font-mono text-xs`}
              value={section.text ?? ""}
              disabled={readOnly}
              onChange={(e) => onUpdateSection(section.id, { text: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Insira campos pelo painel esquerdo; eles aparecem como {"{{campo}}"}.
            </p>
          </div>
          {section.kind === "article" && (
            <div>
              <span className={labelCls}>Número do artigo (opcional)</span>
              <input
                className={inputCls}
                value={section.number ?? ""}
                disabled={readOnly}
                placeholder="vazio = numeração automática"
                onChange={(e) =>
                  onUpdateSection(section.id, { number: e.target.value || null })
                }
              />
            </div>
          )}
          {isHeading && (
            <div>
              <span className={labelCls}>Nível</span>
              <select
                className={inputCls}
                value={section.level ?? 1}
                disabled={readOnly}
                onChange={(e) => onUpdateSection(section.id, { level: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    Título {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <div>
        <span className={labelCls}>Alinhamento</span>
        <select
          className={inputCls}
          value={section.alignment ?? "justify"}
          disabled={readOnly}
          onChange={(e) => onUpdateSection(section.id, { alignment: e.target.value })}
        >
          <option value="left">Esquerda</option>
          <option value="center">Centralizado</option>
          <option value="right">Direita</option>
          <option value="justify">Justificado</option>
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <h4 className="mb-2 text-xs font-semibold text-gray-700">Proteção e IA</h4>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(section.fixed_text)}
            disabled={readOnly}
            onChange={(e) => onUpdateSection(section.id, { fixed_text: e.target.checked })}
          />
          Texto fixo (não deve variar entre minutas)
        </label>
        <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(section.locked)}
            disabled={readOnly}
            onChange={(e) => onUpdateSection(section.id, { locked: e.target.checked })}
          />
          Protegido (a IA não pode alterar)
        </label>
        <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(section.ai_generated)}
            disabled={readOnly}
            onChange={(e) => onUpdateSection(section.id, { ai_generated: e.target.checked })}
          />
          Gerado pela IA (redação variável)
        </label>
      </div>

      <ConditionalEditor
        fields={config.fields}
        whenField={section.when_field}
        whenValue={section.when_value}
        readOnly={readOnly}
        onChange={(patch) => onUpdateSection(section.id, patch)}
      />
    </div>
  );
}

function ModelProperties({
  config,
  layout,
  readOnly,
  onUpdateConfig,
  onUpdateLayout,
}: {
  config: DocumentModelConfig;
  layout: DocumentLayout;
  readOnly?: boolean;
  onUpdateConfig: (patch: Partial<DocumentModelConfig>) => void;
  onUpdateLayout: (patch: Partial<DocumentLayout>) => void;
}) {
  const margins = layout.margins ?? { top: 20, right: 18, bottom: 20, left: 18 };
  const font = layout.body_font ?? { family: "Times New Roman", size: 12, line_height: 1.5, color: "#000000" };
  const header = layout.header ?? {};
  const footer = layout.footer ?? {};
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Documento</h3>
        <div className="space-y-3">
          <div>
            <span className={labelCls}>Título do documento</span>
            <input
              className={inputCls}
              value={config.document_title ?? ""}
              disabled={readOnly}
              onChange={(e) => onUpdateConfig({ document_title: e.target.value })}
            />
          </div>
          <div>
            <span className={labelCls}>Súmula / ementa</span>
            <textarea
              className={`${inputCls} min-h-[60px]`}
              value={config.summary ?? ""}
              disabled={readOnly}
              onChange={(e) => onUpdateConfig({ summary: e.target.value })}
            />
          </div>
          <div>
            <span className={labelCls}>Finalidade</span>
            <input
              className={inputCls}
              value={config.purpose}
              disabled={readOnly}
              onChange={(e) => onUpdateConfig({ purpose: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Página e tipografia</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>Tamanho</span>
            <select
              className={inputCls}
              value={layout.page_size ?? "A4"}
              disabled={readOnly}
              onChange={(e) => onUpdateLayout({ page_size: e.target.value })}
            >
              {["A4", "A3", "LETTER", "LEGAL"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelCls}>Orientação</span>
            <select
              className={inputCls}
              value={layout.orientation ?? "portrait"}
              disabled={readOnly}
              onChange={(e) => onUpdateLayout({ orientation: e.target.value })}
            >
              <option value="portrait">Retrato</option>
              <option value="landscape">Paisagem</option>
            </select>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>Fonte</span>
            <input
              className={inputCls}
              value={font.family}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateLayout({ body_font: { ...font, family: e.target.value } })
              }
            />
          </div>
          <div>
            <span className={labelCls}>Tamanho (pt)</span>
            <input
              type="number"
              className={inputCls}
              value={font.size}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateLayout({ body_font: { ...font, size: Number(e.target.value) } })
              }
            />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <div key={side}>
              <span className={labelCls}>{side === "top" ? "Sup" : side === "bottom" ? "Inf" : side === "left" ? "Esq" : "Dir"} (mm)</span>
              <input
                type="number"
                className={inputCls}
                value={margins[side]}
                disabled={readOnly}
                onChange={(e) =>
                  onUpdateLayout({ margins: { ...margins, [side]: Number(e.target.value) } })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Cabeçalho</h3>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={header.enabled ?? true}
            disabled={readOnly}
            onChange={(e) => onUpdateLayout({ header: { ...header, enabled: e.target.checked } })}
          />
          Exibir cabeçalho institucional
        </label>
        {header.enabled && (
          <div className="mt-2 space-y-1 text-sm text-gray-700">
            {(
              [
                ["show_coat_of_arms", "Brasão"],
                ["show_institution_name", "Nome do município"],
                ["show_address", "Endereço"],
                ["show_cnpj", "CNPJ"],
                ["show_phone", "Telefone"],
                ["show_site", "Site"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(header[key] ?? true)}
                  disabled={readOnly}
                  onChange={(e) =>
                    onUpdateLayout({ header: { ...header, [key]: e.target.checked } })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Rodapé</h3>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={footer.enabled ?? true}
            disabled={readOnly}
            onChange={(e) => onUpdateLayout({ footer: { ...footer, enabled: e.target.checked } })}
          />
          Exibir rodapé
        </label>
        {footer.enabled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={footer.show_page_numbers ?? true}
              disabled={readOnly}
              onChange={(e) =>
                onUpdateLayout({ footer: { ...footer, show_page_numbers: e.target.checked } })
              }
            />
            Numeração de páginas
          </label>
        )}
      </div>
    </div>
  );
}

export default function PropertiesPanel({
  config,
  layout,
  selectedSectionId,
  selectedFieldKey,
  readOnly,
  onUpdateConfig,
  onUpdateLayout,
  onUpdateSection,
  onUpdateField,
  onDeleteSection,
}: Props) {
  const section = selectedSectionId ? findSection(config.sections, selectedSectionId) : null;
  const field = config.fields.find((f) => f.key === selectedFieldKey) ?? null;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Propriedades</h2>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {field ? (
          <FieldProperties
            config={config}
            field={field}
            readOnly={readOnly}
            onUpdateField={onUpdateField}
          />
        ) : section ? (
          <SectionProperties
            config={config}
            section={section}
            readOnly={readOnly}
            onUpdateSection={onUpdateSection}
            onDeleteSection={onDeleteSection}
          />
        ) : (
          <ModelProperties
            config={config}
            layout={layout}
            readOnly={readOnly}
            onUpdateConfig={onUpdateConfig}
            onUpdateLayout={onUpdateLayout}
          />
        )}
      </div>
    </aside>
  );
}
