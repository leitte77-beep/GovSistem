"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Layers, RefreshCw } from "lucide-react";
import type { PublicationQueue } from "@/types/edition";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import toast from "react-hot-toast";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PublicationQueuePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<PublicationQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [publicationDate, setPublicationDate] = useState(todayISO);
  const [queueDate, setQueueDate] = useState("");
  const [editionType, setEditionType] = useState("normal");

  const load = useCallback(() => {
    setLoading(true);
    api
      .getPublicationQueue(queueDate || undefined)
      .then(setQueue)
      .catch((err) => notifyError("PublicationQueue", err))
      .finally(() => setLoading(false));
  }, [queueDate]);

  useEffect(() => {
    load();
  }, [load]);

  const createFromQueue = async () => {
    if (!queue || queue.total === 0) return;
    setBusy(true);
    try {
      const edition = await api.createEdition({
        year: Number(publicationDate.slice(0, 4)),
        type: editionType,
        publication_date: publicationDate,
        auto_fill_approved: true,
        queue_date: queueDate || undefined,
      });
      toast.success(
        `Edição ${edition.year}/${edition.number} criada com ${edition.item_count} matéria(s).`
      );
      router.push(`/editions/${edition.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar edição");
    } finally {
      setBusy(false);
    }
  };

  const itemCount = queue?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <PageHeader
        eyebrow="Publicação"
        title="Fila de publicação"
        description="Matérias aprovadas aguardando publicação. Crie a edição e o sistema classifica e ordena automaticamente."
        actions={
          <Link href="/editions" className="btn-outline">
            <ArrowLeft size={18} aria-hidden="true" />
            Edições
          </Link>
        }
      />

      <section
        className="mb-5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-card"
        aria-label="Parâmetros da edição"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="block w-full sm:w-56">
            <span className="field-label">Data de publicação</span>
            <input
              type="date"
              value={publicationDate}
              onChange={(e) => setPublicationDate(e.target.value)}
              className="input"
            />
          </label>
          <label className="block w-full sm:w-56">
            <span className="field-label">Filtrar por data do ato</span>
            <input
              type="date"
              value={queueDate}
              onChange={(e) => setQueueDate(e.target.value)}
              className="input"
            />
          </label>
          <label className="block w-full sm:w-48">
            <span className="field-label">Tipo</span>
            <select
              value={editionType}
              onChange={(e) => setEditionType(e.target.value)}
              className="input cursor-pointer"
            >
              <option value="normal">Ordinária</option>
              <option value="extra">Extraordinária</option>
              <option value="suplementar">Suplementar</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <button onClick={load} className="btn-outline">
              <RefreshCw size={16} aria-hidden="true" />
              Atualizar
            </button>
            <button
              onClick={createFromQueue}
              disabled={busy || loading || !queue || queue.total === 0}
              className="btn-primary"
            >
              <Layers size={18} aria-hidden="true" />
              {busy ? "Criando…" : "Criar edição com a fila"}
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-2.5 sm:px-5">
          <p className="text-body-sm text-on-surface-variant" aria-live="polite">
            {loading
              ? "Carregando fila…"
              : itemCount === 0
                ? "Nenhuma matéria na fila"
                : `${itemCount} ${itemCount === 1 ? "matéria aprovada" : "matérias aprovadas"} aguardando publicação`}
          </p>
        </div>

        {loading ? (
          <div className="divide-y divide-outline-variant/30">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-4"><div className="h-11 animate-pulse rounded-lg bg-surface-container-high" /></div>
            ))}
          </div>
        ) : !queue || queue.total === 0 ? (
          <EmptyState
            title="Nenhuma matéria na fila"
            description="As matérias aparecem aqui depois de aprovadas e antes de entrarem em uma edição."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Fila de matérias aprovadas</caption>
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low">
                    <th scope="col" className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Matéria</th>
                    <th scope="col" className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Tipo</th>
                    <th scope="col" className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Órgão</th>
                    <th scope="col" className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Seção sugerida</th>
                    <th scope="col" className="px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Data do ato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {queue.items.map((item) => (
                    <tr key={item.matter_id} className="group transition-colors hover:bg-surface-container-low/70">
                      <td className="px-5 py-4 align-middle">
                        <Link href={`/matters/${item.matter_id}`} className="line-clamp-2 text-body-md font-semibold text-on-surface transition-colors hover:text-primary hover:underline">
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant">
                        {item.act_type_name ?? "—"}
                        {item.act_number ? ` nº ${item.act_number}/${item.act_year ?? ""}` : ""}
                      </td>
                      <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant">{item.org_unit_name ?? "—"}</td>
                      <td className="px-4 py-4 align-middle">
                        <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-1 text-body-sm font-medium text-on-surface-variant">
                          {item.suggested_section}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle text-body-md text-on-surface-variant">
                        {item.act_date ? formatDate(item.act_date) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-outline-variant/40 md:hidden">
              {queue.items.map((item) => (
                <article key={item.matter_id} className="p-4 sm:p-5">
                  <Link href={`/matters/${item.matter_id}`} className="line-clamp-2 text-body-lg font-bold leading-5 text-on-surface hover:text-primary hover:underline">
                    {item.title}
                  </Link>
                  <dl className="my-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-body-sm">
                    <div>
                      <dt className="text-outline">Tipo</dt>
                      <dd className="mt-0.5 font-semibold text-on-surface">
                        {item.act_type_name ?? "—"}
                        {item.act_number ? ` nº ${item.act_number}/${item.act_year ?? ""}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-outline">Órgão</dt>
                      <dd className="mt-0.5 font-semibold text-on-surface">{item.org_unit_name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-outline">Seção sugerida</dt>
                      <dd className="mt-0.5">
                        <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 font-medium text-on-surface-variant">
                          {item.suggested_section}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-outline">Data do ato</dt>
                      <dd className="mt-0.5 font-semibold text-on-surface">{item.act_date ? formatDate(item.act_date) : "—"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
