"use client";
import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { TrendingUp, DollarSign, Users, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDateOnly } from "@/lib/utils";

interface DashboardData {
  gross_revenue_cents: number;
  monthly_recurring_revenue_cents: number;
  total_receivable_cents: number;
  overdue_count: number;
  total_payable_cents: number;
  active_subscriptions: number;
  month_to_date_invoiced_cents: number;
}

interface AgingBuckets {
  current: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  "91_plus": number;
}

interface ReceivableAgingResponse {
  aging: AgingBuckets;
  total_cents: number;
}

type AgingRow = {
  key: keyof AgingBuckets;
  label: string;
  value: number;
};

interface CashFlowResponse {
  expected_inflow_cents: number;
  expected_inflow_count: number;
  expected_outflow_cents: number;
  expected_outflow_count: number;
  projected_balance_cents: number;
}

interface IncomeStatementResponse {
  year: number;
  month: number;
  revenue_cents: number;
  expenses_cents: number;
  net_income_cents: number;
}

interface MRRDataItem {
  year: number;
  month: number;
  revenue_cents: number;
}

interface MRRResponse {
  data: MRRDataItem[];
}

const bucketLabels: { key: keyof AgingBuckets; label: string }[] = [
  { key: "current", label: "A vencer" },
  { key: "1_30", label: "1-30 dias" },
  { key: "31_60", label: "31-60 dias" },
  { key: "61_90", label: "61-90 dias" },
  { key: "91_plus", label: "90+ dias" },
];

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const kpiCards = [
  {
    key: "mrr",
    label: "Receita Recorrente Mensal (MRR)",
    icon: TrendingUp,
    color: "text-blue-600 bg-blue-100",
  },
  {
    key: "gross_revenue",
    label: "Receita Bruta (Mes)",
    icon: DollarSign,
    color: "text-green-600 bg-green-100",
  },
  {
    key: "total_receivable",
    label: "Total a Receber",
    icon: Calendar,
    color: "text-amber-600 bg-amber-100",
  },
  {
    key: "active_subscriptions",
    label: "Assinaturas Ativas",
    icon: Users,
    color: "text-purple-600 bg-purple-100",
  },
];

