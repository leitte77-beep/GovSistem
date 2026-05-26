"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";
import { statusColor, statusLabel } from "@/lib/utils";

interface Matter {
  id: number;
  title: string;
  status: string;
  author: string;
  summary: string;
  content_html: string;
  plain_text: string;
  act_type?: { id: number; name: string };
  org_unit?: { id: number; name: string };
}

interface SelectOption {
  id: number;
  name: string;
}

export default function EditMateriaPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [matter, setMatter] = useState<Matter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actTypes, setActTypes] = useState<SelectOption[]>([]);
  const [units, setUnits] = useState<SelectOption[]>([]);

  const [title, setTitle] = useState("");
  const [actTypeId, setActTypeId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [summary, setSummary] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [plainText, setPlainText] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [matterRes, atRes, unRes] = await Promise.all([
          api<{ data: Matter }>(`/matters/${id}`),
          api<{ data: SelectOption[] }>("/act-types"),
          api<{ data: SelectOption[] }>("/org-units"),
        ]);

        const m = matterRes.data;
        setMatter(m);
        setTitle(m.title || "");
        setActTypeId(m.act_type ? String(m.act_type.id) : "");
        setOrgUnitId(m.org_unit ? String(m.org_unit.id) : "");
        setSummary(m.summary || "");
        setContentHtml(m.content_html || "");
        setPlainText(m.plain_text || "");

        setActTypes(atRes.data || []);
        setUnits(unRes.data || []);
      } catch (err: any) {
        toast.error(err.message || "Erro ao carregar matéria");
        router.push("/materias");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (title !== matter?.title) body.title = title;
      if (actTypeId !== (matter?.act_type ? String(matter.act_type.id) : "")) body.act_type_id = actTypeId;
      if (orgUnitId !== (matter?.org_unit ? String(matter.org_unit.id) : "")) body.org_unit_id = orgUnitId;
      if (summary !== (matter?.summary || "")) body.summary = summary;
      if (contentHtml !== (matter?.content_html || "")) body.content_html = contentHtml;
      if (plainText !== (matter?.plain_text || "")) body.plain_text = plainText;

      if (Object.keys(body).length > 0) {
        await api(`/matters/${id}`, { method: "PATCH", body });
      }
      toast.success("Matéria atualizada");
      router.push("/materias");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleWorkflow(action: string) {
    try {
      await api(`/matters/${id}/${action}`, { method: "POST" });
      toast.success("Ação executada com sucesso");
      const res = await api<{ data: Matter }>(`/matters/${id}`);
      setMatter(res.data);
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar ação");
    }
  }

  if (loading) {
    return (
      <AppLayout title="Editar Matéria">
        <PageSpinner />
      </AppLayout>
    );
  }

  if (!matter) return null;

  const workflowActions: { label: string; action: string; show: boolean }[] = [
    { label: "Enviar p/ Revisão", action: "submit-review", show: matter.status === "draft" },
    { label: "Aprovar", action: "approve", show: matter.status === "review" },
    { label: "Rejeitar", action: "reject", show: matter.status === "review" },
    { label: "Arquivar", action: "archive", show: ["draft", "review", "approved", "rejected"].includes(matter.status) },
  ];

  return (
    <AppLayout title="Editar Matéria">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <Badge className={statusColor(matter.status)}>{statusLabel(matter.status)}</Badge>
          <span className="text-sm text-gray-500">Autor: {matter.author || "—"}</span>
        </div>

        {workflowActions.some((a) => a.show) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {workflowActions.map((wa) =>
              wa.show ? (
                <button
                  key={wa.action}
                  onClick={() => handleWorkflow(wa.action)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-primary-300 hover:text-primary-700 transition-colors"
                >
                  {wa.label}
                </button>
              ) : null
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Editar Matéria #{matter.id}</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Texto Simples</label>
                <textarea
                  value={plainText}
                  onChange={(e) => setPlainText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo HTML</label>
                <textarea
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
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
                  {saving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
