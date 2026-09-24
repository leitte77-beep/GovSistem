"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, AuditoriaRegistro } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<AuditoriaRegistro[]>([]);
  const [entidade, setEntidade] = useState("");
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRegistros(await api.auditoria(entidade || undefined));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [entidade]);

  useEffect(() => { carregar(); }, [carregar]);

  const ENTIDADES = ["veiculo", "motorista", "abastecimento", "tanque", "entrada_combustivel", "manutencao", "ocorrencia", "plano_preventivo"];

  return (
    <RequirePermission perms={["audit.view", "vehicle.view"]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Auditoria</h1>
          <select value={entidade} onChange={(e) => setEntidade(e.target.value)}
            className="rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm">
            <option value="">Todas as entidades</option>
            {ENTIDADES.map((en) => <option key={en} value={en}>{en.replace("_", " ")}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-200 text-body-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                <th className="px-4 py-3">Data / hora</th>
                <th className="px-4 py-3">Operação</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td colSpan={5} className="px-4 py-8 animate-pulse text-center text-text-subtle">Carregando…</td></tr>}
              {!carregando && registros.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-subtle">Nenhum registro de auditoria.</td></tr>
              )}
              {registros.map((r) => (
                <tr key={r.id} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 font-medium">{r.acao}</td>
                  <td className="px-4 py-3">{r.entidade.replace("_", " ")}</td>
                  <td className="px-4 py-3">{r.motorista_id ? "Motorista" : r.usuario_id ? "Administrador" : "—"}</td>
                  <td className="px-4 py-3 text-text-subtle">{r.justificativa ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </RequirePermission>
  );
}
