"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import type { ActType } from "@/types/matter";
import type {
  AiExtractResult,
  DocumentModelSummary,
  MaterialCreated,
  NumberIssue,
  PreviewResult,
  VersionDetail,
} from "@/types/document_model";

const TIPO_INFO: Record<string, { label: string; plural: string; desc: string }> = {
  edital: { label: "Edital", plural: "Editais", desc: "Convocação, licitação ou aviso público." },
  portaria: { label: "Portaria", plural: "Portarias", desc: "Ato interno (nomeação, férias etc.)." },
  lei: { label: "Lei", plural: "Leis", desc: "Norma sancionada." },
  oficio: { label: "Ofício", plural: "Ofícios", desc: "Comunicação oficial entre órgãos." },
  decreto: { label: "Decreto", plural: "Decretos", desc: "Ato normativo do Executivo." },
  resolucao: { label: "Resolução", plural: "Resoluções", desc: "Decisão de conselho/colegiado." },
};

interface FieldSpec {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  help?: string;
}

export default function CriarDocumentoPage() {
  const [tipo, setTipo] = useState("portaria");
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<DocumentModelSummary[]>([]);
  const [modelId, setModelId] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [fields, setFields] = useState<FieldSpec[]>([]);
  const [actTypes, setActTypes] = useState<ActType[]>([]);
  const [actTypeId, setActTypeId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<AiExtractResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [material, setMaterial] = useState<MaterialCreated | null>(null);
  const [number, setNumber] = useState<NumberIssue | null>(null);
  const [busy, setBusy] = useState(false);

  const info = TIPO_INFO[tipo];

  const loadModels = useCallback(async () => {
    setModels([]);
    setModelId("");
    setVersion(null);
    setFields([]);
    setMaterial(null);
    setNumber(null);
    setPreview(null);
    setExtracted(null);
    setValues({});
    const active = (await api.listDocumentModels({ document_type: tipo, status: "active" })).filter(
      (m) => m.active_version
    );
    setModels(active);
    const chosen = active.find((m) => m.is_default) ?? (active.length === 1 ? active[0] : null);
    if (chosen) setModelId(chosen.id);
  }, [tipo]);

  useEffect(() => {
    api
      .listActTypes()
      .then((at) => {
        setActTypes(at);
        const label = TIPO_INFO[tipo]?.label.toLowerCase() ?? tipo;
        const match =
          at.find((a) => a.name.toLowerCase() === label) ??
          at.find((a) => a.name.toLowerCase().includes(label));
        if (match) setActTypeId(match.id);
      })
      .catch((err) => notifyError("criar.acttypes", err));
  }, [tipo]);

  useEffect(() => {
    if (tipo) loadModels().catch((err) => notifyError("criar.models", err));
  }, [tipo, loadModels]);

  // Carrega os campos da versão ativa quando um modelo é selecionado.
  useEffect(() => {
    if (!modelId) {
      setFields([]);
      setVersion(null);
      return;
    }
    const model = models.find((m) => m.id === modelId);
    if (!model?.active_version) return;
    setVersion(model.active_version);
    api
      .getVersion(modelId, model.active_version)
      .then((vd: VersionDetail) => {
        const cfg = (vd.config ?? {}) as { fields?: FieldSpec[] };
        setFields(cfg.fields ?? []);
      })
      .catch((err) => notifyError("criar.fields", err));
  }, [modelId, models]);

  const activeModel = useMemo(() => models.find((m) => m.id === modelId) ?? null, [models, modelId]);
  const tipoActType = useMemo(
    () => actTypes.find((a) => a.id === actTypeId) ?? null,
    [actTypes, actTypeId]
  );

  const setField = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const analyze = async () => {
    if (!prompt.trim()) {
      toast.error("Descreva o documento que deseja criar.");
      return;
    }
    if (!modelId) {
      toast.error("Nenhum modelo aprovado para este tipo. Cadastre/aprove um modelo antes.");
      return;
    }
    setAnalyzing(true);
    setPreview(null);
    setExtracted(null);
    try {
      const r = await api.aiExtract({ prompt: prompt.trim(), document_type: tipo, model_id: modelId });
      setExtracted(r);
      if (r.ambiguity && r.candidates.length) {
        toast.error("Mais de um modelo ativo; selecione um explicitamente.");
        return;
      }
      if (r.matched_model) {
        // Preenche o formulário: extraído prevalece; preserva só o que o
        // usuário já digitou e que a IA não retornou.
        setValues((prev) => {
          const merged: Record<string, string> = { ...r.values };
          for (const [k, v] of Object.entries(prev)) {
            if (v && merged[k] === undefined) merged[k] = v;
          }
          return merged;
        });
        if (r.note) toast(r.note);
        else if (r.complete) toast.success("Campos identificados a partir do pedido.");
      }
    } catch (err) {
      notifyError("criar.analyze", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const doPreview = async () => {
    if (!modelId || version == null) return;
    setBusy(true);
    try {
      const p = await api.previewVersion(modelId, version, values);
      setPreview(p);
      if (!p.complete) toast.error("Há pendências a preencher antes de gerar.");
    } catch (err) {
      notifyError("criar.preview", err);
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!modelId || version == null || !actTypeId) {
      toast.error("Selecione o tipo de ato (e o modelo) para gerar.");
      return;
    }
    setBusy(true);
    try {
      const m = await api.createMaterialFromModel(modelId, version, {
        act_type_id: actTypeId,
        values,
      });
      setMaterial(m);
      toast.success("Minuta gerada e salva como matéria (rascunho, sem número).");
    } catch (err) {
      notifyError("criar.generate", err);
    } finally {
      setBusy(false);
    }
  };

  const emitNumber = async () => {
    if (!material) return;
    setBusy(true);
    try {
      const n = await api.issueNumber({ matter_id: material.id });
      setNumber(n);
      toast.success(`Número ${n.number}/${n.year} atribuído.`);
    } catch (err) {
      notifyError("criar.number", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-gutter max-w-4xl">
      <PageHeader
        title="Criar documento com IA"
        description="Gera uma minuta fiel ao modelo documental aprovado do tipo escolhido, usando exclusivamente o DeepSeek V4 Flash cadastrado."
      />

      {/* Passo 1 — tipo e modelo */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">1 · Tipo e modelo</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Tipo de documento</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {Object.entries(TIPO_INFO).map(([k, v]) => (
                <option key={k} value={k}>{v.plural}</option>
              ))}
            </select>
            {info && <span className="mt-1 block text-xs text-gray-400">{info.desc}</span>}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Modelo aprovado</span>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecione…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.is_default ? "(padrão)" : ""} · v{m.active_version}
                </option>
              ))}
            </select>
            {models.length === 0 && (
              <span className="mt-1 block text-xs text-amber-600">
                Sem modelo aprovado para este tipo — cadastre/aprove um em “Modelos documentais”.
              </span>
            )}
          </label>
        </div>

        {activeModel && (
          <div className="mt-3 text-sm text-gray-600">
            Modelo: <strong>{activeModel.name}</strong> · finalidade: <em>{activeModel.purpose}</em>
          </div>
        )}
      </section>

      {/* Passo 2 — pedido */}
      {activeModel && version != null && (
        <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            2 · Descreva o documento
          </h3>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder='Ex.: "Conceder 30 dias de férias ao servidor João, a partir de 1º de outubro de 2026."'
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={analyze}
              disabled={analyzing}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">smart_toy</span>
              {analyzing ? "Analisando…" : "Identificar campos com IA"}
            </button>
            <span className="text-xs text-gray-400">
              Se não houver chave cadastrada, preencha os campos manualmente abaixo.
            </span>
          </div>
          {extracted && extracted.note && !extracted.matched_model && (
            <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">{extracted.note}</p>
          )}
        </section>
      )}

      {/* Passo 3 — dados */}
      {activeModel && version != null && fields.length > 0 && (
        <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">3 · Dados do documento</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">
                  {f.label} {f.required ? <span className="text-red-500">*</span> : null}
                </span>
                <FieldInput field={f} value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
                {f.help && <span className="mt-1 block text-xs text-gray-400">{f.help}</span>}
              </label>
            ))}
          </div>

          {/* Tipo de ato (matéria) */}
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Tipo de ato (matéria)</span>
            <select value={actTypeId} onChange={(e) => setActTypeId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecione…</option>
              {actTypes.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {!tipoActType && (
              <span className="mt-1 block text-xs text-amber-600">
                Nenhum tipo de ato compatível encontrado. Crie em “Tipos de Ato” (ex.: {info?.label}).
              </span>
            )}
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={doPreview}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">preview</span>
              Pré-visualizar minuta
            </button>
            <button
              onClick={generate}
              disabled={busy || !preview?.complete}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              title={preview && !preview.complete ? "Resolva as pendências da pré-visualização" : ""}
            >
              <span className="material-symbols-outlined text-base">description</span>
              Gerar minuta (matéria)
            </button>
          </div>

          {preview && (
            <div className={`mt-4 rounded-lg border p-3 text-sm ${preview.complete ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="font-medium text-gray-800">
                Pré-visualização: {preview.complete ? "pronta" : "com pendências"}
              </div>
              {preview.pending.map((p) => (
                <div key={p.field ?? p.code} className="text-xs text-amber-700">
                  • {p.message}
                </div>
              ))}
              {preview.canonical_text && (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-white p-3 font-mono text-xs text-gray-700">
                  {preview.canonical_text}
                </pre>
              )}
            </div>
          )}
        </section>
      )}

      {/* Passo 4 — resultado e número */}
      {material && (
        <section className="mt-4 rounded-xl border border-green-200 bg-green-50 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-green-700">4 · Minuta gerada</h3>
          <p className="mt-2 text-sm text-gray-800">
            Matéria <strong>{material.title}</strong> ({material.id}) — estado <strong>{material.status}</strong>,
            sem número definitivo até a emissão abaixo.
          </p>
          {number ? (
            <p className="mt-2 text-sm font-medium text-gray-900">
              Número atribuído: {number.number}/{number.year}
            </p>
          ) : (
            <button
              onClick={emitNumber}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">tag</span>
              Emitir número
            </button>
          )}
          <div className="mt-2 text-xs text-gray-500">
            A minuta está listada em {info?.plural}. A revisão, a aprovação e o
            encaminhamento à edição (assinatura/publicação) seguem o fluxo de matérias.
          </div>
        </section>
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldSpec; value: string; onChange: (v: string) => void }) {
  const base = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  switch (field.type) {
    case "date":
      return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={base} />;
    case "integer":
    case "decimal":
    case "money":
      return <input type="number" step={field.type === "integer" ? "1" : "any"} value={value} onChange={(e) => onChange(e.target.value)} className={base} />;
    case "select":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Selecione…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    default:
      return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={base} />;
  }
}