export default function DashboardFinanceiroPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [aging, setAging] = useState<ReceivableAgingResponse | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowResponse | null>(null);
  const [incomeStmt, setIncomeStmt] = useState<IncomeStatementResponse | null>(null);
  const [mrrHistory, setMrrHistory] = useState<MRRDataItem[]>([]);
  const [loading, setLoading] = useState(true);

  const agingRows: AgingRow[] = aging
    ? bucketLabels.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        value: Number(aging.aging?.[bucket.key] ?? 0),
      }))
    : [];

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, agingRes, cfRes, isRes, mrrRes] = await Promise.all([
        api<DashboardData>("/reports/dashboard").catch(() => null),
        api<ReceivableAgingResponse>("/reports/receivable-aging").catch(() => null),
        api<CashFlowResponse>("/reports/cash-flow").catch(() => null),
        api<IncomeStatementResponse>("/reports/income-statement").catch(() => null),
        api<MRRResponse>("/reports/mrr").catch(() => null),
      ]);
      if (dashRes) setDashboard(dashRes);
      if (agingRes) setAging(agingRes);
      if (cfRes) setCashFlow(cfRes);
      if (isRes) setIncomeStmt(isRes);
      if (mrrRes?.data) setMrrHistory(mrrRes.data);
    } catch {
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const kpiValue = (key: string): string | number => {
    if (!dashboard) return "-";
    switch (key) {
      case "mrr": return formatCurrency(dashboard.monthly_recurring_revenue_cents);
      case "gross_revenue": return formatCurrency(dashboard.month_to_date_invoiced_cents);
      case "total_receivable": return formatCurrency(dashboard.total_receivable_cents);
      case "active_subscriptions": return dashboard.active_subscriptions;
      default: return "-";
    }
  };

  const kpiSubtext = (key: string): string | null => {
    if (!dashboard) return null;
    switch (key) {
      case "mrr": return formatCurrency(dashboard.gross_revenue_cents) + " receita total";
      case "total_receivable": return `${dashboard.overdue_count} vencidos`;
      case "gross_revenue": return formatCurrency(dashboard.monthly_recurring_revenue_cents) + " MRR";
      default: return null;
    }
  };

  return (
    <AppLayout title="Dashboard Financeiro">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h2>
        <p className="mt-1 text-sm text-gray-500">
          Visao geral de receitas, MRR, fluxo de caixa e DRE.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.key} padding={false}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${kpi.color}`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-sm text-gray-500">{kpi.label}</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? (
                    <span className="text-gray-300">---</span>
                  ) : (
                    kpiValue(kpi.key)
                  )}
                </div>
                {!loading && kpiSubtext(kpi.key) && (
                  <p className="mt-1 text-xs text-gray-400">{kpiSubtext(kpi.key)}</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card title="Contas a Receber - Aging" padding={false}>
          <div className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-gray-400">Carregando...</div>
            ) : !aging ? (
              <div className="p-6 text-sm text-gray-400">Nenhum dado disponivel</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Periodo</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {agingRows.map((bucket) => (
                    <tr key={bucket.key} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-900">{bucket.label}</td>
                      <td className="px-6 py-3 text-right font-medium">{formatCurrency(bucket.value)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-6 py-3 text-gray-700">Total</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(aging.total_cents)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card title="Fluxo de Caixa (Projecao)" padding={false}>
          {loading ? (
            <div className="p-6 text-sm text-gray-400">Carregando...</div>
          ) : !cashFlow ? (
            <div className="p-6 text-sm text-gray-400">Nenhum dado disponivel</div>
          ) : (
            <div className="p-0">
              <div className="grid grid-cols-2 gap-4 p-6">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Entradas Previstas</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(cashFlow.expected_inflow_cents)}
                  </p>
                  <p className="text-xs text-gray-400">{cashFlow.expected_inflow_count} recebiveis</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Saidas Previstas</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(cashFlow.expected_outflow_cents)}
                  </p>
                  <p className="text-xs text-gray-400">{cashFlow.expected_outflow_count} contas</p>
                </div>
              </div>
              <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between text-sm font-semibold">
                <span className="text-gray-700">Saldo Projetado</span>
                <span className={cashFlow.projected_balance_cents >= 0 ? "text-green-600" : "text-red-600"}>
                  {formatCurrency(cashFlow.projected_balance_cents)}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <Card title="DRE (Resumo)" padding={false}>
          {loading ? (
            <div className="p-6 text-sm text-gray-400">Carregando...</div>
          ) : !incomeStmt ? (
            <div className="p-6 text-sm text-gray-400">Nenhum dado disponivel</div>
          ) : (
            <div className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Conta</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Valor</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50">
                    <td className="px-6 py-3 text-gray-900">Receitas</td>
                    <td className="px-6 py-3 text-right font-medium">{formatCurrency(incomeStmt.revenue_cents)}</td>
                    <td className="px-6 py-3 text-right">
                      <Badge variant="success">Receita</Badge>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-6 py-3 text-gray-900">Despesas</td>
                    <td className="px-6 py-3 text-right font-medium">{formatCurrency(incomeStmt.expenses_cents)}</td>
                    <td className="px-6 py-3 text-right">
                      <Badge variant="danger">Despesa</Badge>
                    </td>
                  </tr>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-6 py-3 text-gray-700">Resultado Liquido</td>
                    <td className={`px-6 py-3 text-right ${incomeStmt.net_income_cents >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(incomeStmt.net_income_cents)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {incomeStmt.net_income_cents >= 0 ? (
                        <Badge variant="success">Lucro</Badge>
                      ) : (
                        <Badge variant="danger">Prejuizo</Badge>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Historico MRR" padding={false}>
          {loading ? (
            <div className="p-6 text-sm text-gray-400">Carregando...</div>
          ) : mrrHistory.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">Nenhum dado disponivel</div>
          ) : (
            <div className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Mes</th>
                    <th className="text-right px-6 py-3 font-medium text-gray-500">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {mrrHistory.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-900 font-medium">
                        {MONTHS[item.month - 1]}/{item.year}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-green-600">
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpRight size={14} />
                          {formatCurrency(item.revenue_cents)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
