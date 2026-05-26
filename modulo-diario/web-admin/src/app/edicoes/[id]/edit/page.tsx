"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus, Trash2, GripVertical, Search } from "lucide-react";
import toast from "react-hot-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PageSpinner } from "@/components/ui/Spinner";
import api from "@/lib/api";
import { formatDate, statusColor, statusLabel } from "@/lib/utils";

interface EditionItem {
  id: number;
  position: number;
  matter: { id: number; title: string };
  section?: string;
}

interface Edition {
  id: number;
  title: string;
  subtitle: string;
  type: string;
  status: string;
  edition_date: string;
  items: EditionItem[];
}

interface Matter {
  id: number;
  title: string;
  status: string;
}

export default function EditEdicaoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [edition, setEdition] = useState<Edition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [type, setType] = useState("normal");
  const [editionDate, setEditionDate] = useState("");

  const [addMatterOpen, setAddMatterOpen] = useState(false);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [matterSearch, setMatterSearch] = useState("");
  const [addingMatter, setAddingMatter] = useState(false);
  const [removingItem, setRemovingItem] = useState<number | null>(null);

  const loadEdition = useCallback(async () => {
    try {
      const res = await api<{ data: Edition }>(`/editions/${id}`);
      const e = res.data;
      setEdition(e);
      setTitle(e.title);
      setSubtitle(e.subtitle || "");
      setType(e.type);
      setEditionDate(e.edition_date ? e.edition_date.split("T")[0] : "");
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar edição");
      router.push("/edicoes");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadEdition();
  }, [loadEdition]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (title !== edition?.title) body.title = title;
      if (subtitle !== (edition?.subtitle || "")) body.subtitle = subtitle;
      if (type !== edition?.type) body.type = type;
      const currentDate = edition?.edition_date ? edition.edition_date.split("T")[0] : "";
      if (editionDate !== currentDate) body.edition_date = editionDate;

      if (Object.keys(body).length > 0) {
        await api(`/editions/${id}`, { method: "PATCH", body });
      }
      toast.success("Edição atualizada");
      loadEdition();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleWorkflow(action: string) {
    try {
      await api(`/editions/${id}/${action}`, { method: "POST" });
      toast.success("Ação executada com sucesso");
      loadEdition();
    } catch (err: any) {
      toast.error(err.message || "Erro ao executar ação");
    }
  }

  async function loadAvailableMatters() {
    setAddMatterOpen(true);
    try {
      const res = await api<{ data: Matter[] }>("/matters?status=approved&per_page=50");
      setMatters(res.data || []);
    } catch {
      toast.error("Erro ao carregar matérias");
    }
  }

  async function handleAddMatter(matterId: number) {
    setAddingMatter(true);
    try {
      await api(`/editions/${id}/items?matter_id=${matterId}`, { method: "POST" });
      toast.success("Matéria adicionada à edição");
      setAddMatterOpen(false);
      loadEdition();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar matéria");
    } finally {
      setAddingMatter(false);
    }
  }

  async function handleRemoveItem(itemId: number) {
    setRemovingItem(itemId);
    try {
      await api(`/editions/${id}/items/${itemId}`, { method: "DELETE" });
      toast.success("Matéria removida da edição");
      loadEdition();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover matéria");
    } finally {
      setRemovingItem(null);
    }
  }

  if (loading) {
    return (
      <AppLayout title="Editar Edição">
        <PageSpinner />
      </AppLayout>
    );
  }

  if (!edition) return null;

  const filteredMatters = matters.filter((m) =>
    m.title.toLowerCase().includes(matterSearch.toLowerCase())
  );

  const workflowActions: { label: string; action: string; show: boolean }[] = [
    { label: "Fechar Edição", action: "close", show: edition.status === "open" || edition.status === "draft" },
    { label: "Publicar", action: "publish", show: edition.status === "closed" || edition.status === "signed" },
    { label: "Cancelar", action: "cancel", show: edition.status !== "cancelled" && edition.status !== "published" },
  ];

  return (
    <AppLayout title="Editar Edição">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center gap-3">
          <Badge className={statusColor(edition.status)}>{statusLabel(edition.status)}</Badge>
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Detalhes</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subtítulo</label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
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
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Matérias ({edition.items?.length || 0})</h2>
              <button
                onClick={loadAvailableMatters}
                className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Matéria
              </button>
            </CardHeader>
            <CardContent>
              {!edition.items || edition.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  Nenhuma matéria adicionada a esta edição.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {edition.items
                    .sort((a, b) => a.position - b.position)
                    .map((item) => (
                      <div key={item.id} className="flex items-center gap-3 py-3">
                        <GripVertical className="h-4 w-4 flex-shrink-0 text-gray-300" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {item.matter?.title || "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            Posição {item.position}{item.section ? ` · ${item.section}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={removingItem === item.id}
                          className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title="Remover"
                        >
                          {removingItem === item.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-red-600" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal open={addMatterOpen} onClose={() => setAddMatterOpen(false)} title="Adicionar Matéria" size="lg">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar matérias aprovadas..."
              value={matterSearch}
              onChange={(e) => setMatterSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredMatters.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Nenhuma matéria aprovada encontrada.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredMatters.map((m) => {
                  const alreadyAdded = edition.items?.some((ei) => ei.matter?.id === m.id);
                  return (
                    <div key={m.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.title}</p>
                        <p className="text-xs text-gray-400">Status: {statusLabel(m.status)}</p>
                      </div>
                      <button
                        onClick={() => handleAddMatter(m.id)}
                        disabled={addingMatter || alreadyAdded}
                        className="rounded-lg border border-primary-200 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {alreadyAdded ? "Já adicionada" : addingMatter ? "..." : "Adicionar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
