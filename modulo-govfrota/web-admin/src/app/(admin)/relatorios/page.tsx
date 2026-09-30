"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  api,
  CNHItem,
  RelatorioConsumo,
  RelatorioEstoque,
  RelatorioManutencoes,
  RelatorioSecretarias,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequirePermission } from "@/components/RequirePermission";
import { AbaAbastecimentos, FILTROS_VAZIOS, FiltrosAbastecimento } from "@/components/relatorios/AbaAbastecimentos";

type Aba = "secretarias" | "abastecimentos" | "consumo" | "estoque" | "manutencoes" | "cnh";

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Atalhos de período: [início, fim] em AAAA-MM-DD (fuso do navegador). */
function periodo(tipo: "hoje" | "mes" | "mes_passado" | "ano"): [string, string] {
  const h = new Date();
  if (tipo === "hoje") return [iso(h), iso(h)];
  if (tipo === "mes") return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)];
  if (tipo === "mes_passado") return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))];
  return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)];
}

const ATALHOS = [["hoje", "Hoje"], ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["ano", "Este ano"]] as const;

export default function RelatoriosPage() {
  const { restrito } = useAuth();
  const [aba, setAba] = useState<Aba>("secretarias");
  const [[dataInicio, dataFim], setPeriodo] = useState<[string, string]>(() => periodo("mes"));
  const setDataInicio = (v: string) => setPeriodo([v, dataFim]);
  const setDataFim = (v: string) => setPeriodo([dataInicio, v]);
  const [filtrosAbast, setFiltrosAbast] = useState<FiltrosAbastecimento>(FILTROS_VAZIOS);
  const [relConsumo, setRelConsumo] = useState<RelatorioConsumo | null>(null);
  const [relEstoque, setRelEstoque] = useState<RelatorioEstoque | null>(null);
  const [relManut, setRelManut] = useState<RelatorioManutencoes | null>(null);
  const [cnh, setCnh] = useState<{ itens: CNHItem[] } | null>(null);
  const [relSecretarias, setRelSecretarias] = useState<RelatorioSecretarias | null>(null);
  const [publico, setPublico] = useState(true);

  useEffect(() => {
    api.getConfiguracoes().then((c) => setPublico(c.tipo_organizacao !== "PRIVADO")).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    try {
      if (aba === "secretarias") setRelSecretarias(await api.relatorioSecretarias({ data_inicio: dataInicio || undefined, data_fim: dataFim || undefined }));
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
    if (endpoint === "abastecimentos") Object.entries(filtrosAbast).forEach(([k, v]) => v && params.set(k, v));
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
    secretarias: "secretarias",
    abastecimentos: "abastecimentos",
    consumo: "veiculos/consumo",
    estoque: "estoque",
    manutencoes: "manutencoes",
    cnh: "motoristas/cnh",
  };

  const abas = [
    { chave: "secretarias", label: publico ? "Por secretaria" : "Por centro de custo" },
    { chave: "abastecimentos", label: "Abastecimentos" },
    { chave: "consumo", label: "Consumo por veículo" },
    { chave: "estoque", label: "Estoque" },
    { chave: "manutencoes", label: "Manutenções" },
    { chave: "cnh", label: "CNHs" },
  ] as const;
  // Estoque e CNHs são da organização toda — fora do alcance de quem vê só a secretaria.
  const abasVisiveis = abas.filter((a) => !(restrito && (a.chave === "estoque" || a.chave === "cnh")));

  return (
    <RequirePermission perms="reports.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Relatórios</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {ATALHOS.map(([k, l]) => {
                const [i, f] = periodo(k);
                const ativo = dataInicio === i && dataFim === f;
                return (
                  <button key={k} onClick={() => setPeriodo([i, f])}
                    className={`rounded-btn px-2.5 py-1.5 text-meta ${ativo ? "bg-[#1D4ED8] font-medium text-white" : "border border-surface-border bg-white text-text-body hover:bg-surface-bg"}`}>
                    {l}
                  </button>
                );
              })}
            </div>
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
          {abasVisiveis.map((a) => (
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

        {aba === "secretarias" && relSecretarias && (
          <>
            <p className="text-body-sm text-text-subtle">
              {new Date(relSecretarias.periodo.inicio + "T12:00").toLocaleDateString("pt-BR")} a{" "}
              {new Date(relSecretarias.periodo.fim + "T12:00").toLocaleDateString("pt-BR")} · total {reais(relSecretarias.total)}
              
            </p>
            {relSecretarias.itens.length === 0 ? (
              <p className="rounded-card border border-surface-border bg-white px-4 py-8 text-center text-body-sm text-text-subtle">
                Sem gastos no período.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
                <table className="w-full min-w-200 text-body-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                      <th className="px-4 py-3">{publico ? "Secretaria" : "Centro de custo"}</th>
                      <th className="px-4 py-3 text-right">Veículos</th>
                      <th className="px-4 py-3 text-right">Litros</th>
                      <th className="px-4 py-3 text-right">Comb. tanque</th>
                      <th className="px-4 py-3 text-right">Comb. posto</th>
                      <th className="px-4 py-3 text-right">Manutenção</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relSecretarias.itens.map((i) => (
                      <tr key={i.unidade_id ?? "sem"} className="border-b border-surface-border last:border-0">
                        <td className={`px-4 py-2 font-medium ${i.unidade_id ? "" : "italic text-text-subtle"}`}>{i.unidade}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{i.veiculos}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{i.litros.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{reais(i.combustivel_tanque)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{reais(i.combustivel_posto)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{reais(i.manutencao)}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{reais(i.total)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-bg">
                              <div className="h-full bg-[#1D4ED8]" style={{ width: `${Math.min(i.participacao_pct, 100)}%` }} />
                            </div>
                            <span className="text-meta tabular-nums text-text-subtle">{i.participacao_pct.toLocaleString("pt-BR")}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {aba === "abastecimentos" && (
          <AbaAbastecimentos dataInicio={dataInicio} dataFim={dataFim} filtros={filtrosAbast} setFiltros={setFiltrosAbast} publico={publico} />
        )}

        {aba === "consumo" && relConsumo && (
          <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
            <table className="w-full min-w-200 text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                  <th className="px-4 py-3">Placa</th><th className="px-4 py-3">KM / horas</th><th className="px-4 py-3">Litros</th>
                  <th className="px-4 py-3">Consumo médio</th><th className="px-4 py-3">Combustível</th><th className="px-4 py-3">Manutenção</th>
                  <th className="px-4 py-3">Total</th><th className="px-4 py-3">Custo/km</th>
                </tr>
              </thead>
              <tbody>
                {relConsumo.itens.map((i) => (
                  <tr key={i.placa} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-2 font-medium">{i.placa}</td>
                    <td className="px-4 py-2">
                      {i.usa_horimetro ? `${(i.horas_trabalhadas ?? 0).toLocaleString("pt-BR")} h` : `${i.km_rodados.toLocaleString("pt-BR")} km`}
                    </td>
                    <td className="px-4 py-2">{i.litros.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2">
                      {i.consumo_l_h ? `${i.consumo_l_h} L/h` : i.consumo_medio ? `${i.consumo_medio} km/L` : "—"}
                    </td>
                    <td className="px-4 py-2">{reais(i.valor_combustivel)}</td>
                    <td className="px-4 py-2">{reais(i.valor_manutencao)}</td>
                    <td className="px-4 py-2 font-medium">{reais(i.custo_total)}</td>
                    <td className="px-4 py-2">{i.custo_por_km ? i.custo_por_km.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 }) : "—"}</td>
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
                    {ent && ` · 30d: +${ent.litros.toLocaleString("pt-BR")} L (${reais(ent.valor)})`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {aba === "manutencoes" && relManut && (
          <>
            <p className="text-body-sm text-text-subtle">
              {relManut.total_registros} manutenções · {reais(relManut.valor_total)}
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
                      <td className="px-4 py-2">{reais(m.valor_total)}</td>
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
