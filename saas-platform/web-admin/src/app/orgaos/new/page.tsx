"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import AddressForm from "@/components/address/AddressForm";
import type { AddressFields } from "@/components/address/AddressForm";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface FormData {
  name: string;
  slug: string;
  cnpj: string;
  description: string;
  email: string;
  phone: string;
  public_url: string;
  plan_slug: string;
  is_active: boolean;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
}

const emptyForm: FormData = {
  name: "", slug: "", cnpj: "", description: "", email: "", phone: "",
  public_url: "", plan_slug: "", is_active: true,
  address_street: "", address_number: "", address_complement: "",
  address_neighborhood: "", address_city: "", address_state: "", address_zip: "",
  admin_name: "", admin_email: "", admin_password: "",
};

const addressFields: (keyof AddressFields)[] = [
  "address_street", "address_number", "address_complement",
  "address_neighborhood", "address_city", "address_state", "address_zip",
];

function formToAddress(form: FormData): AddressFields {
  return {
    address_street: form.address_street,
    address_number: form.address_number,
    address_complement: form.address_complement,
    address_neighborhood: form.address_neighborhood,
    address_city: form.address_city,
    address_state: form.address_state,
    address_zip: form.address_zip,
  };
}

function addressToForm(addr: AddressFields, form: FormData): FormData {
  const updated = { ...form };
  addressFields.forEach((f) => { (updated as any)[f] = addr[f]; });
  return updated;
}

export default function NewOrganizacaoPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/organizations", { method: "POST", body: form });
      toast.success("Organização criada com sucesso!");
      router.push("/orgaos");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar organização");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#002b54] focus:ring-1 focus:ring-[#002b54] transition-all bg-slate-50/30 placeholder-slate-400 outline-none text-sm";
  const labelClass = "text-xs font-bold text-slate-500 uppercase tracking-wider";

  return (
    <AppLayout title="Nova Organização">
      <div className="max-w-4xl mx-auto space-y-10 pb-20">
        <div className="space-y-2">
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Nova Organização</h2>
          <p className="text-slate-500 text-lg">Cadastre uma nova prefeitura ou órgão público no ecossistema.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#002b54" }}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                Dados da Organização
              </h3>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="org-name">Nome *</label>
                <input id="org-name" name="name" value={form.name} onChange={handleChange} required className={inputClass} placeholder="Prefeitura Municipal de ..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="org-slug">Slug *</label>
                  <div className="relative">
                    <input id="org-slug" name="slug" value={form.slug} onChange={handleChange} required className={inputClass} placeholder="prefeitura-municipal" />
                    <div className="absolute right-3 top-3.5 text-slate-300 pointer-events-none">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="org-cnpj">CNPJ</label>
                  <input id="org-cnpj" name="cnpj" value={form.cnpj} onChange={handleChange} className={inputClass} placeholder="00.000.000/0001-00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="org-description">Descrição</label>
                <textarea id="org-description" name="description" value={form.description} onChange={handleChange} rows={3} className={`${inputClass} resize-none`} placeholder="Descrição da organização..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="org-url">URL Pública</label>
                  <input id="org-url" name="public_url" value={form.public_url} onChange={handleChange} className={inputClass} placeholder="https://diario.prefeitura.gov.br" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="org-plan">Plano</label>
                  <select id="org-plan" name="plan_slug" value={form.plan_slug} onChange={handleChange} className={`${inputClass} appearance-none text-slate-600`}>
                    <option value="">Sem plano</option>
                    <option value="basic">Básico - R$ 99,00</option>
                    <option value="pro">Profissional - R$ 299,00</option>
                    <option value="enterprise">Enterprise - R$ 999,00</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#002b54]" />
                </label>
                <span className="text-sm font-semibold text-slate-700">Organização ativa</span>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#002b54" }}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                Endereço
              </h3>
            </div>
            <div className="p-8">
              <AddressForm
                values={formToAddress(form)}
                onChange={(field, value) => {
                  setForm((prev) => ({ ...prev, [field]: value }));
                }}
                inputClass="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-[#002b54] focus:ring-1 focus:ring-[#002b54] transition-all bg-slate-50/30 placeholder-slate-400 outline-none text-sm"
                labelClass="text-xs font-bold text-slate-500 uppercase tracking-wider"
              />
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#002b54" }}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                  Administrador da Organização
                </h3>
                <p className="text-sm text-slate-500 mt-1">Crie o usuário administrador que será vinculado a esta organização.</p>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="admin-name">Nome</label>
                  <input id="admin-name" name="admin_name" value={form.admin_name} onChange={handleChange} className={inputClass} placeholder="Nome do admin" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="admin-email">Email</label>
                  <input id="admin-email" name="admin_email" value={form.admin_email} onChange={handleChange} type="email" className={inputClass} placeholder="admin@orgao.gov.br" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-md">
                <label className={labelClass} htmlFor="admin-password">Senha</label>
                <div className="relative">
                  <input id="admin-password" name="admin_password" value={form.admin_password} onChange={handleChange} type="password" className={inputClass} placeholder="Senha inicial" />
                </div>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-4 pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="px-10 py-3.5 font-bold text-sm rounded-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              style={{ backgroundColor: "#002b54", color: "white", boxShadow: "0 10px 15px -3px rgba(0,43,84,0.2)" }}
            >
              {saving ? "Salvando..." : "Criar Organização"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/orgaos")}
              className="px-8 py-3.5 bg-white border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
