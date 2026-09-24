"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell } from "lucide-react";
import { api, NotificacaoItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

const SEVERIDADE_CLASSE: Record<string, string> = {
  CRITICA: "bg-red-50 text-[#B42318]",
  ALTA: "bg-orange-50 text-[#B54708]",
  MEDIA: "bg-blue-50 text-[#1D4ED8]",
  INFO: "bg-gray-100 text-gray-600",
};

export default function NotificacoesPage() {
  const [lista, setLista] = useState<NotificacaoItem[]>([]);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await api.notificacoes(apenasNaoLidas || undefined));
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

  return (
    <RequirePermission perms="vehicle.view">
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-text-title">Notificações e alertas</h1>
          <label className="flex items-center gap-2 text-body-sm text-text-body">
            <input type="checkbox" checked={apenasNaoLidas} onChange={(e) => setApenasNaoLidas(e.target.checked)} />
            Apenas não lidas
          </label>
        </div>

        <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white shadow-card">
          {lista.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-4 py-10 text-text-subtle">
              <Bell size={28} />
              <span className="text-body-sm">Sem notificações.</span>
            </li>
          )}
          {lista.map((n) => (
            <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${n.lida ? "opacity-70" : ""}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded-pill px-2 py-0.5 text-meta ${SEVERIDADE_CLASSE[n.severidade] ?? ""}`}>{n.severidade}</span>
                  <span className="text-body-sm font-medium text-text-title">{n.titulo}</span>
                </div>
                <p className="text-meta text-text-subtle mt-1">{new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
              </div>
              {!n.lida && (
                <button className="btn btn-secondary btn-sm" onClick={() => marcarLida(n)}>Marcar lida</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </RequirePermission>
  );
}
