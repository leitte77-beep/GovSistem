"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { BookOpen, FileText, Calendar, ArrowRight, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface IncomeStmt {
  year: number;
  month: number;
  revenue_cents: number;
  expenses_cents: number;
  net_income_cents: number;
}

interface TrialBalanceItem {
  account_id: string;
  debit_cents: number;
  credit_cents: number;
  balance_cents: number;
}

const modules = [
  {
    href: "/contabilidade/plano-contas",
    icon: BookOpen,
    label: "Plano de Contas",
    description: "Estrutura de contas contabeis, planos padrao e cadastro.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    href: "/contabilidade/lancamentos",
    icon: FileText,
    label: "Lancamentos",
    description: "Partidas dobradas, criar, contabilizar e estornar.",
    color: "bg-green-50 text-green-600",
  },
  {
    href: "/contabilidade/periodos",
    icon: Calendar,
    label: "Periodos",
    description: "Abrir, fechar e reabrir periodos mensais.",
    color: "bg-amber-50 text-amber-600",
  },
];

export default function ContabilidadeHubPage() {
  const [income, setIncome] = useState<IncomeStmt | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceItem[]>([]);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    Promise.allSettled([
      api<IncomeStmt>(`/reports/income-statement?year=${y}&month=${m}`).then(setIncome),
      api<{ accounts: TrialBalanceItem[] }>(`/reports/trial-balance?year=${y}&month=${m}`).then((r) => setTrialBalance(r.accounts)),
    ]);
  }, []);

  const totalDebit = trialBalance.reduce((s, a) => s + a.debit_cents, 0);
  const totalCredit = trialBalance.reduce((s, a) => s + a.credit_cents, 0);

  return (
    <AppLayout title="Contabilidade">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Modulo Contabil</h2>
          <p className="text-sm text-gray-500">Escrituracao em partidas dobradas, plano de contas e periodos.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600"><TrendingUp size={20} /></div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Receita (mes)</p>
                <p className="text-xl font-bold text-gray-900">{income ? formatCurrency(income.revenue_cents) : "—"}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600"><TrendingDown size={20} /></div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Despesa (mes)</p>
                <p className="text-xl font-bold text-gray-900">{income ? formatCurrency(income.expenses_cents) : "—"}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${income && income.net_income_cents >= 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Resultado Liquido</p>
                <p className={`text-xl font-bold ${income && income.net_income_cents >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {income ? formatCurrency(income.net_income_cents) : "—"}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {trialBalance.length > 0 && (
          <Card title="Balancete do Mes" className="mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500 w-16">Cod</th>
                  <th className="text-left py-2 font-medium text-gray-500">Conta</th>
                  <th className="text-right py-2 font-medium text-gray-500">Debito</th>
                  <th className="text-right py-2 font-medium text-gray-500">Credito</th>
                  <th className="text-right py-2 font-medium text-gray-500">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.slice(0, 10).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-gray-500 text-xs">{item.account_id.substring(0, 8)}</td>
                    <td className="py-2">{item.account_id}</td>
                    <td className="py-2 text-right text-red-600">{item.debit_cents > 0 ? formatCurrency(item.debit_cents) : ""}</td>
                    <td className="py-2 text-right text-green-600">{item.credit_cents > 0 ? formatCurrency(item.credit_cents) : ""}</td>
                    <td className={`py-2 text-right font-medium ${item.balance_cents >= 0 ? "text-gray-900" : "text-red-600"}`}>
                      {formatCurrency(Math.abs(item.balance_cents))} {item.balance_cents >= 0 ? "D" : "C"}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-gray-300">
                  <td colSpan={2} className="py-2 text-right">Totais</td>
                  <td className="py-2 text-right text-red-600">{formatCurrency(totalDebit)}</td>
                  <td className="py-2 text-right text-green-600">{formatCurrency(totalCredit)}</td>
                  <td className="py-2 text-right">{formatCurrency(totalDebit - totalCredit)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group">
                <Card padding={false}>
                  <div className="p-6">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${mod.color} mb-4 group-hover:scale-105 transition-transform`}>
                      <Icon size={24} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{mod.label}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{mod.description}</p>
                  </div>
                  <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between text-sm text-primary-600 font-medium">
                    <span>Acessar</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
