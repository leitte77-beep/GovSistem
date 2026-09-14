"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";
import type { ActType } from "@/types/matter";
import type {
  AiExtractResult,
  DocumentModelSummary,
  PreviewResult,
  VersionDetail,
} from "@/types/document_model";

const TIPO_INFO: Record<string, { label: string; plural: string; desc: string }> = {
  edital: { label: "Edital", plural: "Editais", desc: "Convocação, licitação ou aviso público." },
  licitacao: { label: "Licitação", plural: "Licitações", desc: "Avisos, pregões e atos de contratação." },
  contrato: { label: "Contrato/Termo", plural: "Contratos e termos", desc: "Termos de fomento, contratos e republicações." },
  relatorio: { label: "Relatório/Laudo", plural: "Relatórios e laudos", desc: "Laudos técnicos e análises." },
  extrato: { label: "Extrato", plural: "Extratos", desc: "Extratos de termos e aditivos." },
  audiencia: { label: "Audiência pública", plural: "Audiências públicas", desc: "Editais e convocações de audiência." },
  portaria: { label: "Portaria", plural: "Portarias", desc: "Ato interno (nomeação, férias etc.)." },
  lei: { label: "Lei", plural: "Leis", desc: "Norma sancionada." },
  oficio: { label: "Ofício", plural: "Ofícios", desc: "Comunicação oficial entre órgãos." },
  decreto: { label: "Decreto", plural: "Decretos", desc: "Ato normativo do Executivo." },
  resolucao: { label: "Resolução", plural: "Resoluções", desc: "Decisão de conselho/colegiado." },
};

const FINALIDADES: { key: string; label: string; keywords: string[] }[] = [
  { key: "exoneracao", label: "Exoneração", keywords: ["exonerac"] },
  { key: "nomeacao", label: "Nomeação", keywords: ["nomeac"] },
  { key: "ferias", label: "Férias", keywords: ["ferias"] },
  { key: "designacao", label: "Designação", keywords: ["designac"] },
  { key: "gratificacao", label: "Gratificação", keywords: ["gratificac"] },
  { key: "outros", label: "Outros", keywords: [] },
];

const ACT_TYPE_HINTS: Record<string, string[]> = {
  licitacao: ["licitação", "processos de compra", "edital"],
  contrato: ["contrato", "outros"],
  relatorio: ["relatório contábil", "outros"],
  extrato: ["outros", "contrato"],
  audiencia: ["edital", "outros"],
};

interface FieldSpec {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  help?: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function CriarDocumentoPage() {
  return (
    <Suspense
      fallback={<p className="p-gutter text-center text-sm text-gray-500">Carregando…</p>}
    >
      <CriarDocumentoContent />
    </Suspense>
  );
}

function CriarDocumentoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTipo = searchParams.get("tipo") ?? "portaria";

  const [tipo, setTipo] = useState(TIPO_INFO[initialTipo] ? initialTipo : "portaria");
  const [finalidade, setFinalidade] = useState("");
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
  const [busy, setBusy] = useState(false);

  const info = TIPO_INFO[tipo];

  const loadModels = useCallback(async () => {
    setModels([]);
    setModelId("");
    setVersion(null);
    setFields([]);
    setPreview(null);
    setExtracted(null);
    setValues({});
    setFinalidade("");
    const active = (await api.listDocumentModels({ document_type: tipo, status: "active" })).filter(
      (m) => m.active_version
    );
    setModels(active);
  }, [tipo]);

  useEffect(() => {
    api
      .listActTypes()
      .then((at) => {
        setActTypes(at);
        const labels = ACT_TYPE_HINTS[tipo] ?? [TIPO_INFO[tipo]?.label.toLowerCase() ?? tipo];
        const match = labels
          .map((label) => at.find((a) => a.name.toLowerCase() === label) ?? at.find((a) => a.name.toLowerCase().includes(label)))
          .find(Boolean);
        if (match) setActTypeId(match.id);
      })
      .catch((err) => notifyError("criar.acttypes", err));
  }, [tipo]);

  useEffect(() => {
    if (tipo) loadModels().catch((err) => notifyError("criar.models", err));
  }, [tipo, loadModels]);

  // Resolve, para cada finalidade, o modelo ativo correspondente.
  const modelByFinalidade = useMemo(() => {
    const map: Record<string, DocumentModelSummary | null> = {};
    for (const f of FINALIDADES) {
      if (f.key === "outros") {
        map[f.key] = null;
        continue;
      }
      map[f.key] =
        models.find((m) => f.keywords.some((k) => normalize(m.purpose).includes(k))) ?? null;
    }
    return map;
  }, [models]);

  const finalidadeOptions = useMemo(
    () =>
      tipo === "portaria"
        ? FINALIDADES
        : models.map((model) => ({ key: model.id, label: model.name, keywords: [] })),
    [tipo, models]
  );

  const selectFinalidade = (key: string) => {
    setFinalidade(key);
    setPreview(null);
    setExtracted(null);
    setValues({});
    if (tipo !== "portaria") {
      setModelId(key);
      return;
    }
    if (key === "outros") {
      setModelId("");
      return;
    }
    const model = modelByFinalidade[key];
    setModelId(model?.id ?? "");
  };

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

