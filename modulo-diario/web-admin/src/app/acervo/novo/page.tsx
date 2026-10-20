"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Archive, FileUp, Loader2, Send, Sparkles } from "lucide-react";
import Editor from "@/components/Editor";
import { api, type AcervoFolders, type AcervoSuggestion } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";

const INPUT_CLS =
  "h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";
const LABEL_CLS = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-on-surface-variant";

type Dirty = { number: boolean; year: boolean; title: boolean; summary: boolean; responsible: boolean };
const CLEAN: Dirty = { number: false, year: false, title: false, summary: false, responsible: false };

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0 || /<(img|table)/i.test(html);
}

export default function NovoAtoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-on-surface-variant">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Carregando…
        </div>
      }
    >
      <NovoAto />
    </Suspense>
  );
}

function NovoAto() {
  const router = useRouter();
  const params = useSearchParams();

  const [folders, setFolders] = useState<AcervoFolders | null>(null);
  const [entityId, setEntityId] = useState(params.get("entidade") ?? "");
  const [typeId, setTypeId] = useState(params.get("tipo") ?? "");
  const [suggestion, setSuggestion] = useState<AcervoSuggestion | null>(null);

  const [number, setNumber] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [actDate, setActDate] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [responsibleRole, setResponsibleRole] = useState("");
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [contentHtml, setContentHtml] = useState("");
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = useState<Dirty>(CLEAN);
  const [interpreting, setInterpreting] = useState(false);
  const [saving, setSaving] = useState<"registro" | "diario" | null>(null);
  const interpretedOnce = useRef(false);
  const currentYear = new Date().getFullYear();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    api
      .getAcervoFolders()
      .then((data) => {
        setFolders(data);
        // Entidade padrão: a primeira (Prefeitura vem antes da Câmara).
        setEntityId((current) => current || data.entities.find((e) => e.id)?.id || "");
      })
      .catch((err) => notifyError("acervo.novo.pastas", err));
  }, []);

  const entities = useMemo(() => (folders?.entities ?? []).filter((e) => e.id), [folders]);
  const types = useMemo(() => folders?.folders ?? [], [folders]);
  const selectedType = types.find((t) => t.act_type_id === typeId) ?? null;
  const numbered = selectedType?.family === "numerado";

  const localTitle = useCallback(
    (num: string, yr: number) => {
      if (!selectedType) return "";
      const name = selectedType.name.toUpperCase();
      return num ? `${name} Nº ${num}/${yr}` : name;
    },
    [selectedType]
  );

  // Tipo ou entidade escolhidos: busca número, título e responsável sugeridos.
  useEffect(() => {
    if (!typeId) return;
    let cancelled = false;
    api
      .getAcervoSuggestions({ act_type_id: typeId, org_unit_id: entityId || undefined })
      .then((s) => {
        if (cancelled) return;
        setSuggestion(s);
        const d = dirtyRef.current;
        if (!d.number) setNumber(s.act_number ?? "");
        if (!d.year) setYear(s.act_year);
        if (!d.title) setTitle(s.title);
        if (!d.responsible) {
          setResponsibleName(s.responsible_name ?? "");
          setResponsibleRole(s.responsible_role ?? "");
          setResponsibleId(s.responsible_id);
        }
        setActDate((current) => current || s.act_date);
      })
      .catch((err) => notifyError("acervo.novo.sugestoes", err));
    return () => {
      cancelled = true;
    };
  }, [typeId, entityId]);

  // Título acompanha número/ano enquanto não for editado à mão.
  useEffect(() => {
    if (!dirty.title && selectedType) setTitle(localTitle(number, year));
  }, [number, year, dirty.title, selectedType, localTitle]);

  /** Lê o texto colado e preenche o que reconhecer, sem sobrescrever o que o
   *  usuário já digitou. Falhar aqui nunca impede o cadastro. */
  const interpret = useCallback(
    async (source: { html?: string; plain?: string }, silent: boolean) => {
      setInterpreting(true);
      try {
        const result = await api.analyzeMatter({ html: source.html, plain: source.plain });
        const s = result.suggestions;
        // Do texto vem SÓ a súmula. Número, ano e tipo não: o preâmbulo cita
        // outras normas e protocolos ("Lei Complementar 049/2022", "protocolo
        // nº 303"), e a leitura os tomava pelo número/ano do ato — a Portaria
        // 248/2026 foi publicada como 248/2022 assim. Número e ano vêm da
        // série da entidade; o tipo, da escolha do usuário.
        if (s.summary && !dirty.summary) setSummary(s.summary);
        if (!silent) {
          toast.success(s.summary ? "Súmula preenchida a partir do texto — confira." : "Nenhuma súmula reconhecida no texto.");
        }
      } catch (err) {
        if (!silent) toast.error(err instanceof Error ? err.message : "Não foi possível interpretar o texto");
      } finally {
        setInterpreting(false);
      }
    },
    [dirty.summary]
  );

  const [importingWord, setImportingWord] = useState(false);
  const wordInput = useRef<HTMLInputElement>(null);

  const openWord = async (file: File) => {
    if (hasText(contentHtml) && !window.confirm("Substituir o texto atual pelo conteúdo do arquivo?")) return;
    setImportingWord(true);
    try {
      const result = await api.importAcervoWord(file);
      setContentHtml(result.content_html);
      setContentJson(null);
      const partes = [
        result.tables ? `${result.tables} tabela(s)` : "",
        result.text_boxes ? `${result.text_boxes} caixa(s) de texto convertida(s) em texto editável` : "",
      ].filter(Boolean);
      toast.success(`Arquivo aberto${partes.length ? `: ${partes.join(", ")}` : ""}. Confira o texto.`);
      result.warnings.forEach((w) => toast(w, { icon: "⚠️", duration: 8000 }));
      interpretedOnce.current = true;
      void interpret({ html: result.content_html }, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir o arquivo");
    } finally {
      setImportingWord(false);
      if (wordInput.current) wordInput.current.value = "";
    }
  };

  const handlePaste = useCallback(
    (source: { html: string; plain: string }) => {
      // Caixa de texto/forma do Word chega ao navegador só como imagem de um
      // arquivo temporário do computador (file:///C:/...), que não abre.
      if (/<img[^>]+src=["']?file:/i.test(source.html)) {
        toast(
          "Parte do conteúdo colado estava numa caixa de texto do Word e virou imagem quebrada. " +
            "Use \"Abrir arquivo do Word\" para trazer esse quadro como texto editável.",
          { icon: "⚠️", duration: 12000 }
        );
      }
      // Só a primeira colagem preenche sozinha; depois, apenas pelo botão.
      if (interpretedOnce.current) return;
      interpretedOnce.current = true;
      void interpret(source, true);
    },
    [interpret]
  );

  const save = async (destino: "registro" | "diario") => {
    if (!entityId) return toast.error("Escolha a entidade");
    if (!typeId) return toast.error("Escolha o tipo do ato");
    if (numbered && !number.trim()) return toast.error("Informe o número do ato");
    if (!title.trim()) return toast.error("Informe o título");
    if (!hasText(contentHtml)) return toast.error("Cole ou escreva o texto do ato");
    if (year !== currentYear && !window.confirm(`O ano do ato é ${year}, diferente do ano atual (${currentYear}). Confirma?`)) return;

    setSaving(destino);
    let createdId: string | null = null;
    try {
      const created = await api.createMatter({
        title: title.trim(),
        summary: summary.trim() || undefined,
        act_type_id: typeId,
        org_unit_id: entityId,
        content_html: contentHtml,
        content_json: contentJson ?? undefined,
        content_mode: "rich_text",
        act_number: number.trim() || undefined,
        act_year: year,
        act_date: actDate || undefined,
        responsible_id: responsibleId ?? undefined,
        responsible_name: responsibleId ? undefined : responsibleName.trim() || undefined,
        responsible_role: responsibleId ? undefined : responsibleRole.trim() || undefined,
        gazette_publication: destino === "diario",
      });
      createdId = created.id;
      if (destino === "diario") {
        await api.submitReview(created.id);
        toast.success(`${title.trim()} registrado e enviado para aprovação.`);
      } else {
        toast.success(`${title.trim()} registrado no acervo.`);
      }
      router.push(`/acervo?tipo=${typeId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar";
      const status = (err as { status?: number }).status;
      if (createdId) {
        // Registrou, mas faltou algo para enviar (ex.: campo exigido pelo tipo).
        toast.error(`Ato registrado, mas não foi enviado: ${message}. Complete os dados.`);
        router.push(`/matters/${createdId}/edit`);
        return;
      }
      if (status === 409) {
        toast.error(`${message} Sugerimos o próximo número livre.`);
        setDirty((d) => ({ ...d, number: false }));
        const s = await api.getAcervoSuggestions({ act_type_id: typeId, org_unit_id: entityId }).catch(() => null);
        if (s?.act_number) setNumber(s.act_number);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(null);
    }
  };

  const TypeChips = ({ family, label }: { family: "numerado" | "expediente"; label: string }) => {
    const list = types.filter((t) => t.family === family);
    if (!list.length) return null;
    return (
      <div>
        <p className="mb-2 text-xs font-semibold text-on-surface-variant">{label}</p>
        <div className="flex flex-wrap gap-2">
          {list.map((t) => (
            <button
              key={t.act_type_id}
              type="button"
              aria-pressed={typeId === t.act_type_id}
              onClick={() => setTypeId(t.act_type_id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                typeId === t.act_type_id
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface text-on-surface hover:bg-surface-container"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1420px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <Link href="/acervo" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft size={16} aria-hidden="true" /> Acervo de atos
      </Link>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-display font-display tracking-tight text-on-surface">Novo ato</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Escolha a entidade e o tipo, cole o texto. Número, título e responsável vêm preenchidos — é só conferir.
          </p>
        </div>
        <Link href="/documentos/criar" className="text-sm font-semibold text-primary hover:underline">
          Prefere usar um modelo pronto?
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {/* 1. Entidade e tipo */}
          <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div>
              <p className={LABEL_CLS}>Entidade</p>
              <div className="flex flex-wrap gap-1 rounded-xl border border-outline-variant bg-surface p-1" role="radiogroup" aria-label="Entidade">
                {entities.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={entityId === e.id}
                    onClick={() => setEntityId(e.id!)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      entityId === e.id ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <p className={LABEL_CLS}>Tipo do ato</p>
              <TypeChips family="numerado" label="Atos numerados" />
              <TypeChips family="expediente" label="Licitações, contratos e outros" />
            </div>
          </section>

          {/* 2. Texto */}
          <section className="overflow-clip rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-5 py-3">
              <p className="text-sm font-semibold text-on-surface">Texto do ato</p>
              <div className="flex flex-wrap gap-2">
              <input
                ref={wordInput}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void openWord(file);
                }}
              />
              <button
                type="button"
                disabled={importingWord}
                onClick={() => wordInput.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50"
              >
                {importingWord ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileUp size={14} aria-hidden="true" />}
                Abrir arquivo do Word
              </button>
              <button
                type="button"
                disabled={interpreting || !hasText(contentHtml)}
                onClick={() => interpret({ html: contentHtml }, false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50"
              >
                {interpreting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                Ler súmula do texto
              </button>
              </div>
            </div>
            <p className="px-5 pt-3 text-xs text-on-surface-variant">
              Cole do Word ou escreva. Se o documento tiver quadros em caixa de texto, use &quot;Abrir arquivo do Word&quot; (.docx): eles vêm como texto editável.
            </p>
            <Editor
              content={contentHtml}
              contentJson={contentJson}
              onChange={setContentHtml}
              onChangeJson={setContentJson}
              onPasteSource={handlePaste}
              aiContext={{ actType: selectedType?.name, title, summary }}
            />
          </section>
        </div>

        {/* 3. Dados conferidos */}
        <aside className="h-fit space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm lg:sticky lg:top-4">
          <p className="text-sm font-semibold text-on-surface">Dados do ato</p>
          {!typeId ? (
            <p className="text-sm text-on-surface-variant">Escolha o tipo do ato para ver os dados sugeridos.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <label className="block">
                  <span className={LABEL_CLS}>{numbered ? "Número" : "Nº do processo/contrato"}</span>
                  <input
                    value={number}
                    onChange={(e) => {
                      setNumber(e.target.value);
                      setDirty((d) => ({ ...d, number: true }));
                    }}
                    placeholder={numbered ? "" : "opcional"}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLS}>Ano</span>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => {
                      setYear(Number(e.target.value) || new Date().getFullYear());
                      setDirty((d) => ({ ...d, year: true }));
                    }}
                    className={INPUT_CLS}
                  />
                </label>
              </div>
              {year !== currentYear && (
                <p className="-mt-2 rounded-lg bg-error-container px-2.5 py-1.5 text-xs font-semibold text-on-error-container" role="alert">
                  Atenção: o ano do ato ({year}) é diferente do ano atual ({currentYear}).
                </p>
              )}
              {numbered && suggestion?.act_number && !dirty.number && (
                <p className="-mt-2 text-xs text-on-surface-variant">Próximo número livre desta entidade.</p>
              )}
              <label className="block">
                <span className={LABEL_CLS}>Data do ato</span>
                <input type="date" value={actDate} onChange={(e) => setActDate(e.target.value)} className={INPUT_CLS} />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Título</span>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty((d) => ({ ...d, title: true }));
                  }}
                  className={INPUT_CLS}
                />
              </label>
              <label className="block">
                <span className={LABEL_CLS}>Súmula</span>
                <textarea
                  value={summary}
                  rows={3}
                  onChange={(e) => {
                    setSummary(e.target.value);
                    setDirty((d) => ({ ...d, summary: true }));
                  }}
                  placeholder="Resumo do ato (preenchido ao colar o texto)"
                  className={`${INPUT_CLS} h-auto py-2`}
                />
              </label>
              <div className="space-y-2">
                <span className={LABEL_CLS}>Responsável</span>
                <input
                  value={responsibleName}
                  onChange={(e) => {
                    setResponsibleName(e.target.value);
                    setResponsibleId(null);
                    setDirty((d) => ({ ...d, responsible: true }));
                  }}
                  placeholder="Nome"
                  className={INPUT_CLS}
                />
                <input
                  value={responsibleRole}
                  onChange={(e) => {
                    setResponsibleRole(e.target.value);
                    setResponsibleId(null);
                    setDirty((d) => ({ ...d, responsible: true }));
                  }}
                  placeholder="Cargo (ex.: Prefeito Municipal)"
                  className={INPUT_CLS}
                />
                {suggestion?.responsible_source === "ultimo_ato" && !dirty.responsible && (
                  <p className="text-xs text-on-surface-variant">Mesmo responsável do último ato deste tipo.</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2 border-t border-outline-variant pt-4">
            <button
              type="button"
              disabled={!!saving}
              onClick={() => save("diario")}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-60"
            >
              {saving === "diario" ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
              Registrar e enviar ao Diário
            </button>
            <button
              type="button"
              disabled={!!saving}
              onClick={() => save("registro")}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface px-4 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-60"
            >
              {saving === "registro" ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Archive size={17} aria-hidden="true" />}
              Somente registrar no acervo
            </button>
            <p className="text-xs text-on-surface-variant">
              &quot;Somente registrar&quot; guarda o ato com número definitivo, sem publicar. Ele pode ser enviado ao Diário depois, pelo acervo.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
