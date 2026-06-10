"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

export default function NovaSecretaria() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    slug: "",
    cnpj: "",
    descricao: "",
    ouvidor_responsavel: "",
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#1D4ED8] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createSecretaria({
        nome: form.nome,
        slug: form.slug,
        cnpj: form.cnpj || undefined,
        descricao: form.descricao || undefined,
        ouvidor_responsavel: form.ouvidor_responsavel || undefined,
      });
      toast.success("Secretaria criada com sucesso!");
      router.push("/");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar secretaria");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-h2 text-[#101828]">Nova Secretaria</h1>
        <p className="text-body-sm text-[#667085] mt-1">
          Cadastre uma nova secretaria para o modulo de avaliacao e ouvidoria
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-card shadow-card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-label text-[#101828] mb-1.5">Nome</label>
            <input
              type="text"
              className="input"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Secretaria de Saude"
              required
            />
          </div>
          <div>
            <label className="block text-label text-[#101828] mb-1.5">Slug (subdominio)</label>
            <input
              type="text"
              className="input"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
              placeholder="Ex: saude"
              required
              pattern="[a-z0-9-]+"
            />
            <p className="text-meta text-[#98A2B3] mt-1">{form.slug || "saude"}.govsistem.com.br</p>
          </div>
        </div>

        <div>
          <label className="block text-label text-[#101828] mb-1.5">CNPJ (opcional)</label>
          <input
            type="text"
            className="input"
            value={form.cnpj}
            onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            placeholder="XX.XXX.XXX/XXXX-XX"
          />
        </div>

        <div>
          <label className="block text-label text-[#101828] mb-1.5">Descricao (opcional)</label>
          <textarea
            className="input min-h-[80px]"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Breve descricao da secretaria"
          />
        </div>

        <div>
          <label className="block text-label text-[#101828] mb-1.5">Ouvidor Responsavel (opcional)</label>
          <input
            type="text"
            className="input"
            value={form.ouvidor_responsavel}
            onChange={(e) => setForm({ ...form, ouvidor_responsavel: e.target.value })}
            placeholder="Nome do ouvidor responsavel"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Salvando..." : "Criar Secretaria"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
