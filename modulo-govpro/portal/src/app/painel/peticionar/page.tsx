"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { getOrgSlug } from "@/lib/org";
import type { ReciboPeticionamento, TipoProcessoPublico } from "@/types/public";
import { formatDateTime } from "@/lib/format";

export default function PeticionarPage() {
  const org = getOrgSlug();
  const [tipos, setTipos] = useState<TipoProcessoPublico[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(true);

  const [tipoId, setTipoId] = useState("");
  const [especificacao, setEspecificacao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recibo, setRecibo] = useState<ReciboPeticionamento | null>(null);

  const [nupInter, setNupInter] = useState("");
  const [tituloInter, setTituloInter] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [submittingInter, setSubmittingInter] = useState(false);

  useEffect(() => {
    if (!org) {
      setLoadingTipos(false);
      return;
    }
    api
      .listTiposProcesso(org)
      .then(setTipos)
      .catch(() => setTipos([]))
      .finally(() => setLoadingTipos(false));
  }, [org]);

  if (!org) {
    return (
      <div className="max-w-2xl mx-auto px-gutter py-12">
        <h1 className="text-headline-lg font-headline-lg text-primary">Peticionar</h1>
        <p className="mt-3 text-body-md text-on-surface-variant">
          Selecione o seu município na página inicial antes de peticionar.
        </p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 h-11 px-5 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors">
          Escolher município
        </Link>
      </div>
    );
  }

  const enviarNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoId) {
      toast.error("Selecione o tipo de requerimento");
      return;
    }
    setSubmitting(true);
    try {
      setRecibo(await api.peticionarNovo({ tipo_processo_id: tipoId, especificacao: especificacao.trim() }));
      toast.success("Requerimento protocolado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao peticionar");
    } finally {
      setSubmitting(false);
    }
  };

  const enviarIntercorrente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivo) {
      toast.error("Selecione um arquivo");
      return;
    }
    setSubmittingInter(true);
    try {
      await api.peticionarIntercorrente(nupInter.trim(), arquivo, tituloInter.trim());
      toast.success("Documento juntado ao processo");
      setNupInter("");
      setTituloInter("");
      setArquivo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao juntar documento");
    } finally {
      setSubmittingInter(false);
    }
  };

  return (
    <div>
      <h1 className="text-headline-md font-headline-md mb-6">Peticionar</h1>

      {/* Novo requerimento */}
      <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6">
        <h2 className="text-headline-sm font-headline-sm">Novo requerimento</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">Abra um novo processo administrativo.</p>

        {recibo ? (
          <div className="mt-4 bg-secondary-container/20 rounded-lg p-5">
            <div className="flex items-center gap-2 text-secondary">
              <span className="material-symbols-outlined" aria-hidden="true">task_alt</span>
              <span className="text-headline-sm font-headline-sm">Requerimento protocolado</span>
            </div>
            <dl className="mt-4 space-y-2">
              <Info label="NUP" value={recibo.nup} mono />
              <Info label="Recibo" value={recibo.recibo} mono />
              <Info label="Protocolado em" value={formatDateTime(recibo.horario_conclusao)} />
            </dl>
            <button onClick={() => setRecibo(null)} className="mt-4 text-label-md font-label-md text-primary hover:underline">
              Fazer novo requerimento
            </button>
          </div>
        ) : (
          <form onSubmit={enviarNovo} className="mt-4 space-y-4">
            <div>
              <label htmlFor="tipo" className="text-label-md font-label-md text-on-surface block mb-1">Tipo de requerimento</label>
              <select
                id="tipo"
                required
                value={tipoId}
                onChange={(e) => setTipoId(e.target.value)}
                disabled={loadingTipos}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">{loadingTipos ? "Carregando…" : "Selecione…"}</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="espec" className="text-label-md font-label-md text-on-surface block mb-1">Descreva seu pedido</label>
              <textarea
                id="espec"
                required
                minLength={10}
                value={especificacao}
                onChange={(e) => setEspecificacao(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <button type="submit" disabled={submitting} aria-busy={submitting}
              className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60">
              {submitting ? "Protocolando…" : "Protocolar requerimento"}
            </button>
          </form>
        )}
      </section>

      {/* Intercorrente */}
      <section className="mt-6 bg-surface-container-lowest rounded-lg border border-outline-variant p-6">
        <h2 className="text-headline-sm font-headline-sm">Juntar documento a processo existente</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Para processos em que você é interessado, ou com acesso concedido.
        </p>
        <form onSubmit={enviarIntercorrente} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nup" className="text-label-md font-label-md text-on-surface block mb-1">Número do processo (NUP)</label>
              <input id="nup" required value={nupInter} onChange={(e) => setNupInter(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="titulo" className="text-label-md font-label-md text-on-surface block mb-1">Título do documento</label>
              <input id="titulo" required value={tituloInter} onChange={(e) => setTituloInter(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label htmlFor="arquivo" className="text-label-md font-label-md text-on-surface block mb-1">Arquivo (PDF, imagem, etc.)</label>
            <input id="arquivo" type="file" required onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              className="w-full text-body-sm" />
          </div>
          <button type="submit" disabled={submittingInter} aria-busy={submittingInter}
            className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60">
            {submittingInter ? "Juntando…" : "Juntar documento"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-label-md font-label-md text-on-surface-variant uppercase">{label}</dt>
      <dd className={`text-body-md text-on-surface ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
