"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AlertTriangle, Bell, CheckCheck, ChevronRight, CircleAlert, Info } from "lucide-react";
import { AlertaAtual, api, NotificacaoItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

const SEVERIDADE: Record<string, { rotulo: string; classe: string; icone: React.ReactNode }> = {
  CRITICO: { rotulo: "Crítico", classe: "bg-[#FFDAD6] text-[#93000A]", icone: <CircleAlert size={16} /> },
  ALERTA: { rotulo: "Atenção", classe: "bg-[#FFF4D6] text-[#7A4F00]", icone: <AlertTriangle size={16} /> },
  INFO: { rotulo: "Aviso", classe: "bg-[#EFF4FF] text-[#1D4ED8]", icone: <Info size={16} /> },
};

const TIPOS: Record<string, string> = {
  OCORRENCIA: "Ocorrência",
  CNH: "CNH",
  ESTOQUE: "Estoque",
  PREVENTIVA: "Preventiva",
  DOCUMENTO: "Documento",
  ABASTECIMENTO: "Abastecimento",
};

export default function AlertasPage() {
  const [atuais, setAtuais] = useState<AlertaAtual[] | null>(null);
  const [eventos, setEventos] = useState<NotificacaoItem[]>([]);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [a, n] = await Promise.all([api.alertas(), api.notificacoes(apenasNaoLidas || undefined)]);
      setAtuais(a.itens);
      setEventos(n);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [apenasNaoLidas]);

  useEffect(() => { carregar(); }, [carregar]);

  async function marcarLida(n: NotificacaoItem) {
    try {
      await api.marcarLida(n.id);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function marcarTodas() {
    try {
      await api.marcarTodasLidas();
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const tiposPresentes = Array.from(new Set((atuais ?? []).map((a) => a.tipo)));
  const visiveis = (atuais ?? []).filter((a) => !filtroTipo || a.tipo === filtroTipo);

  return (
    <RequirePermission perms="vehicle.view">
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-h2 text-text-title">Alertas</h1>
          <p className="mt-1 text-body-sm text-text-subtle">
            O que precisa de atenção na frota agora e os abastecimentos marcados para conferência.
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-label font-semibold text-text-title">Pendências agora</h2>
            {tiposPresentes.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setFiltroTipo("")}
                  className={`rounded-pill px-3 py-1 text-meta ${!filtroTipo ? "bg-[#1D4ED8] text-white" : "bg-surface-bg text-text-body"}`}
                >
                  Todas
                </button>
                {tiposPresentes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFiltroTipo(t)}
                    className={`rounded-pill px-3 py-1 text-meta ${filtroTipo === t ? "bg-[#1D4ED8] text-white" : "bg-surface-bg text-text-body"}`}
                  >
                    {TIPOS[t] ?? t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white shadow-card">
            {atuais === null && <li className="h-24 animate-pulse bg-surface-bg" />}
            {atuais !== null && visiveis.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-text-subtle">
                <CheckCheck size={28} />
                <span className="text-body-sm">Nada pendente. Frota em dia.</span>
              </li>
            )}
            {visiveis.map((a, i) => {
              const sev = SEVERIDADE[a.severidade] ?? SEVERIDADE.INFO;
              const conteudo = (
                <>
                  <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${sev.classe}`}>{sev.icone}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-medium text-text-title">{a.titulo}</span>
                      <span className="text-meta text-text-subtle">{TIPOS[a.tipo] ?? a.tipo}</span>
                    </span>
                    {a.descricao && <span className="mt-0.5 block text-meta text-text-subtle">{a.descricao}</span>}
                  </span>
                  {a.link && <ChevronRight size={16} className="mt-1 flex-shrink-0 text-text-subtle" />}
                </>
              );
              return (
                <li key={`${a.tipo}-${i}`}>
                  {a.link ? (
                    <Link href={a.link} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-bg/60">{conteudo}</Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-label font-semibold text-text-title">Eventos</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-body-sm text-text-body">
                <input type="checkbox" checked={apenasNaoLidas} onChange={(e) => setApenasNaoLidas(e.target.checked)} />
                Apenas não lidos
              </label>
              {eventos.some((n) => !n.lida) && (
                <button className="btn btn-secondary btn-sm" onClick={marcarTodas}>
                  <CheckCheck size={14} /> Marcar todos como lidos
                </button>
              )}
            </div>
          </div>
          <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white shadow-card">
            {eventos.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-8 text-text-subtle">
                <Bell size={24} />
                <span className="text-body-sm">{apenasNaoLidas ? "Nenhum evento não lido." : "Nenhum evento."}</span>
              </li>
            )}
            {eventos.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${n.lida ? "opacity-70" : ""}`}>
                <div className="min-w-0">
                  {n.link ? (
                    <Link href={n.link} className="text-body-sm font-medium text-text-title hover:text-[#1D4ED8]">{n.titulo}</Link>
                  ) : (
                    <span className="text-body-sm font-medium text-text-title">{n.titulo}</span>
                  )}
                  {n.descricao && <p className="mt-0.5 text-meta text-text-body">{n.descricao}</p>}
                  <p className="mt-0.5 text-meta text-text-subtle">
                    {new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                {!n.lida && (
                  <button className="btn btn-secondary btn-sm flex-shrink-0" onClick={() => marcarLida(n)}>Marcar lido</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </RequirePermission>
  );
}
