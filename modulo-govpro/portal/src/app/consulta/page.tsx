"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { getOrgSlug } from "@/lib/org";
import type { ConsultaResultado } from "@/types/public";
import { formatDate, SITUACAO_LABEL } from "@/lib/format";
import Badge from "@/components/Badge";

export default function ConsultaPage() {
  const [nup, setNup] = useState("");
  const [resultado, setResultado] = useState<ConsultaResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const consultar = async (e: React.FormEvent) => {
    e.preventDefault();
    const org = getOrgSlug();
    if (!org) {
      setErro("Selecione o seu município na página inicial antes de consultar.");
      return;
    }
    setErro("");
    setLoading(true);
    setResultado(null);
    try {
      setResultado(await api.consultarProcesso(nup.trim(), org));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao consultar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-gutter py-12">
      <h1 className="text-headline-lg font-headline-lg text-primary">Consultar processo</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Informe o número do processo (NUP). O resultado é público, conforme a Lei de Acesso à Informação.
      </p>

      <form onSubmit={consultar} className="mt-8 space-y-4">
        <div>
          <label htmlFor="nup" className="text-label-md font-label-md text-on-surface block mb-1">
            Número do processo (NUP)
          </label>
          <input
            id="nup"
            value={nup}
            onChange={(e) => setNup(e.target.value)}
            placeholder="00001.000001/2026-00"
            className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !nup.trim()}
          aria-busy={loading}
          className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
        >
          {loading ? "Consultando…" : "Consultar"}
        </button>
      </form>

      {erro && (
        <div className="mt-6 bg-error-container text-on-error-container rounded-lg p-4 text-body-md" role="alert">
          {erro}
        </div>
      )}

      {resultado && !resultado.encontrado && (
        <div className="mt-6 bg-surface-container-lowest rounded-lg border border-outline-variant p-6">
          <p className="text-body-md text-on-surface">Processo não encontrado para o número informado.</p>
        </div>
      )}

      {resultado && resultado.encontrado && !resultado.publico && (
        <div className="mt-6 bg-surface-container-lowest rounded-lg border border-outline-variant p-6">
          <Badge tone="warning">Acesso restrito</Badge>
          <p className="mt-3 text-body-md text-on-surface-variant">
            Este processo existe, mas o conteúdo não é público (Lei de Acesso à Informação).
          </p>
        </div>
      )}

      {resultado && resultado.publico && (
        <div className="mt-6 bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between">
            <span className="font-mono text-body-md text-primary">{resultado.nup}</span>
            <Badge tone={resultado.situacao === "ENCERRADO" ? "neutral" : "success"}>
              {SITUACAO_LABEL[resultado.situacao || ""] || resultado.situacao}
            </Badge>
          </div>
          <div className="px-6 py-4 space-y-2">
            <Info label="Especificação" value={resultado.especificacao || "—"} />
            <Info label="Gerado em" value={formatDate(resultado.data_autuacao)} />
          </div>
        </div>
      )}
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
