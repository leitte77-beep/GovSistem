"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Save, ArrowLeft, Loader2 } from "lucide-react";

const categoryOptions = [
  { value: "supplies", label: "Suprimentos" },
  { value: "services", label: "Servicos" },
  { value: "products", label: "Produtos" },
  { value: "subscription", label: "Assinatura" },
  { value: "other", label: "Outros" },
];

const paymentMethodOptions = [
  { value: "", label: "Selecione..." },
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "credit_card", label: "Cartao de Credito" },
  { value: "debit_card", label: "Cartao de Debito" },
  { value: "ted", label: "TED" },
  { value: "cash", label: "Dinheiro" },
  { value: "other", label: "Outro" },
];

interface FormErrors {
  customer_name?: string;
  description?: string;
  amount?: string;
  due_date?: string;
}

export default function NewContaReceberPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState({
    customer_name: "",
    description: "",
    amount: "",
    due_date: "",
    category: "other",
    document_number: "",
    payment_method: "",
    competence_date: "",
    notes: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (errors[name as keyof FormErrors]) {
      setErrors({ ...errors, [name]: undefined });
    }
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.customer_name.trim()) errs.customer_name = "Cliente e obrigatorio";
    if (!form.description.trim()) errs.description = "Descricao e obrigatoria";
    const amountNum = parseFloat(form.amount.replace(",", "."));
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) errs.amount = "Valor invalido";
    if (!form.due_date) errs.due_date = "Vencimento e obrigatorio";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const amountCents = Math.round(parseFloat(form.amount.replace(",", ".")) * 100);
      await api("/receivables", {
        method: "POST",
        body: {
          customer_name: form.customer_name.trim(),
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
      toast.success("Conta a receber criada!");
      router.push("/contas-receber");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta a receber");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (name: keyof FormErrors) =>
    `w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm ${
      errors[name] ? "border-red-400 bg-red-50" : "border-gray-300"
    }`;

  return (
    <AppLayout title="Nova Conta a Receber">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/contas-receber" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Nova Conta a Receber</h2>
            <p className="text-sm text-gray-500">Registre um novo recebimento ou fatura a receber.</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                <input
                  name="customer_name" type="text" required
                  value={form.customer_name} onChange={handleChange}
                  className={fieldClass("customer_name")}
                  placeholder="Nome do cliente"
                />
                {errors.customer_name && <p className="mt-1 text-xs text-red-500">{errors.customer_name}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descricao *</label>
                <input
                  name="description" type="text" required
                  value={form.description} onChange={handleChange}
                  className={fieldClass("description")}
                  placeholder="Descricao do recebimento"
                />
                {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                <input
                  name="amount" type="text" inputMode="decimal" required
                  value={form.amount} onChange={handleChange}
                  className={fieldClass("amount")}
                  placeholder="0,00"
                />
                {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
                <input
                  name="due_date" type="date" required
                  value={form.due_date} onChange={handleChange}
                  className={fieldClass("due_date")}
                />
                {errors.due_date && <p className="mt-1 text-xs text-red-500">{errors.due_date}</p>}
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
                <input
                  name="document_number" type="text"
                  value={form.document_number} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="NF ou fatura"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Competencia</label>
                <input
                  name="competence_date" type="date"
                  value={form.competence_date} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
                <textarea
                  name="notes" rows={3}
                  value={form.notes} onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm resize-none"
                  placeholder="Observacoes adicionais..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href="/contas-receber"
                className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </Link>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
