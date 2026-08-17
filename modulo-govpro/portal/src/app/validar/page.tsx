"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ValidacaoResultado } from "@/types/public";
import { formatDateTime } from "@/lib/format";
import Badge from "@/components/Badge";

export default function ValidarPage() {
  const [codigo, setCodigo] = useState("");
  const [crc, setCrc] = useState("");
  const [resultado, setResultado] = useState<ValidacaoResultado | null>(null);
  const [loading, setLoading] = useState(false);

  const validar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResultado(null);
    try {
      setResultado(await api.validar(codigo.trim(), crc.trim()));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-gutter py-12">
      <h1 className="text-headline-lg font-headline-lg text-primary">Validar documento</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Confira a autenticidade de um documento. Use o código verificador e o CRC impressos no documento.
      </p>

      <form onSubmit={validar} className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="codigo" className="text-label-md font-label-md text-on-surface block mb-1">
            Código verificador
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            required
            minLength={5}
            className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label htmlFor="crc" className="text-label-md font-label-md text-on-surface block mb-1">
            CRC
          </label>
          <input
            id="crc"
            value={crc}
            onChange={(e) => setCrc(e.target.value)}
            required
            minLength={4}
            className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
          >
            {loading ? "Validando…" : "Validar"}
          </button>
        </div>
      </form>

      {resultado && (
        <div className="mt-8 bg-surface-container-lowest rounded-lg border border-outline-variant p-6">
          <div className="flex items-center gap-3">
            <span
              className={`material-symbols-outlined text-[36px] ${resultado.valido ? "text-secondary" : "text-error"}`}
              aria-hidden="true"
            >
              {resultado.valido ? "verified" : "gpp_bad"}
            </span>
            <div>
              <div className="text-headline-sm font-headline-sm">
                {resultado.valido ? "Documento autêntico" : "Documento inválido"}
              </div>
              <div className="text-body-sm text-on-surface-variant">
                {resultado.valido
                  ? "A integridade foi confirmada."
                  : resultado.motivo || "O código e o CRC não correspondem a um documento válido."}
              </div>
            </div>
          </div>

          {resultado.valido && (
            <dl className="mt-6 space-y-3 border-t border-outline-variant pt-4">
              {resultado.titulo && (
                <div>
                  <dt className="text-label-md font-label-md text-on-surface-variant uppercase">Título</dt>
                  <dd className="text-body-md text-on-surface">{resultado.titulo}</dd>
                </div>
              )}
              <div className="flex items-center gap-3">
                <dt className="text-label-md font-label-md text-on-surface-variant uppercase">Acesso</dt>
                <dd><Badge tone={resultado.nivel_acesso === "PUBLICO" ? "success" : "warning"}>{resultado.nivel_acesso}</Badge></dd>
              </div>
              {resultado.assinado_em && (
                <div>
                  <dt className="text-label-md font-label-md text-on-surface-variant uppercase">Assinado em</dt>
                  <dd className="text-body-md text-on-surface">{formatDateTime(resultado.assinado_em)}</dd>
                </div>
              )}
              {resultado.hash && (
                <div>
                  <dt className="text-label-md font-label-md text-on-surface-variant uppercase">Hash (SHA-256)</dt>
                  <dd className="text-body-sm text-on-surface-variant font-mono break-all">{resultado.hash}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
