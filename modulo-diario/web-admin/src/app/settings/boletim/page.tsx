"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { api, type NewsletterOverview } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import PageHeader from "@/components/PageHeader";

type Status = "confirmed" | "pending" | "unsubscribed";

const STATUS: Record<Status, { label: string; plural: string; icon: string; chip: string; tile: string; hint: string }> = {
  confirmed: {
    label: "Confirmado",
    plural: "Confirmados",
    icon: "mark_email_read",
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    tile: "bg-emerald-50 text-emerald-700",
    hint: "Recebem cada nova edição",
  },
  pending: {
    label: "Aguardando",
    plural: "Aguardando confirmação",
    icon: "schedule_send",
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    tile: "bg-amber-50 text-amber-700",
    hint: "Ainda não clicaram no link",
  },
  unsubscribed: {
    label: "Cancelou",
    plural: "Cancelaram",
    icon: "unsubscribe",
    chip: "bg-slate-100 text-slate-700 ring-slate-200",
    tile: "bg-slate-100 text-slate-600",
    hint: "Saíram pelo link do e-mail",
  },
};

const STATUS_KEYS: Status[] = ["confirmed", "pending", "unsubscribed"];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function BoletimPage() {
  const [data, setData] = useState<NewsletterOverview | null>(null);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<Status | "all">("all");

  const load = useCallback(async () => {
    try {
      setData(await api.getNewsletter());
    } catch (err) {
      notifyError("BoletimPage", err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string, email: string) => {
    if (!confirm(`Excluir definitivamente ${email} da lista? Use para pedidos de exclusão de dados (LGPD).`)) return;
    try {
      await api.deleteNewsletterSubscriber(id);
      toast.success("Inscrito excluído.");
      load();
    } catch (err) {
      notifyError("BoletimPage", err);
    }
  };

  const subs = (data?.subscribers ?? []).filter(
    (s) => (tab === "all" || s.status === tab) && s.email.includes(filter.trim().toLowerCase()),
  );
  const total = data ? data.counts.confirmed + data.counts.pending + data.counts.unsubscribed : 0;

  return (
    <div className="mx-auto max-w-5xl px-gutter py-8 animate-fade-up">
      <PageHeader
        eyebrow="Configurações"
        title="Boletim por e-mail"
        description="Cidadãos inscritos pelo portal recebem um e-mail a cada edição publicada. A inscrição só vale depois de confirmada pelo link enviado ao e-mail."
      />

      {/* situação do envio */}
      {data && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 ${
            data.enabled ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-[22px]">
            {data.enabled ? "check_circle" : "warning"}
          </span>
          <div className="text-sm leading-6">
            {data.enabled ? (
              <>
                <p className="font-semibold">Envio automático ativo</p>
                <p>Ao publicar uma edição, cada inscrito confirmado recebe o resumo com o link da edição completa.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Envio de e-mails não configurado</p>
                <p>Sem o SMTP no servidor, o formulário do portal fica indisponível e nenhuma edição é enviada.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* indicadores */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {STATUS_KEYS.map((k) => (
          <div key={k} className="card flex items-center gap-4 p-5">
            <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${STATUS[k].tile}`}>
              <span className="material-symbols-outlined text-[24px]">{STATUS[k].icon}</span>
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold leading-none text-on-surface">{data?.counts[k] ?? "—"}</p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{STATUS[k].plural}</p>
              <p className="text-xs text-on-surface-variant">{STATUS[k].hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* inscritos */}
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-outline-variant p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-headline-sm text-on-surface">Inscritos</h2>
              <p className="text-xs text-on-surface-variant">{total} no total</p>
            </div>
            <div className="relative sm:w-64">
              <span aria-hidden="true" className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">search</span>
              <input
                className="input pl-9"
                placeholder="Buscar e-mail"
                aria-label="Buscar e-mail"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>

          <div role="tablist" aria-label="Filtrar por situação" className="flex gap-1 overflow-x-auto border-b border-outline-variant px-3 py-2">
            {(["all", ...STATUS_KEYS] as const).map((k) => {
              const active = tab === k;
              const count = k === "all" ? total : data?.counts[k] ?? 0;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(k)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  {k === "all" ? "Todos" : STATUS[k].plural}
                  <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-surface-container-high"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {subs.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-on-surface-variant">
                {data ? "contact_mail" : "hourglass_empty"}
              </span>
              <p className="mt-2 text-sm font-semibold text-on-surface">
                {!data ? "Carregando…" : total === 0 ? "Nenhum inscrito ainda" : "Nenhum inscrito neste filtro"}
              </p>
              {data && total === 0 && (
                <p className="mt-1 max-w-sm text-xs text-on-surface-variant">
                  Os cidadãos se inscrevem pelo formulário “Receba as novas edições” na página inicial do portal.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {subs.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-surface-container-low">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                    {s.email.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface" title={s.email}>{s.email}</p>
                    <p className="text-xs text-on-surface-variant">
                      Inscrito em {fmt(s.created_at)}
                      {s.confirmed_at && <> · confirmou em {fmt(s.confirmed_at)}</>}
                    </p>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset sm:inline ${STATUS[s.status].chip}`}>
                    {STATUS[s.status].label}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(s.id, s.email)}
                    aria-label={`Excluir ${s.email}`}
                    title="Excluir definitivamente (LGPD)"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-red-50 hover:text-red-700 focus-visible:bg-red-50 focus-visible:text-red-700"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* envios */}
        <aside className="card h-fit p-5">
          <h2 className="flex items-center gap-2 text-headline-sm text-on-surface">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">outgoing_mail</span>
            Últimos envios
          </h2>
          {data && data.dispatches.length === 0 ? (
            <div className="mt-4 rounded-xl bg-surface-container-low p-4 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-[32px] text-on-surface-variant">send</span>
              <p className="mt-1 text-sm font-semibold text-on-surface">Nenhum envio ainda</p>
              <p className="mt-1 text-xs text-on-surface-variant">O boletim sai sozinho quando uma edição é publicada.</p>
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {data?.dispatches.map((d) => {
                const pct = d.recipients ? Math.round((d.sent / d.recipients) * 100) : 100;
                return (
                  <li key={d.edition} className="rounded-xl border border-outline-variant p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-on-surface">Edição {d.edition}</p>
                      <p className="text-[11px] text-on-surface-variant">{d.finished_at ? fmt(d.finished_at) : "enviando…"}</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high" aria-hidden="true">
                      <div className={`h-full rounded-full ${d.failed ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-on-surface-variant">
                      {d.sent} de {d.recipients} enviados
                      {d.failed > 0 && <span className="font-semibold text-red-700"> · {d.failed} falharam</span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
