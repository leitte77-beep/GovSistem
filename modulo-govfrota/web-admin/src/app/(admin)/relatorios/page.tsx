"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { api, CNHItem, RelatorioAbastecimentos, RelatorioConsumo, RelatorioEstoque, RelatorioManutencoes } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

type Aba = "abastecimentos" | "consumo" | "estoque" | "manutencoes" | "cnh";

export default function RelatoriosPage() {
  const [aba, setAba] = useState<Aba>("abastecimentos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [relAbast, setRelAbast] = useState<RelatorioAbastecimentos | null>(null);
  const [relConsumo, setRelConsumo] = useState<RelatorioConsumo | null>(null);
  const [relEstoque, setRelEstoque] = useState<RelatorioEstoque | null>(null);
  const [relManut, setRelManut] = useState<RelatorioManutencoes | null>(null);
  const [cnh, setCnh] = useState<{ itens: CNHItem[] } | null>(null);

  const carregar = useCallback(async () => {
    try {
      if (aba === "abastecimentos") setRelAbast(await api.relatorioAbastecimentos({ data_inicio: dataInicio || undefined, data_fim: dataFim || undefined }));
      if (aba === "consumo") setRelConsumo(await api.relatorioConsumoVeiculos({ data_inicio: dataInicio || undefined, data_fim: dataFim || undefined }));
      if (aba === "estoque") setRelEstoque(await api.relatorioEstoque());
      if (aba === "manutencoes") setRelManut(await api.relatorioManutencoes({ data_inicio: dataInicio || undefined, data_fim: dataFim || undefined }));
      if (aba === "cnh") setCnh(await api.relatorioCNH());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [aba, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  function exportar(endpoint: string, formato: "csv" | "xlsx" | "pdf") {
    const params = new URLSearchParams({ formato });
    if (dataInicio) params.set("data_inicio", dataInicio);
    if (dataFim) params.set("data_fim", dataFim);
    const token = localStorage.getItem("govfrota_access_token");
    fetch(`/api/govfrota/relatorios/${endpoint}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Falha na exportação");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${endpoint.replace("/", "-")}.${formato}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error("Falha na exportação."));
  }

  const endpointDaAba: Record<Aba, string> = {
    abastecimentos: "abastecimentos",
    consumo: "veiculos/consumo",
    estoque: "estoque",
    manutencoes: "manutencoes",
    cnh: "motoristas/cnh",
  };

  const abas = [
    { chave: "abastecimentos", label: "Abastecimentos" },
    { chave: "consumo", label: "Consumo por veículo" },
    { chave: "estoque", label: "Estoque" },
    { chave: "manutencoes", label: "Manutenções" },
    { chave: "cnh", label: "CNHs" },
  ] as const;

  return (
    <RequirePermission perms="reports.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Relatórios</h1>
          <div className="flex gap-2">
            <label className="text-meta">De
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                className="ml-1 rounded-btn border border-surface-border px-2 py-1.5 text-body-sm" />
            </label>
            <label className="text-meta">Até
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                className="ml-1 rounded-btn border border-surface-border px-2 py-1.5 text-body-sm" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-surface-border">
          {abas.map((a) => (
            <button key={a.chave} onClick={() => setAba(a.chave)}
              className={`px-4 py-2 text-body-sm ${aba === a.chave ? "border-b-2 border-[#1D4ED8] font-medium text-[#1D4ED8]" : "text-text-body"}`}>
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportar(endpointDaAba[aba], "csv")} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
            <Download size={14} /> CSV
          </button>
          <button onClick={() => exportar(endpointDaAba[aba], "xlsx")} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
            <FileSpreadsheet size={14} /> Excel (XLSX)
          </button>
          <button onClick={() => exportar(endpointDaAba[aba], "pdf")} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
            <FileText size={14} /> PDF
          </button>
        </div>

        {aba === "abastecimentos" && relAbast && (
          <>
            <p className="text-body-sm text-text-subtle">
              {relAbast.total_registros} registros · {relAbast.total_litros.toLocaleString("pt-BR")} L · R$ {relAbast.total_gasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
              <table className="w-full min-w-200 text-body-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                    <th className="px-4 py-3">Data</th><th className="px-4 py-3">Placa</th><th className="px-4 py-3">Motorista</th>
                    <th className="px-4 py-3">Combustível</th><th className="px-4 py-3">Litros</th><th className="px-4 py-3">KM</th><th className="px-4 py-3">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {relAbast.itens.slice(0, 200).map((i, idx) => (
                    <tr key={idx} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-2">{new Date(i.data).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-2 font-medium">{i.placa}</td>
                      <td className="px-4 py-2">{i.motorista ?? "—"}</td>
                      <td className="px-4 py-2">{i.combustivel}</td>
                      <td className="px-4 py-2">{i.litros.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2">{i.km.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2">{i.custo_total != null ? `R$ ${i.custo_total.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {aba === "consumo" && relConsumo && (
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-200 text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                  <th className="px-4 py-3">Placa</th><th className="px-4 py-3">KM rodados</th><th className="px-4 py-3">Litros</th>
                  <th className="px-4 py-3">Consumo médio</th><th className="px-4 py-3">Combustível</th><th className="px-4 py-3">Manutenção</th>
                  <th className="px-4 py-3">Total</th><th className="px-4 py-3">Custo/km</th>
                </tr>
              </thead>
              <tbody>
                {relConsumo.itens.map((i) => (
                  <tr key={i.placa} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-2 font-medium">{i.placa}</td>
                    <td className="px-4 py-2">{i.km_rodados.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2">{i.litros.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2">{i.consumo_medio ? `${i.consumo_medio} km/L` : "—"}</td>
                    <td className="px-4 py-2">R$ {i.valor_combustivel.toFixed(2)}</td>
                    <td className="px-4 py-2">R$ {i.valor_manutencao.toFixed(2)}</td>
                    <td className="px-4 py-2 font-medium">R$ {i.custo_total.toFixed(2)}</td>
                    <td className="px-4 py-2">{i.custo_por_km ? `R$ ${i.custo_por_km.toFixed(3)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aba === "estoque" && relEstoque && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relEstoque.tanques.map((t) => {
              const pct = t.capacidade > 0 ? (t.estoque_atual / t.capacidade) * 100 : 0;
              const cor = t.estoque_atual <= t.estoque_minimo ? "bg-[#B42318]" : pct <= 30 ? "bg-[#B54708]" : "bg-[#067647]";
              const ent = relEstoque.entradas_30d[t.id];
              return (
                <div key={t.id} className="rounded-card border border-surface-border bg-white p-4 shadow-card">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-text-title">{t.nome}</span>
                    <span className="text-meta text-text-subtle">{t.combustivel}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-surface-bg">
                    <div className={`h-full ${cor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-meta text-text-body">
                    <span>{t.estoque_atual.toLocaleString("pt-BR")} L / {t.capacidade.toLocaleString("pt-BR")} L</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 text-meta text-text-subtle">
                    Mínimo {t.estoque_minimo.toLocaleString("pt-BR")} L
                    {ent && ` · 30d: +${ent.litros.toLocaleString("pt-BR")} L (R$ ${ent.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {aba === "manutencoes" && relManut && (
          <>
            <p className="text-body-sm text-text-subtle">
              {relManut.total_registros} manutenções · R$ {relManut.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
              <table className="w-full min-w-200 text-body-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                    <th className="px-4 py-3">Placa</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Oficina</th><th className="px-4 py-3">Solicitação</th><th className="px-4 py-3">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {relManut.itens.map((m, i) => (
                    <tr key={i} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-2 font-medium">{m.placa}</td>
                      <td className="px-4 py-2">{m.tipo}</td>
                      <td className="px-4 py-2">{m.status.replace("_", " ")}</td>
                      <td className="px-4 py-2">{m.oficina ?? "—"}</td>
                      <td className="px-4 py-2">{new Date(m.data_solicitacao + "T12:00").toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-2">R$ {m.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {aba === "cnh" && cnh && (
          <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
            {cnh.itens.length === 0 && <li className="px-4 py-8 text-center text-text-subtle">Nenhuma CNH.</li>}
            {cnh.itens.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3 text-body-sm">
                <span>{c.nome}</span>
                <span className={`rounded-pill px-2 py-0.5 text-meta ${
                  c.situacao === "VENCIDA" ? "bg-red-50 text-[#B42318]" :
                  c.situacao === "CRITICA" || c.situacao === "ATENCAO" ? "bg-orange-50 text-[#B54708]" : "bg-green-50 text-[#067647]"
                }`}>
                  {c.situacao === "VENCIDA" ? "Vencida" : c.situacao === "OK" ? `Validade ${(c.validade ?? c.cnh_validade ?? "").slice(0, 10).split("-").reverse().join("/")}` : `${c.dias_restantes} dias`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RequirePermission>
  );
}
