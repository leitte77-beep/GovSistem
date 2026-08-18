"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import DOMPurify from "dompurify";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  AcessoExternoOut,
  AndamentoOut,
  CicloArquivisticoOut,
  CredencialAcessoOut,
  DocumentoOut,
  HipoteseLegal,
  IntimacaoOut,
  InteressadoOut,
  ModeloDocumento,
  MotivoSobrestamento,
  ProcessoOut,
  TextoPadrao,
  TipoDocumento,
  TramitacaoOut,
  Unidade,
} from "@/types/govpro";
import { formatDateTime, NIVEL_ACESSO_LABEL, SITUACAO_LABEL, TIPO_EVENTO_LABEL } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import ConfirmModal from "@/components/ConfirmModal";
import Badge from "@/components/Badge";
import { NivelAcessoBadge, SituacaoBadge, SituacaoDocumentoBadge } from "@/components/processo/badges";
import type { RichTextEditorHandle } from "@/components/RichTextEditor";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

const PAPEIS_SIGILO = ["GESTOR_SIGILO", "AUTORIDADE_SIGNATARIA", "ADMIN", "DPO"];
const PAPEIS_ARQUIVO = ["ARQUIVISTA", "ADMIN"];

type Tab = "andamentos" | "documentos" | "interessados" | "tramitacoes" | "acesso" | "arquivo";

