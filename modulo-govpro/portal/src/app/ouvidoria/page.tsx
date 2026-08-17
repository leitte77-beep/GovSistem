"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { getOrgSlug } from "@/lib/org";

const TIPOS = [
  { value: "DENUNCIA", label: "Denúncia" },
  { value: "RECLAMACAO", label: "Reclamação" },
  { value: "ELOGIO", label: "Elogio" },
  { value: "SUGESTAO", label: "Sugestão" },
  { value: "SOLICITACAO", label: "Solicitação" },
];

export default function OuvidoriaPage() {
  const [tipo, setTipo] = useState("RECLAMACAO");
  const [texto, setTexto] = useState("");
  const [anonima, setAnonima] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const org = getOrgSlug();
    if (!org) {
      toast.error("Selecione o seu município na página inicial antes de enviar.");
      return;
    }
    setSubmitting(true);
    try {
      await api.criarManifestacao({ org_slug: org, tipo, texto: texto.trim(), anonima });
      setEnviado(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar manifestação");
    } finally {
      setSubmitting(false);
    }
  };

  if (enviado) {
    return (
      <div className="max-w-2xl mx-auto px-gutter py-12">
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-8 text-center">
          <span className="material-symbols-outlined text-[48px] text-secondary" aria-hidden="true">task_alt</span>
          <h1 className="mt-4 text-headline-md font-headline-md">Manifestação registrada</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Recebemos sua manifestação. Ela será encaminhada à ouvidoria do órgão.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-gutter py-12">
      <h1 className="text-headline-lg font-headline-lg text-primary">Ouvidoria</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Registre sua manifestação (Lei 13.460/2017). Seus dados estão protegidos pela LGPD.
      </p>

      <form onSubmit={enviar} className="mt-8 space-y-4">
        <div>
          <label htmlFor="tipo" className="text-label-md font-label-md text-on-surface block mb-1">
            Tipo de manifestação
          </label>
          <select
            id="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="texto" className="text-label-md font-label-md text-on-surface block mb-1">
            Mensagem
          </label>
          <textarea
            id="texto"
            required
            minLength={10}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={anonima}
            onChange={(e) => setAnonima(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-body-md text-on-surface">Desejo permanecer anônimo</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
        >
          {submitting ? "Enviando…" : "Enviar manifestação"}
        </button>
      </form>
    </div>
  );
}