  const setField = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const analyze = async () => {
    if (!prompt.trim()) {
      toast.error("Descreva o documento que deseja criar.");
      return;
    }
    if (!modelId) {
      toast.error("Escolha a finalidade (com modelo aprovado) antes de usar a IA.");
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
      toast.error("Selecione a finalidade (e o tipo de ato) para gerar.");
      return;
    }
    setBusy(true);
    try {
      const m = await api.createMaterialFromModel(modelId, version, {
        act_type_id: actTypeId,
        values,
      });
      toast.success("Documento gerado. Abrindo o editor para revisão…");
      router.push(`/matters/${m.id}/edit`);
    } catch (err) {
      notifyError("criar.generate", err);
    } finally {
      setBusy(false);
    }
  };

  const canGenerate = Boolean(activeModel && version != null && actTypeId);

  return (
    <div className="p-gutter max-w-4xl">
      <nav className="mb-3 flex items-center gap-1 text-xs text-gray-500" aria-label="Trilha de navegação">
        <Link href="/documentos" className="hover:text-blue-700">
          Documentos oficiais
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <Link href={`/documentos/tipos/${tipo}`} className="hover:text-blue-700">
          {info.plural}
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="font-medium text-gray-700">Nova {info.label}</span>
      </nav>

      <PageHeader
        title={`Nova ${info.label}`}
        description={`Gere um documento fiel ao modelo aprovado de ${info.label.toLowerCase()}, usando a IA apenas para preencher os campos variáveis.`}
      />

      {/* Passo 1 — tipo e finalidade */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          1 · Tipo e finalidade
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Tipo de documento</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {Object.entries(TIPO_INFO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.plural}
                </option>
              ))}
            </select>
            {info && <span className="mt-1 block text-xs text-gray-500">{info.desc}</span>}
          </label>
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-sm font-medium text-gray-700">Finalidade</span>
          {models.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Não há modelo aprovado para {info.plural}. Cadastre e aprove um em{" "}
              <Link href="/documentos/modelos" className="underline">
                Modelos documentais
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {finalidadeOptions.map((f) => {
                const hasModel = tipo !== "portaria" || f.key === "outros" || modelByFinalidade[f.key] != null;
                const active = finalidade === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    disabled={!hasModel}
                    aria-pressed={active}
                    onClick={() => selectFinalidade(f.key)}
                    title={hasModel ? undefined : "Sem modelo aprovado para esta finalidade"}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {(finalidade === "outros" || (activeModel && finalidade !== "outros")) && models.length > 0 && (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Modelo aprovado</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.is_default ? "(padrão)" : ""} · v{m.active_version}
                </option>
              ))}
            </select>
          </label>
        )}

        {activeModel && (
          <div className="mt-3 text-sm text-gray-600">
            Modelo: <strong>{activeModel.name}</strong> · finalidade: <em>{activeModel.purpose}</em>
          </div>
        )}
      </section>

      {/* Passo 2 — IA / preenchimento */}
      {activeModel && version != null && (
        <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            2 · Preencher os dados
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Descreva o pedido e use a IA, ou preencha os campos manualmente abaixo.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
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
              {analyzing ? "Gerando…" : "Gerar com IA"}
            </button>
            <span className="text-xs text-gray-500">
              Sem chave de IA cadastrada, preencha manualmente.
            </span>
          </div>
          {extracted && extracted.note && !extracted.matched_model && (
            <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {extracted.note}
            </p>
          )}

          {fields.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">
                    {f.label} {f.required ? <span className="text-red-500">*</span> : null}
                  </span>
                  <FieldInput field={f} value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
                  {f.help && <span className="mt-1 block text-xs text-gray-500">{f.help}</span>}
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Passo 3 — revisão e geração */}
      {activeModel && version != null && (
        <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            3 · Revisar e gerar
          </h3>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Tipo de ato (matéria)</span>
            <select
              value={actTypeId}
              onChange={(e) => setActTypeId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione…</option>
              {actTypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {!tipoActType && (
              <span className="mt-1 block text-xs text-amber-600">
                Nenhum tipo de ato compatível encontrado. Crie em “Tipos de Ato” (ex.: {info.label}).
              </span>
            )}
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={doPreview}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">preview</span>
              Pré-visualizar
            </button>
            <button
              onClick={generate}
              disabled={busy || !canGenerate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-base">edit_document</span>
              Gerar e abrir no editor
            </button>
          </div>

          {preview && (
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                preview.complete ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
              }`}
            >
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

          <p className="mt-3 text-xs text-gray-500">
            Ao gerar, o documento é salvo como matéria (rascunho) e aberto no editor para
            revisão, numeração e envio ao fluxo de aprovação/assinatura/publicação.
          </p>
        </section>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  const base = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  switch (field.type) {
    case "date":
      return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={base} />;
    case "integer":
    case "decimal":
    case "money":
      return (
        <input
          type="number"
          step={field.type === "integer" ? "1" : "any"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      );
    case "select":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Selecione…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    default:
      return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={base} />;
  }
}