export default function ProcessoDetalhePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const processoId = params.id;

  const [processo, setProcesso] = useState<ProcessoOut | null>(null);
  const [andamentos, setAndamentos] = useState<AndamentoOut[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoOut[]>([]);
  const [interessados, setInteressados] = useState<InteressadoOut[]>([]);
  const [tramitacoes, setTramitacoes] = useState<TramitacaoOut[]>([]);
  const [tab, setTab] = useState<Tab>("andamentos");
  const [loading, setLoading] = useState(true);
  const [favorito, setFavorito] = useState(false);
  const [alternandoFavorito, setAlternandoFavorito] = useState(false);

  const recarregar = useCallback(async () => {
    const p = await api.getProcesso(processoId);
    setProcesso(p);
    const [a, d, i, t, acompanhamentos] = await Promise.all([
      api.listAndamentos(processoId).catch(() => [] as AndamentoOut[]),
      api.listDocumentos(processoId).catch(() => [] as DocumentoOut[]),
      api.listInteressados(processoId).catch(() => [] as InteressadoOut[]),
      api.listTramitacoes(processoId).catch(() => [] as TramitacaoOut[]),
      api.listAcompanhamentos().catch(() => [] as { processo_id: string }[]),
    ]);
    setAndamentos(a);
    setDocumentos(d);
    setInteressados(i);
    setTramitacoes(t);
    setFavorito(acompanhamentos.some((ac) => ac.processo_id === processoId));
  }, [processoId]);

  useEffect(() => {
    recarregar()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Erro ao carregar processo"))
      .finally(() => setLoading(false));
  }, [recarregar]);

  const podeAtuar = !!user && user.roles.some((r) => r !== "AUDITOR");
  const podeSigilo = !!user && user.roles.some((r) => PAPEIS_SIGILO.includes(r));
  const podeArquivo = !!user && user.roles.some((r) => PAPEIS_ARQUIVO.includes(r));

  const alternarFavorito = async () => {
    setAlternandoFavorito(true);
    try {
      if (favorito) {
        await api.desmarcarAcompanhamento(processoId);
        setFavorito(false);
      } else {
        await api.marcarAcompanhamento(processoId);
        setFavorito(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar acompanhamento");
    } finally {
      setAlternandoFavorito(false);
    }
  };

  if (loading) {
    return <div className="px-gutter py-16 text-center text-on-surface-variant">Carregando processo…</div>;
  }

  if (!processo) {
    return (
      <div className="px-gutter py-16 text-center text-on-surface-variant">
        Processo não encontrado.
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: "andamentos", label: "Andamentos", icon: "timeline", count: andamentos.length },
    { key: "documentos", label: "Documentos", icon: "description", count: documentos.length },
    { key: "interessados", label: "Interessados", icon: "group", count: interessados.length },
    { key: "tramitacoes", label: "Envios", icon: "swap_horiz", count: tramitacoes.length },
    { key: "acesso", label: "Acesso e comunicações", icon: "key" },
    ...(podeArquivo ? [{ key: "arquivo" as Tab, label: "Arquivo", icon: "inventory_2" }] : []),
  ];

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title={processo.nup}
        subtitle={processo.especificacao}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={alternarFavorito}
              disabled={alternandoFavorito}
              aria-pressed={favorito}
              aria-label={favorito ? "Remover acompanhamento especial" : "Marcar acompanhamento especial"}
              className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${
                favorito
                  ? "border-tertiary bg-tertiary-container/20 text-tertiary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {favorito ? "star" : "star_outline"}
              </span>
            </button>
            <SituacaoBadge situacao={processo.situacao} />
            <NivelAcessoBadge nivel={processo.nivel_acesso} />
          </div>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-body-sm shadow-card">
          <Info label="Situação" value={SITUACAO_LABEL[processo.situacao] || processo.situacao} />
          <Info label="Nível de acesso" value={NIVEL_ACESSO_LABEL[processo.nivel_acesso] || processo.nivel_acesso} />
          <Info label="Gerado em" value={formatDateTime(processo.data_autuacao)} />
          <Info label="Criado em" value={formatDateTime(processo.created_at)} />
        </div>

        {podeAtuar && (
          <ProcessoActions
            processo={processo}
            onChanged={recarregar}
            podeSigilo={podeSigilo}
          />
        )}

        <div className="flex gap-1 border-b border-outline-variant mb-6 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-label-md font-label-md whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{t.icon}</span>
              {t.label}
              {t.count !== undefined && (
                <span className="text-[11px] bg-surface-container-high rounded-full px-1.5">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "andamentos" && <TimelineAndamentos andamentos={andamentos} />}
        {tab === "documentos" && (
          <DocumentosTab
            processoId={processoId}
            documentos={documentos}
            nivelProcesso={processo.nivel_acesso}
            podeAtuar={podeAtuar}
            onChanged={recarregar}
          />
        )}
        {tab === "interessados" && <InteressadosTab interessados={interessados} />}
        {tab === "tramitacoes" && (
          <TramitacoesTab
            processoId={processoId}
            tramitacoes={tramitacoes}
            podeAtuar={podeAtuar}
            onChanged={recarregar}
          />
        )}
        {tab === "acesso" && (
          <AcessoTab processoId={processoId} podeSigilo={podeSigilo} podeAtuar={podeAtuar} />
        )}
        {tab === "arquivo" && podeArquivo && <ArquivoTab processoId={processoId} />}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-label-md font-label-md text-on-surface-variant uppercase">{label}</div>
      <div className="text-body-md text-on-surface mt-0.5">{value}</div>
    </div>
  );
}

// ── Ações do processo ─────────────────────────────────────────────────────────
function ProcessoActions({
  processo,
  onChanged,
  podeSigilo,
}: {
  processo: ProcessoOut;
  onChanged: () => void;
  podeSigilo: boolean;
}) {
  const [modal, setModal] = useState<null | "concluir" | "arquivar" | "reabrir" | "sobrestar" | "reativar">(null);
  const [motivo, setMotivo] = useState("");
  const [running, setRunning] = useState(false);

  const precisaMotivo = modal === "sobrestar";
  const mostraMotivo = modal !== "reativar";

  const executar = async () => {
    if (precisaMotivo && !motivo.trim()) {
      toast.error("Informe o motivo");
      return;
    }
    setRunning(true);
    try {
      if (modal === "concluir") await api.concluirProcesso(processo.id, motivo.trim() || undefined);
      else if (modal === "arquivar") await api.arquivarProcesso(processo.id, motivo.trim() || undefined);
      else if (modal === "reabrir") await api.reabrirProcesso(processo.id, motivo.trim() || undefined);
      else if (modal === "sobrestar") await api.sobrestar(processo.id, { motivo_texto: motivo });
      else if (modal === "reativar") await api.reativar(processo.id);
      toast.success("Operação realizada");
      setModal(null);
      setMotivo("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na operação");
    } finally {
      setRunning(false);
    }
  };

  const confirmTitle: Record<string, string> = {
    concluir: "Concluir Processo na Unidade",
    arquivar: "Arquivar processo",
    reabrir: "Reabrir Processo",
    sobrestar: "Sobrestar Processo",
    reativar: "Retirar Sobrestamento",
  };

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {processo.situacao === "EM_TRAMITACAO" && (
        <>
          <ActionButton icon="pause_circle" label="Sobrestar" onClick={() => setModal("sobrestar")} />
          <ActionButton icon="check_circle" label="Concluir na Unidade" onClick={() => setModal("concluir")} />
          <ActionButton icon="archive" label="Arquivar" onClick={() => setModal("arquivar")} />
        </>
      )}
      {processo.situacao === "SOBRESTADO" && (
        <>
          <ActionButton icon="play_circle" label="Retirar Sobrestamento" onClick={() => setModal("reativar")} />
          <ActionButton icon="check_circle" label="Concluir na Unidade" onClick={() => setModal("concluir")} />
          <ActionButton icon="archive" label="Arquivar" onClick={() => setModal("arquivar")} />
        </>
      )}
      {(processo.situacao === "ENCERRADO" || processo.situacao === "ARQUIVADO") && (
        <ActionButton icon="unarchive" label="Reabrir Processo" onClick={() => setModal("reabrir")} />
      )}
      {podeSigilo && <ClassificarAction processo={processo} onChanged={onChanged} />}

      {modal !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-gutter" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-lg shadow-xl p-6">
            <h3 className="text-headline-sm font-headline-sm">{confirmTitle[modal]}</h3>
            {mostraMotivo && (
              <div className="mt-4">
                <label className="text-label-md font-label-md">Motivo</label>
                <textarea
                  autoFocus
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="mt-1 w-full h-28 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg"
                />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={running}
                className="h-10 px-4 border border-outline rounded-lg disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={executar}
                disabled={running}
                aria-busy={running}
                className="h-10 px-4 bg-primary text-on-primary rounded-lg disabled:opacity-60"
              >
                {running ? "Aguarde…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 h-10 px-4 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

function ClassificarAction({ processo, onChanged }: { processo: ProcessoOut; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [hipoteses, setHipoteses] = useState<HipoteseLegal[]>([]);
  const [hipoteseId, setHipoteseId] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) api.listHipotesesLegais().then(setHipoteses).catch(() => {});
  }, [open]);

  const submit = async () => {
    setRunning(true);
    try {
      await api.classificar("processo", processo.id, {
        hipotese_legal_id: hipoteseId || null,
        justificativa,
      });
      toast.success("Processo classificado");
      setOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao classificar");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <ActionButton icon="lock" label="Classificar sigilo" onClick={() => setOpen(true)} />
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-gutter" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-lg shadow-xl p-6">
            <h3 className="text-headline-sm font-headline-sm">Classificar sigilo</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-label-md font-label-md">Hipótese legal</label>
                <select
                  value={hipoteseId}
                  onChange={(e) => setHipoteseId(e.target.value)}
                  className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
                >
                  <option value="">Selecione…</option>
                  {hipoteses.map((h) => (
                    <option key={h.id} value={h.id}>{h.descricao}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-label-md font-label-md">Justificativa</label>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="w-full h-24 px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="h-10 px-4 border border-outline rounded-lg">Cancelar</button>
              <button
                onClick={submit}
                disabled={running || !hipoteseId}
                className="h-10 px-4 bg-primary text-on-primary rounded-lg disabled:opacity-60"
              >
                Classificar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function TimelineAndamentos({ andamentos }: { andamentos: AndamentoOut[] }) {
  if (andamentos.length === 0) {
    return <p className="text-on-surface-variant py-8 text-center">Sem andamentos registrados.</p>;
  }
  return (
    <ol className="relative border-l border-outline-variant ml-3 space-y-6">
      {andamentos.map((a) => (
        <li key={a.id} className="ml-6">
          <span className="absolute -left-2 w-4 h-4 rounded-full bg-primary border-2 border-surface" aria-hidden="true" />
          <div className="text-body-sm text-on-surface-variant">{formatDateTime(a.created_at)}</div>
          <div className="text-body-md text-on-surface font-medium">
            {TIPO_EVENTO_LABEL[a.tipo_evento] || a.tipo_evento}
          </div>
          <div className="text-body-md text-on-surface-variant">{a.descricao}</div>
        </li>
      ))}
    </ol>
  );
}

function InteressadosTab({ interessados }: { interessados: InteressadoOut[] }) {
  if (interessados.length === 0) {
    return <p className="text-on-surface-variant py-8 text-center">Sem interessados registrados.</p>;
  }
  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
      <ul className="divide-y divide-outline-variant">
        {interessados.map((i) => (
          <li key={i.id} className="px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
              {i.tipo_pessoa === "PJ" ? "business" : "person"}
            </span>
            <div className="flex-1">
              <div className="text-body-md text-on-surface">{i.nome}</div>
              {i.cpf_cnpj && <div className="text-body-sm text-on-surface-variant">{i.cpf_cnpj}</div>}
            </div>
            {i.email && <span className="text-body-sm text-on-surface-variant">{i.email}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentosTab({
  processoId,
  documentos,
  nivelProcesso,
  podeAtuar,
  onChanged,
}: {
  processoId: string;
  documentos: DocumentoOut[];
  nivelProcesso: string;
  podeAtuar: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [tiposDoc, setTiposDoc] = useState<TipoDocumento[]>([]);
  const [modelos, setModelos] = useState<ModeloDocumento[]>([]);
  const [textosPadrao, setTextosPadrao] = useState<TextoPadrao[]>([]);
  const [titulo, setTitulo] = useState("");
  const [tipoDocId, setTipoDocId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [textoPadraoId, setTextoPadraoId] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [nivel, setNivel] = useState("PUBLICO");
  const [submitting, setSubmitting] = useState(false);
  const [assinandoId, setAssinandoId] = useState<string | null>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  useEffect(() => {
    if (showForm) {
      api.listTiposDocumento().then(setTiposDoc).catch(() => {});
      api.listModelosDocumento().then(setModelos).catch(() => {});
      api.listTextosPadrao().then(setTextosPadrao).catch(() => {});
    }
  }, [showForm]);

  const aplicarModelo = async (novoModeloId: string) => {
    setModeloId(novoModeloId);
    if (!novoModeloId) return;
    try {
      const r = await api.renderModeloDocumento(novoModeloId, processoId);
      setConteudo(DOMPurify.sanitize(r.conteudo_html));
    } catch {
      toast.error("Não foi possível carregar o modelo");
    }
  };

  const inserirTextoPadrao = async () => {
    if (!textoPadraoId) return;
    try {
      const r = await api.renderTextoPadrao(textoPadraoId, processoId);
      editorRef.current?.insertHtml(DOMPurify.sanitize(r.conteudo));
    } catch {
      toast.error("Não foi possível inserir o texto padrão");
    }
  };

  const aoMudarTipo = async (novoTipoId: string) => {
    setTipoDocId(novoTipoId);
    if (!novoTipoId) return;
    try {
      const r = await api.modeloPadraoTipo(novoTipoId, processoId);
      if (r.encontrado) setConteudo(DOMPurify.sanitize(r.conteudo_html));
    } catch {
      // modelo padrão é opcional; falha não deve travar o preenchimento
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.criarDocumento(processoId, {
        titulo,
        conteudo_html: conteudo || null,
        tipo_documento_id: tipoDocId || null,
        nivel_acesso: nivel as "PUBLICO" | "RESTRITO" | "SIGILOSO",
      });
      toast.success("Documento gerado (rascunho)");
      setShowForm(false);
      setTitulo("");
      setConteudo("");
      setModeloId("");
      setTipoDocId("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar documento");
    } finally {
      setSubmitting(false);
    }
  };

  const assinar = async (doc: DocumentoOut) => {
    setAssinandoId(doc.id);
    try {
      await api.assinarDocumento(doc.id);
      toast.success("Documento assinado");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao assinar");
    } finally {
      setAssinandoId(null);
    }
  };

  return (
    <div className="space-y-4">
      {podeAtuar && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">note_add</span>
            Gerar Documento
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={criar} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6 space-y-4">
          <h3 className="text-headline-sm font-headline-sm">Gerar Documento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-label-md font-label-md">Título</label>
              <input
                required
                minLength={3}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              />
            </div>
            <div>
              <label className="text-label-md font-label-md">Tipo de documento</label>
              <select
                value={tipoDocId}
                onChange={(e) => aoMudarTipo(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              >
                <option value="">Sem tipo</option>
                {tiposDoc.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-label-md font-label-md">Modelo</label>
              <select
                value={modeloId}
                onChange={(e) => aplicarModelo(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              >
                <option value="">Sem modelo</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-label-md font-label-md">Nível de acesso</label>
              <select
                value={nivel}
                onChange={(e) => setNivel(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              >
                <option value="PUBLICO">Público</option>
                <option value="RESTRITO">Restrito</option>
                <option value="SIGILOSO">Sigiloso</option>
              </select>
              <p className="text-body-sm text-on-surface-variant mt-1">
                Documento não pode ser menos restritivo que o processo ({nivelProcesso}).
              </p>
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-label-md font-label-md">Conteúdo</label>
              <div className="flex items-center gap-2">
                <select
                  value={textoPadraoId}
                  onChange={(e) => setTextoPadraoId(e.target.value)}
                  className="h-10 px-2 bg-surface-container-low border border-outline-variant rounded-lg text-body-sm"
                >
                  <option value="">Inserir texto padrão…</option>
                  {textosPadrao.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={inserirTextoPadrao}
                  disabled={!textoPadraoId}
                  className="h-10 px-3 inline-flex items-center gap-1.5 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-50 text-label-md font-label-md"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">playlist_add</span>
                  Inserir
                </button>
              </div>
            </div>
            <RichTextEditor ref={editorRef} value={conteudo} onChange={setConteudo} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="h-11 px-4 border border-outline rounded-lg">Cancelar</button>
            <button type="submit" disabled={submitting} className="h-11 px-5 bg-primary text-on-primary rounded-lg disabled:opacity-60">
              {submitting ? "Gerando…" : "Gerar Documento"}
            </button>
          </div>
        </form>
      )}

      {documentos.length === 0 ? (
        <p className="text-on-surface-variant py-8 text-center">Nenhum documento juntado.</p>
      ) : (
        <ul className="space-y-2">
          {documentos.map((d) => (
            <li key={d.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">description</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-body-md text-on-surface truncate">{d.titulo}</span>
                  <SituacaoDocumentoBadge situacao={d.situacao} />
                  <NivelAcessoBadge nivel={d.nivel_acesso} />
                </div>
                {d.numero && <div className="text-body-sm text-on-surface-variant">Nº {d.numero}</div>}
              </div>
              <div className="flex items-center gap-2">
                {d.codigo_verificador && (
                  <span className="text-body-sm text-on-surface-variant hidden md:inline">CV: {d.codigo_verificador}</span>
                )}
                {podeAtuar && d.situacao === "RASCUNHO" && (
                  <button
                    onClick={() => assinar(d)}
                    disabled={assinandoId === d.id}
                    className="h-9 px-3 bg-secondary text-on-secondary rounded-lg hover:opacity-90 transition-colors disabled:opacity-60 text-label-md font-label-md"
                  >
                    {assinandoId === d.id ? "Assinando…" : "Assinar"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TramitacoesTab({
  processoId,
  tramitacoes,
  podeAtuar,
  onChanged,
}: {
  processoId: string;
  tramitacoes: TramitacaoOut[];
  podeAtuar: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [origemId, setOrigemId] = useState("");
  const [destinoIds, setDestinoIds] = useState<string[]>([""]);
  const [prazoDias, setPrazoDias] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (showForm) {
      api.listUnidades().then((u) => {
        setUnidades(u);
        const protocolo = u.find((x) => x.protocolizadora);
        if (protocolo) setOrigemId(protocolo.id);
      }).catch(() => {});
    }
  }, [showForm]);

  const tramitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.tramitar(processoId, {
        unidade_origem_id: origemId,
        destinos: destinoIds
          .filter((id) => id)
          .map((id) => ({ unidade_id: id, prazo_dias: prazoDias ? Number(prazoDias) : null })),
      });
      toast.success("Envio registrado");
      setShowForm(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {podeAtuar && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">send</span>
            Enviar
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={tramitar} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6 space-y-4">
          <h3 className="text-headline-sm font-headline-sm">Enviar Processo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-label-md font-label-md">Unidade de origem</label>
              <select
                required
                value={origemId}
                onChange={(e) => setOrigemId(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              >
                <option value="">Selecione…</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome} ({u.sigla})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-label-md font-label-md">Prazo (dias)</label>
              <input
                type="number"
                min={0}
                value={prazoDias}
                onChange={(e) => setPrazoDias(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-label-md font-label-md">Unidades de destino</label>
            {destinoIds.map((id, i) => (
              <div key={i} className="flex gap-2 mt-1">
                <select
                  value={id}
                  onChange={(e) =>
                    setDestinoIds((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                  }
                  className="flex-1 h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg"
                >
                  <option value="">Selecione…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome} ({u.sigla})</option>
                  ))}
                </select>
                {destinoIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDestinoIds((prev) => prev.filter((_, idx) => idx !== i))}
                    className="w-12 flex items-center justify-center text-error hover:bg-error-container rounded-lg"
                    aria-label="Remover destino"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDestinoIds((prev) => [...prev, ""])}
              className="mt-2 inline-flex items-center gap-1 text-label-md font-label-md text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
              Adicionar destino
            </button>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="h-11 px-4 border border-outline rounded-lg">Cancelar</button>
            <button type="submit" disabled={submitting} className="h-11 px-5 bg-primary text-on-primary rounded-lg disabled:opacity-60">
              {submitting ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      )}

      {tramitacoes.length === 0 ? (
        <p className="text-on-surface-variant py-8 text-center">Nenhum envio registrado.</p>
      ) : (
        <ul className="space-y-2">
          {tramitacoes.map((t) => (
            <li key={t.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant px-4 py-3 flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">swap_horiz</span>
              <div className="flex-1">
                <div className="text-body-md text-on-surface">{t.observacao || "Envio"}</div>
                <div className="text-body-sm text-on-surface-variant">
                  {t.tipo} · {t.recebida ? "Recebida" : "Pendente"} · {formatDateTime(t.created_at)}
                </div>
              </div>
              {t.prazo_dias != null && <span className="text-body-sm text-on-surface-variant">{t.prazo_dias} dias</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Acesso e comunicações ──────────────────────────────────────────────────────
function AcessoTab({
  processoId,
  podeSigilo,
  podeAtuar,
}: {
  processoId: string;
  podeSigilo: boolean;
  podeAtuar: boolean;
}) {
  const [credenciais, setCredenciais] = useState<CredencialAcessoOut[]>([]);
  const [acessosExternos, setAcessosExternos] = useState<AcessoExternoOut[]>([]);
  const [intimacoes, setIntimacoes] = useState<IntimacaoOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroSigilo, setErroSigilo] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    Promise.all([
      podeSigilo
        ? api.listCredenciais(processoId).catch(() => {
            setErroSigilo(true);
            return [] as CredencialAcessoOut[];
          })
        : Promise.resolve([] as CredencialAcessoOut[]),
      api.listAcessosExternos(processoId).catch(() => [] as AcessoExternoOut[]),
      api.listIntimacoes(processoId).catch(() => [] as IntimacaoOut[]),
    ]).then(([c, a, i]) => {
      setCredenciais(c);
      setAcessosExternos(a);
      setIntimacoes(i);
      setLoading(false);
    });
  }, [processoId, podeSigilo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (loading) {
    return <div className="text-center py-8 text-on-surface-variant">Carregando…</div>;
  }

  return (
    <div className="space-y-8">
      {podeSigilo && (
        <section>
          <h3 className="text-headline-sm font-headline-sm text-on-surface mb-3">
            Credenciais de acesso nominal
          </h3>
          <p className="text-body-sm text-on-surface-variant mb-3">
            Acesso específico a processo restrito/sigiloso, além do papel funcional (need-to-know).
          </p>
          <CredenciaisPainel
            processoId={processoId}
            credenciais={credenciais}
            erro={erroSigilo}
            onChanged={carregar}
          />
        </section>
      )}

      <section>
        <h3 className="text-headline-sm font-headline-sm text-on-surface mb-3">Acesso externo</h3>
        <p className="text-body-sm text-on-surface-variant mb-3">
          Disponibiliza o processo a um representante externo (procurador, advogado) por prazo determinado.
        </p>
        <AcessoExternoPainel
          processoId={processoId}
          acessos={acessosExternos}
          podeAtuar={podeAtuar}
          onChanged={carregar}
        />
      </section>

      <section>
        <h3 className="text-headline-sm font-headline-sm text-on-surface mb-3">Intimações</h3>
        <p className="text-body-sm text-on-surface-variant mb-3">
          Comunicações formais ao interessado, com prazo e registro de ciência.
        </p>
        <IntimacoesPainel processoId={processoId} intimacoes={intimacoes} podeAtuar={podeAtuar} onChanged={carregar} />
      </section>
    </div>
  );
}

function CredenciaisPainel({
  processoId,
  credenciais,
  erro,
  onChanged,
}: {
  processoId: string;
  credenciais: CredencialAcessoOut[];
  erro: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revogando, setRevogando] = useState<CredencialAcessoOut | null>(null);

  const conceder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.concederCredencial(processoId, usuarioId.trim(), motivo.trim() || undefined);
      toast.success("Credencial concedida");
      setShowForm(false);
      setUsuarioId("");
      setMotivo("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conceder credencial");
    } finally {
      setSubmitting(false);
    }
  };

  const revogar = async () => {
    if (!revogando) return;
    setSubmitting(true);
    try {
      await api.revogarCredencial(processoId, revogando.usuario_id);
      toast.success("Credencial revogada");
      setRevogando(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revogar credencial");
    } finally {
      setSubmitting(false);
    }
  };

  if (erro) {
    return (
      <p className="text-body-sm text-on-surface-variant">
        Você não tem permissão para gerenciar credenciais deste processo.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 h-10 px-3 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person_add</span>
          Conceder credencial
        </button>
      </div>

      {showForm && (
        <form onSubmit={conceder} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 space-y-3">
          <div>
            <label className="text-label-md font-label-md">ID do usuário</label>
            <input
              required
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              placeholder="UUID do usuário interno"
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div>
            <label className="text-label-md font-label-md">Motivo</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="h-10 px-4 border border-outline rounded-lg">Cancelar</button>
            <button type="submit" disabled={submitting} className="h-10 px-4 bg-primary text-on-primary rounded-lg disabled:opacity-60">
              {submitting ? "Concedendo…" : "Conceder"}
            </button>
          </div>
        </form>
      )}

      {credenciais.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant py-4">Nenhuma credencial concedida.</p>
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
          {credenciais.map((c) => (
            <li key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-body-md text-on-surface">{c.usuario_nome}</p>
                <p className="text-body-sm text-on-surface-variant">
                  {c.usuario_email} {c.motivo && `· ${c.motivo}`}
                </p>
              </div>
              <button
                onClick={() => setRevogando(c)}
                className="h-9 px-3 text-label-md text-error border border-error/40 rounded-lg hover:bg-error-container transition-colors"
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(revogando)}
        title="Revogar credencial"
        message={`Revogar o acesso de "${revogando?.usuario_nome}" a este processo?`}
        danger
        loading={submitting}
        onConfirm={revogar}
        onCancel={() => setRevogando(null)}
      />
    </div>
  );
}

function AcessoExternoPainel({
  processoId,
  acessos,
  podeAtuar,
  onChanged,
}: {
  processoId: string;
  acessos: AcessoExternoOut[];
  podeAtuar: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [expiraEm, setExpiraEm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revogando, setRevogando] = useState<AcessoExternoOut | null>(null);

  const conceder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.concederAcessoExterno(processoId, {
        email_externo: email.trim(),
        expira_em: expiraEm ? new Date(expiraEm).toISOString() : null,
      });
      toast.success("Acesso externo concedido");
      setShowForm(false);
      setEmail("");
      setExpiraEm("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao conceder acesso");
    } finally {
      setSubmitting(false);
    }
  };

  const revogar = async () => {
    if (!revogando) return;
    setSubmitting(true);
    try {
      await api.revogarAcessoExterno(revogando.id);
      toast.success("Acesso externo revogado");
      setRevogando(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao revogar acesso");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {podeAtuar && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 h-10 px-3 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">share</span>
            Conceder acesso
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={conceder} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 space-y-3">
          <div>
            <label className="text-label-md font-label-md">E-mail do representante externo</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div>
            <label className="text-label-md font-label-md">Expira em</label>
            <input
              type="date"
              value={expiraEm}
              onChange={(e) => setExpiraEm(e.target.value)}
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="h-10 px-4 border border-outline rounded-lg">Cancelar</button>
            <button type="submit" disabled={submitting} className="h-10 px-4 bg-primary text-on-primary rounded-lg disabled:opacity-60">
              {submitting ? "Concedendo…" : "Conceder"}
            </button>
          </div>
        </form>
      )}

      {acessos.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant py-4">Nenhum acesso externo concedido.</p>
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
          {acessos.map((a) => (
            <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-body-md text-on-surface">{a.email_externo ?? "Usuário externo"}</p>
                <p className="text-body-sm text-on-surface-variant">
                  {a.expira_em ? `Expira em ${formatDateTime(a.expira_em)}` : "Sem expiração definida"}
                </p>
              </div>
              {podeAtuar && (
                <button
                  onClick={() => setRevogando(a)}
                  className="h-9 px-3 text-label-md text-error border border-error/40 rounded-lg hover:bg-error-container transition-colors"
                >
                  Revogar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(revogando)}
        title="Revogar acesso externo"
        message={`Revogar o acesso de "${revogando?.email_externo}"?`}
        danger
        loading={submitting}
        onConfirm={revogar}
        onCancel={() => setRevogando(null)}
      />
    </div>
  );
}

function IntimacoesPainel({
  processoId,
  intimacoes,
  podeAtuar,
  onChanged,
}: {
  processoId: string;
  intimacoes: IntimacaoOut[];
  podeAtuar: boolean;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [texto, setTexto] = useState("");
  const [prazoDias, setPrazoDias] = useState("15");
  const [submitting, setSubmitting] = useState(false);

  const emitir = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.criarIntimacao(processoId, {
        destinatario_nome: destinatario.trim(),
        texto: texto.trim(),
        prazo_dias: Number(prazoDias) || 15,
      });
      toast.success("Intimação emitida");
      setShowForm(false);
      setDestinatario("");
      setTexto("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir intimação");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {podeAtuar && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 h-10 px-3 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">mark_email_unread</span>
            Emitir intimação
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={emitir} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 space-y-3">
          <div>
            <label className="text-label-md font-label-md">Destinatário</label>
            <input
              required
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div>
            <label className="text-label-md font-label-md">Texto</label>
            <textarea
              required
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div>
            <label className="text-label-md font-label-md">Prazo (dias)</label>
            <input
              type="number"
              min={1}
              value={prazoDias}
              onChange={(e) => setPrazoDias(e.target.value)}
              className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="h-10 px-4 border border-outline rounded-lg">Cancelar</button>
            <button type="submit" disabled={submitting} className="h-10 px-4 bg-primary text-on-primary rounded-lg disabled:opacity-60">
              {submitting ? "Emitindo…" : "Emitir"}
            </button>
          </div>
        </form>
      )}

      {intimacoes.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant py-4">Nenhuma intimação emitida.</p>
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
          {intimacoes.map((i) => (
            <li key={i.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-body-md text-on-surface">{i.destinatario_nome}</p>
                <Badge tone={i.status === "CIENTE" ? "success" : i.status === "DECURSO" ? "error" : "neutral"}>
                  {i.status}
                </Badge>
              </div>
              <p className="text-body-sm text-on-surface-variant">{i.texto}</p>
              <p className="text-body-sm text-on-surface-variant mt-1">
                Prazo: {i.prazo_dias} dias
                {i.ciencia_em && ` · Ciência em ${formatDateTime(i.ciencia_em)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Arquivo (ciclo arquivístico) ────────────────────────────────────────────────
function ArquivoTab({ processoId }: { processoId: string }) {
  const [ciclo, setCiclo] = useState<CicloArquivisticoOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [executando, setExecutando] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    api
      .obterCiclo(processoId)
      .then(setCiclo)
      .catch(() => setCiclo(null))
      .finally(() => setLoading(false));
  }, [processoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const transferir = async () => {
    setExecutando(true);
    try {
      await api.transferirProcesso(processoId);
      toast.success("Processo transferido para fase intermediária");
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao transferir");
    } finally {
      setExecutando(false);
    }
  };

  const recolher = async () => {
    setExecutando(true);
    try {
      await api.recolherProcesso(processoId);
      toast.success("Processo recolhido para guarda permanente");
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recolher");
    } finally {
      setExecutando(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-on-surface-variant">Carregando…</div>;
  }

  if (!ciclo) {
    return <p className="text-body-sm text-on-surface-variant py-4">Ciclo arquivístico ainda não iniciado.</p>;
  }

  const FASE_LABEL: Record<string, string> = {
    CORRENTE: "Corrente",
    INTERMEDIARIA: "Intermediária",
    PERMANENTE: "Permanente (guarda definitiva)",
  };

  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-body-sm">
        <Info label="Fase atual" value={FASE_LABEL[ciclo.fase] ?? ciclo.fase} />
        <Info label="Transferência" value={formatDateTime(ciclo.data_transferencia)} />
        <Info label="Recolhimento" value={formatDateTime(ciclo.data_recolhimento)} />
      </div>
      <div className="flex flex-wrap gap-2 pt-2 border-t border-outline-variant">
        {ciclo.fase === "CORRENTE" && (
          <ActionButton icon="move_to_inbox" label="Transferir (intermediária)" onClick={transferir} />
        )}
        {ciclo.fase === "INTERMEDIARIA" && (
          <ActionButton icon="inventory_2" label="Recolher (guarda permanente)" onClick={recolher} />
        )}
        {executando && <span className="text-body-sm text-on-surface-variant self-center">Aguarde…</span>}
      </div>
    </div>
  );
}
