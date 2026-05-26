"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import api from "@/lib/api";

export default function NewEdicaoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [type, setType] = useState("normal");
  const [editionDate, setEditionDate] = useState("");

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
      if (subtitle) params.set("subtitle", subtitle);
      params.set("type", type);
      if (editionDate) params.set("edition_date", editionDate);

      await api(`/editions?${params.toString()}`, { method: "POST" });
      toast.success("Edição criada com sucesso");
      router.push("/edicoes");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar edição");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Nova Edição">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Nova Edição</h2>
            <p className="mt-1 text-sm text-gray-500">Crie uma nova edição do diário oficial.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título da edição"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtítulo</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Subtítulo"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="extra">Extra</option>
                    <option value="suplementar">Suplementar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Publicação</label>
                  <input
                    type="date"
                    value={editionDate}
                    onChange={(e) => setEditionDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
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
                  {saving ? "Salvando..." : "Criar Edição"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
