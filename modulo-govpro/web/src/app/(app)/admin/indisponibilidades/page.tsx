"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Indisponibilidade } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import { formatDateTime } from "@/lib/format";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

const TIPO_OPTIONS = [
  { value: "PROGRAMADA", label: "Programada (manutenção)" },
  { value: "INCIDENTE", label: "Incidente" },
];

export default function IndisponibilidadesPage() {
  const [itens, setItens] = useState<Indisponibilidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listIndisponibilidades()
      .then(setItens)
      .catch(() => toast.error("Falha ao carregar indisponibilidades"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const fields: CatalogField[] = [
    { name: "tipo", label: "Tipo", type: "select", options: TIPO_OPTIONS, span: 1 },
    { name: "inicio", label: "Início", type: "text", required: true, help: "Formato ISO 8601, ex.: 2026-08-14T09:00:00", span: 1 },
    { name: "fim", label: "Fim (deixe vazio se ainda em curso)", type: "text", span: 1 },
    { name: "escopo", label: "Escopo (opcional)", type: "text", span: 1 },
    { name: "causa", label: "Causa", type: "textarea", required: true, span: 2 },
  ];

  const abrir = () => setModalAberto(true);

  const registrar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      await api.registrarIndisponibilidade({
        tipo: (values.tipo as string) || "INCIDENTE",
        inicio: values.inicio as string,
        fim: (values.fim as string) || null,
        escopo: (values.escopo as string) || null,
        causa: values.causa as string,
      });
      toast.success("Indisponibilidade registrada — prazos afetados serão prorrogados automaticamente");
      setModalAberto(false);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar");
    } finally {
      setSalvando(false);
    }
  };

  const encerrar = async (item: Indisponibilidade) => {
    setSalvando(true);
    try {
      await api.encerrarIndisponibilidade(item.id, new Date().toISOString());
      toast.success("Indisponibilidade encerrada");
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao encerrar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Indisponibilidades"
        subtitle="Registro de indisponibilidade do sistema — prorroga automaticamente os prazos afetados."
        actions={
          <button
            onClick={abrir}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Registrar indisponibilidade
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : itens.length === 0 ? (
          <EmptyState icon="cloud_off" title="Nenhuma indisponibilidade registrada" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Início</th>
                  <th className="px-4 py-3">Fim</th>
                  <th className="px-4 py-3">Causa</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {itens.map((i) => (
                  <tr key={i.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3"><Badge tone="neutral">{i.tipo}</Badge></td>
                    <td className="px-4 py-3 text-body-sm whitespace-nowrap">{formatDateTime(i.inicio)}</td>
                    <td className="px-4 py-3 text-body-sm whitespace-nowrap">{formatDateTime(i.fim)}</td>
                    <td className="px-4 py-3 text-body-md text-on-surface">{i.causa}</td>
                    <td className="px-4 py-3">
                      {i.encerrada ? <Badge tone="success">Encerrada</Badge> : <Badge tone="warning">Em curso</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {!i.encerrada && (
                        <button
                          onClick={() => encerrar(i)}
                          disabled={salvando}
                          className="h-9 px-3 text-label-md border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-60"
                        >
                          Encerrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CatalogFormModal
        open={modalAberto}
        title="Registrar indisponibilidade"
        fields={fields}
        initialValues={{ tipo: "INCIDENTE", inicio: "", fim: "", escopo: "", causa: "" }}
        submitting={salvando}
        onSubmit={registrar}
        onCancel={() => setModalAberto(false)}
      />
    </div>
  );
}
