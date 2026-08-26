"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, Ocorrencia, VeiculoListItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

const GRAVIDADE_CLASSE: Record<string, string> = {
  BAIXA: "bg-gray-100 text-gray-600",
  MEDIA: "bg-blue-50 text-[#1D4ED8]",
  ALTA: "bg-orange-50 text-[#B54708]",
  CRITICA: "bg-red-50 text-[#B42318]",
};

export default function OcorrenciasPage() {
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [form, setForm] = useState({ veiculo_id: "", categoria: "MECANICO", descricao: "", gravidade: "MEDIA" });

  const carregar = useCallback(async () => {
    try {
      setLista(await api.listOcorrencias({ status: filtroStatus || undefined }));
      setVeiculos((await api.listVeiculos({ limit: 200 })).itens);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  async function resolver(o: Ocorrencia) {
    try {
      await api.atualizarOcorrencia(o.id, { status: "RESOLVIDA" });
      toast.success("Ocorrência resolvida.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <RequirePermission perms="vehicle.view">
      <div className="space-y-4">
        <h1 className="text-h2 text-text-title">Ocorrências / Problemas</h1>

        <RequirePermission perms="occurrence.manage">
          <form
            className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.createOcorrencia(form);
                toast.success("Problema registrado.");
                setForm({ ...form, descricao: "" });
                carregar();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <select required value={form.veiculo_id} onChange={(e) => setForm({ ...form, veiculo_id: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm">
              <option value="">Veículo…</option>
              {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
            </select>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm">
              {["MECANICO", "PNEU", "LUZ_PAINEL", "FREIO", "AVARIA", "ACIDENTE", "ELETRICO", "OUTRO"].map((c) => (
                <option key={c} value={c}>{c.replace("_", " ")}</option>
              ))}
            </select>
            <select value={form.gravidade} onChange={(e) => setForm({ ...form, gravidade: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm">
              {["BAIXA", "MEDIA", "ALTA", "CRITICA"].map((g) => <option key={g}>{g}</option>)}
            </select>
            <input required placeholder="Descrição do problema" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm sm:col-span-3" />
            <button className="btn btn-primary">Registrar problema</button>
          </form>
        </RequirePermission>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {["", "ABERTA", "EM_ANALISE", "RESOLVIDA"].map((s) => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`rounded-pill px-3 py-1 text-meta ${filtroStatus === s ? "bg-[#1D4ED8] text-white" : "bg-surface-bg text-text-body"}`}>
                {s === "" ? "Todas" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-surface-border overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          {lista.length === 0 && <li className="px-4 py-8 text-center text-body-sm text-text-subtle">Nenhuma ocorrência.</li>}
          {lista.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="text-body-sm font-medium text-text-title">
                  {veiculos.find((v) => v.id === o.veiculo_id)?.placa ?? "—"} · {o.categoria.replace("_", " ")}
                  <span className={`ml-2 rounded-pill px-2 py-0.5 text-meta ${GRAVIDADE_CLASSE[o.gravidade] ?? ""}`}>{o.gravidade}</span>
                  <span className={`ml-2 rounded-pill px-2 py-0.5 text-meta ${o.status === "RESOLVIDA" ? "bg-green-50 text-[#067647]" : "bg-gray-100 text-gray-600"}`}>
                    {o.status.replace("_", " ")}
                  </span>
                </div>
                <p className="truncate text-meta text-text-subtle">{o.descricao}</p>
              </div>
              <div className="flex gap-2">
                {o.status !== "RESOLVIDA" && (
                  <RequirePermission perms="occurrence.manage">
                    <button className="btn btn-secondary btn-sm" onClick={() => resolver(o)}>Resolver</button>
                  </RequirePermission>
                )}
                <RequirePermission perms="maintenance.manage">
                  {!o.manutencao_id && o.status !== "RESOLVIDA" && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          await api.converterEmManutencao(o.id);
                          toast.success("Convertida em manutenção corretiva.");
                          carregar();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Converter em manutenção
                    </button>
                  )}
                </RequirePermission>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </RequirePermission>
  );
}
