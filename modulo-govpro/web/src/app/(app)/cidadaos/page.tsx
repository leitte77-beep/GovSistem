"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { CidadaoPendente } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmModal from "@/components/ConfirmModal";

export default function CidadaosPendentesPage() {
  const [pendentes, setPendentes] = useState<CidadaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [aprovando, setAprovando] = useState<CidadaoPendente | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listCidadaosPendentes()
      .then(setPendentes)
      .catch(() => toast.error("Falha ao carregar cadastros pendentes"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const aprovar = async () => {
    if (!aprovando) return;
    setSalvando(true);
    try {
      await api.aprovarCidadao(aprovando.id);
      toast.success(`Cadastro de ${aprovando.nome} aprovado`);
      setAprovando(null);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar cadastro");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Cidadãos pendentes"
        subtitle="Cadastros externos (portal do cidadão) aguardando aprovação do órgão."
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : pendentes.length === 0 ? (
          <EmptyState icon="person_check" title="Nenhum cadastro pendente" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {pendentes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-container-low transition-colors">
                  <div>
                    <p className="text-body-md text-on-surface">{c.nome}</p>
                    <p className="text-body-sm text-on-surface-variant">
                      {c.cpf_cnpj ?? "sem CPF/CNPJ"} {c.email && `· ${c.email}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setAprovando(c)}
                    className="h-10 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors flex-shrink-0"
                  >
                    Aprovar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(aprovando)}
        title="Aprovar cadastro"
        message={`Confirma a aprovação do cadastro de "${aprovando?.nome}"? O cidadão passará a poder peticionar no portal.`}
        confirmLabel="Aprovar"
        loading={salvando}
        onConfirm={aprovar}
        onCancel={() => setAprovando(null)}
      />
    </div>
  );
}
