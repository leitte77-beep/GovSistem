"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Truck, Fuel, Wrench, AlertTriangle, TrendingUp, Gauge } from "lucide-react";
import { api, Dashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Card({ titulo, valor, sub, icone: Icone, cor }: { titulo: string; valor: string | number; sub?: string; icone: React.ElementType; cor: string }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className={`flex h-11 w-11 items-center justify-center rounded-btn ${cor}`}>
        <Icone size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-meta text-text-subtle">{titulo}</div>
        <div className="text-h2 text-text-title">{valor}</div>
        {sub && <div className="text-meta text-text-subtle">{sub}</div>}
      </div>
    </div>
  );
}

function BarraEstoque({ tanque }: { tanque: Dashboard["tanques"][number] }) {
  const cor =
    tanque.status_estoque === "CRITICO"
      ? "bg-[#B42318]"
      : tanque.status_estoque === "BAIXO"
      ? "bg-[#B54708]"
      : "bg-[#067647]";
  return (
    <Link href={`/tanques/${tanque.id}`} className="block rounded-card border border-surface-border bg-white p-4 shadow-card hover:shadow-elevated">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-label font-medium text-text-title">{tanque.nome}</span>
        <span
          className={`rounded-pill px-2 py-0.5 text-meta ${
            tanque.status_estoque === "CRITICO"
              ? "bg-red-50 text-[#B42318]"
              : tanque.status_estoque === "BAIXO"
              ? "bg-orange-50 text-[#B54708]"
              : "bg-green-50 text-[#067647]"
          }`}
        >
          {tanque.status_estoque === "NORMAL" ? "Normal" : tanque.status_estoque === "BAIXO" ? "Baixo" : "Crítico"}
        </span>
      </div>
      <div className="text-meta text-text-subtle mb-2">{tanque.combustivel}</div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-bg">
        <div className={`h-full ${cor}`} style={{ width: `${Math.min(tanque.percentual, 100)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-meta text-text-body">
        <span>{tanque.estoque_atual.toLocaleString("pt-BR")} L</span>
        <span>{tanque.percentual.toFixed(0)}% de {tanque.capacidade.toLocaleString("pt-BR")} L</span>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setDados).catch((e) => { setErro(e.message); toast.error(e.message); });
  }, []);

  if (erro) return <p className="text-danger">{erro}</p>;
  if (!dados) return <p className="animate-pulse text-text-subtle">Carregando dashboard…</p>;

  const maxGasto = Math.max(...dados.graficos.evolucao_mensal.map((m) => m.gasto), 1);

  return (
    <div className="space-y-6">
      {/* Frota */}
      <section>
        <h1 className="text-h2 text-text-title mb-3">Visão geral da frota</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card titulo="Total de veículos" valor={dados.frota.total} icone={Truck} cor="bg-blue-50 text-[#1D4ED8]" />
          <Card titulo="Disponíveis" valor={dados.frota.disponiveis} icone={Truck} cor="bg-green-50 text-[#067647]" />
          <Card titulo="Em uso" valor={dados.frota.em_uso} icone={Gauge} cor="bg-blue-50 text-[#2563EB]" />
          <Card titulo="Em manutenção" valor={dados.frota.em_manutencao} icone={Wrench} cor="bg-orange-50 text-[#B54708]" />
          <Card titulo="Indisponíveis" valor={dados.frota.indisponiveis} icone={AlertTriangle} cor="bg-red-50 text-[#B42318]" />
        </div>
      </section>

      {/* Estoque visual dos tanques */}
      {hasPermission("refueling.view") && dados.tanques.length > 0 && (
        <section>
          <h2 className="text-h3 text-text-title mb-3">Estoque de combustíveis</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dados.tanques.map((t) => (
              <BarraEstoque key={t.id} tanque={t} />
            ))}
          </div>
        </section>
      )}

      {/* Abastecimentos + manutenções */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Litros hoje" valor={dados.abastecimentos.hoje_litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} icone={Fuel} cor="bg-blue-50 text-[#1D4ED8]" />
        <Card titulo="Litros no mês" valor={dados.abastecimentos.mes_litros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} icone={Fuel} cor="bg-indigo-50 text-indigo-600" />
        <Card titulo="Gasto no mês (R$)" valor={dados.abastecimentos.mes_gasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} icone={TrendingUp} cor="bg-purple-50 text-purple-600" />
        <Card titulo="Manutenções abertas" valor={dados.manutencao.abertas} sub={`${dados.manutencao.preventivas_vencidas} preventiva(s) vencida(s)`} icone={Wrench} cor="bg-orange-50 text-[#B54708]" />
      </section>

      {/* Problemas */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Ocorrências críticas" valor={dados.ocorrencias_criticas} sub="em aberto" icone={AlertTriangle} cor="bg-red-50 text-[#B42318]" />
        <Card titulo="Preventivas próximas" valor={dados.manutencao.preventivas_proximas} icone={Wrench} cor="bg-blue-50 text-[#1D4ED8]" />
        <Card titulo="Preventivas vencidas" valor={dados.manutencao.preventivas_vencidas} icone={AlertTriangle} cor="bg-orange-50 text-[#B54708]" />
        <Card titulo="Veículos em manutenção" valor={dados.manutencao.veiculos_em_manutencao} icone={Gauge} cor="bg-indigo-50 text-indigo-600" />
      </section>

      {/* Gráficos */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <h3 className="text-label font-semibold text-text-title mb-3">Gasto mensal com combustível (R$)</h3>
          <div className="flex h-40 items-end gap-3">
            {dados.graficos.evolucao_mensal.map((m) => (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-[#3B82F6]" style={{ height: `${(m.gasto / maxGasto) * 130}px`, minHeight: m.gasto > 0 ? 4 : 1 }} title={`R$ ${m.gasto.toLocaleString("pt-BR")}`} />
                <span className="text-meta text-text-subtle">{m.mes.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <h3 className="text-label font-semibold text-text-title mb-3">Veículos que mais consumiram (90 dias)</h3>
          {dados.graficos.ranking_veiculos.length === 0 ? (
            <p className="text-body-sm text-text-subtle">Sem dados no período.</p>
          ) : (
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-meta text-text-subtle">
                  <th className="pb-2">Placa</th>
                  <th className="pb-2">Litros</th>
                  <th className="pb-2">Combustível</th>
                  <th className="pb-2">Manutenção</th>
                </tr>
              </thead>
              <tbody>
                {dados.graficos.ranking_veiculos.map((v) => (
                  <tr key={v.veiculo_id} className="border-b border-surface-border last:border-0">
                    <td className="py-2">
                      <Link href={`/veiculos/${v.veiculo_id}`} className="font-medium text-[#1D4ED8] hover:underline">
                        {v.placa}
                      </Link>
                    </td>
                    <td>{v.litros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L</td>
                    <td>R$ {v.custo_combustivel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                    <td>R$ {v.custo_manutencao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Alertas */}
      {(dados.cnh_alertas.vencidas.length > 0 || dados.cnh_alertas.vence_7.length > 0 || dados.ocorrencias_criticas > 0) && (
        <section className="rounded-card border border-red-200 bg-red-50 p-4">
          <h3 className="text-label font-semibold text-[#B42318] mb-2">Atenção</h3>
          <ul className="space-y-1 text-body-sm text-[#912018]">
            {dados.ocorrencias_criticas > 0 && <li>• {dados.ocorrencias_criticas} ocorrência(s) grave(s) em aberto.</li>}
            {dados.cnh_alertas.vencidas.length > 0 && <li>• {dados.cnh_alertas.vencidas.length} CNH(s) vencida(s).</li>}
            {dados.cnh_alertas.vence_7.map((m) => (
              <li key={m.id}>• CNH de {m.nome} vence em {m.dias_restantes} dia(s).</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
