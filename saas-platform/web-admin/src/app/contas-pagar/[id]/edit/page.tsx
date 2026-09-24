"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";

interface PayableData {
  id: string;
  supplier_name: string;
  description: string;
  amount_cents: number;
  due_date: string;
  category: string;
  document_number: string | null;
  payment_method: string | null;
  competence_date: string | null;
  notes: string | null;
  status: string;
}

const categoryOptions = [
  { value: "supplies", label: "Suprimentos" },
  { value: "services", label: "Servicos" },
  { value: "utilities", label: "Utilidades" },
  { value: "taxes", label: "Impostos" },
  { value: "other", label: "Outros" },
];

const paymentMethodOptions = [
  { value: "", label: "Selecione..." },
  { value: "pix", label: "Pix" },
  { value: "ted", label: "TED" },
  { value: "boleto", label: "Boleto" },
  { value: "credit_card", label: "Cartao de Credito" },
  { value: "debit_card", label: "Cartao de Debito" },
  { value: "cash", label: "Dinheiro" },
  { value: "other", label: "Outro" },
];

function formatDateInput(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.substring(0, 10);
}

export default function EditContaPagarPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_name: "",
    description: "",
    amount: "",
    due_date: "",
    category: "other",
    document_number: "",
    payment_method: "",
    competence_date: "",
    notes: "",
  });

  useEffect(() => {
    api<PayableData>(`/payables/${id}`)
      .then((data) => {
        setForm({
          supplier_name: data.supplier_name || "",
          description: data.description || "",
          amount: (data.amount_cents / 100).toFixed(2).replace(".", ","),
          due_date: formatDateInput(data.due_date),
          category: data.category || "other",
          document_number: data.document_number || "",
          payment_method: data.payment_method || "",
          competence_date: formatDateInput(data.competence_date),
          notes: data.notes || "",
        });
      })
      .catch(() => toast.error("Erro ao carregar conta a pagar"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier_name.trim() || !form.description.trim() || !form.amount || !form.due_date) {
      toast.error("Preencha os campos obrigatorios");
      return;
    }
    setSaving(true);
    try {
      const amountCents = Math.round(parseFloat(form.amount.replace(",", ".")) * 100);
      await api(`/payables/${id}`, {
        method: "PUT",
        body: {
          supplier_name: form.supplier_name.trim(),
          description: form.description.trim(),
          amount_cents: amountCents,
          due_date: form.due_date,
          category: form.category,
          document_number: form.document_number.trim() || undefined,
          payment_method: form.payment_method || undefined,
          competence_date: form.competence_date || undefined,
          notes: form.notes.trim() || undefined,
        },
      });
      toast.success("Conta a pagar atualizada!");
      router.push("/contas-pagar");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Editar Conta a Pagar">
        <div className="flex items-center justify-center py-32">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Editar Conta a Pagar">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/contas-pagar" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Editar Conta a Pagar</h2>
            <p className="text-sm text-gray-500">Atualize os dados da conta.</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
                <input name="supplier_name" type="text" required value={form.supplier_name} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="Nome do fornecedor" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descricao *</label>
                <input name="description" type="text" required value={form.description} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="Descricao da despesa" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                <input name="amount" type="text" inputMode="decimal" required value={form.amount} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="0,00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
                <input name="due_date" type="date" required value={form.due_date} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select name="category" value={form.category} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
                  {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
                <select name="payment_method" value={form.payment_method} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white">
                  {paymentMethodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Documento</label>
                <input name="document_number" type="text" value={form.document_number} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="NF ou boleto" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Competencia</label>
                <input name="competence_date" type="date" value={form.competence_date} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
                <textarea name="notes" rows={3} value={form.notes} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm resize-none"
                  placeholder="Observacoes adicionais..." />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href="/contas-pagar"
                className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </Link>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Salvando..." : "Atualizar"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
