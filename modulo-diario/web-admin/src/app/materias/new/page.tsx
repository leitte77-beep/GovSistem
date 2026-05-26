"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import api from "@/lib/api";

interface SelectOption {
  id: number;
  name: string;
}

export default function NewMateriaPage() {
  const router = useRouter();
  const [actTypes, setActTypes] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<SelectOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [actTypeId, setActTypeId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [summary, setSummary] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [plainText, setPlainText] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [atRes, unRes] = await Promise.all([
          api<{ data: SelectOption[] }>("/act-types"),
          api<{ data: SelectOption[] }>("/org-units"),
        ]);
        setActTypes(atRes.data || []);
        setUnits(unRes.data || []);
      } catch {}
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const params = new URLSearchParams();
      params.set("title", title);
      if (actTypeId) params.set("act_type_id", actTypeId);
      if (orgUnitId) params.set("org_unit_id", orgUnitId);
      if (summary) params.set("summary", summary);
      if (contentHtml) params.set("content_html", contentHtml);
      if (plainText) params.set("plain_text", plainText);

      await api(`/matters?${params.toString()}`, { method: "POST" });
      toast.success("Matéria criada com sucesso");
      router.push("/materias");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar matéria");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Nova Matéria">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Nova Matéria</h2>
            <p className="mt-1 text-sm text-gray-500">Preencha os dados para criar uma nova matéria.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da matéria"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Ato</label>
                  <select
                    value={actTypeId}
                    onChange={(e) => setActTypeId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Selecione...</option>
                    {actTypes.map((at) => (
                      <option key={at.id} value={at.id}>{at.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                  <select
                    value={orgUnitId}
                    onChange={(e) => setOrgUnitId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Selecione...</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resumo</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Resumo da matéria"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Texto Simples</label>
                <textarea
                  value={plainText}
                  onChange={(e) => setPlainText(e.target.value)}
                  placeholder="Versão em texto simples"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo HTML</label>
                <textarea
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  placeholder="<p>Conteúdo em HTML...</p>"
                  rows={8}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Salvando..." : "Criar Matéria"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
