"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { getOrgSlug, setOrg } from "@/lib/org";
import type { OrgPublico } from "@/types/public";

export default function OrgSelector() {
  const [orgs, setOrgs] = useState<OrgPublico[]>([]);
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listOrganizacoes()
      .then((data) => {
        setOrgs(data);
        const atual = getOrgSlug();
        if (atual && data.some((o) => o.slug === atual)) setSlug(atual);
        else if (data.length === 1) setSlug(data[0].slug);
      })
      .catch(() => toast.error("Não foi possível carregar os municípios"))
      .finally(() => setLoading(false));
  }, []);

  const confirmar = () => {
    const org = orgs.find((o) => o.slug === slug);
    if (!org) {
      toast.error("Selecione o seu município");
      return;
    }
    setOrg(org.slug, org.nome);
    window.dispatchEvent(new Event("org:changed"));
    toast.success(`Município selecionado: ${org.nome}`);
  };

  if (loading) {
    return (
      <div className="text-center py-6 text-on-surface-variant">Carregando municípios…</div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="text-center py-6 text-on-surface-variant">
        Nenhum município disponível no momento.
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-end">
      <div className="flex-1 w-full">
        <label htmlFor="org" className="text-label-md font-label-md text-on-surface block mb-1">
          Selecione o seu município ou órgão
        </label>
        <select
          id="org"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full h-12 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
        >
          <option value="">Escolha…</option>
          {orgs.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.nome}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={confirmar}
        className="h-12 px-5 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
      >
        Continuar
      </button>
    </div>
  );
}
