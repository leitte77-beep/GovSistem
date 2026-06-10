"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import type { Convenio, Setor } from "@/types/govtask";
import { PRIORITY_LABELS } from "@/lib/utils";
import { Save, ArrowLeft, AlertTriangle, XCircle, RefreshCw, ClipboardList } from "lucide-react";
import Link from "next/link";

interface FormData {
  titulo: string;
  descricao: string;
  etapa_id: string;
  setor_destino_id: string;
  responsavel: string;
  prioridade: string;
  prazo: string;
}

interface FormErrors {
  titulo?: string;
  etapa_id?: string;
}

export default function NovaTarefaPage() {
  const router = useRouter();
  const { id: convenioId } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const canEdit = hasRole("ASSESSOR", "ADMIN");
  const [convenio, setConvenio] = useState<Convenio | null>(null);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<FormData>({
    titulo: "",
    descricao: "",
    etapa_id: "",
    setor_destino_id: "",
    responsavel: "",
    prioridade: "NORMAL",
    prazo: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, s, u] = await Promise.all([
        api.getConvenio(convenioId),
        api.listSetores().catch(() => [] as Setor[]),
        api.listUsers().catch(() => [] as { id: string; name: string; email: string }[]),
      ]);
      setConvenio(c);
      setSetores(s);
      setUsuarios(u);

      // Pre-select the first PENDENTE or EM_ANDAMENTO etapa
      const etapas = c.etapas || [];
      const activeEtapa =
        etapas.find((e) => e.status === "EM_ANDAMENTO") ||
        etapas.find((e) => e.status === "PENDENTE") ||
        null;
      if (activeEtapa) {
        setForm((prev) => ({ ...prev, etapa_id: activeEtapa.id }));
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [convenioId]);

  const selectedEtapa = convenio?.etapas?.find((e) => e.id === form.etapa_id);
  const prazoExceeded =
    form.prazo &&
    selectedEtapa?.prazo_governo &&
    form.prazo > selectedEtapa.prazo_governo;

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.titulo.trim()) {
      newErrors.titulo = "Título é obrigatório";
    }
    if (!form.etapa_id) {
      newErrors.etapa_id = "Selecione uma etapa";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || undefined,
        prioridade: form.prioridade,
        atribuida_a_id: form.responsavel || null,
        setor_destino_id: form.setor_destino_id || undefined,
        prazo: form.prazo ? new Date(form.prazo).toISOString() : undefined,
      };
      await api.createTarefa(form.etapa_id, payload);
      notify.success("Tarefa criada com sucesso!");
      router.push(`/convenios/${convenioId}?tab=tarefas`);
    } catch (e: any) {
      notify.error(e.message || "Erro ao criar tarefa");
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader
          title=""
          breadcrumbs={[
            { label: "Convênios", href: "/convenios" },
            { label: "..." },
            { label: "Nova Tarefa" },
          ]}
        />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  // Error state
  if (error || !convenio) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader
          title=""
          breadcrumbs={[
            { label: "Convênios", href: "/convenios" },
            { label: "Nova Tarefa" },
          ]}
        />
        <Card padding="p-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEE4E2] flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-[#B42318]" />
            </div>
            <h3 className="text-h3 text-text-title mb-1">
              {error || "Convênio não encontrado"}
            </h3>
            <p className="text-body-sm text-text-body mb-4">
              Não foi possível carregar os dados necessários para criar a tarefa.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="secondary"
                onClick={() => router.push("/convenios")}
              >
                Voltar para lista
              </Button>
              <Button icon={RefreshCw} onClick={load}>
                Tentar novamente
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const etapas = convenio.etapas || [];

  if (etapas.length === 0) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader
          title="Nova Tarefa"
          breadcrumbs={[
            { label: "Convênios", href: "/convenios" },
            { label: convenio.titulo, href: `/convenios/${convenioId}` },
            { label: "Nova Tarefa" },
          ]}
        />
        <Card padding="p-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEF0C7] flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-6 h-6 text-[#B54708]" />
            </div>
            <h3 className="text-h3 text-[#101828] mb-1">
              Nenhuma etapa disponível
            </h3>
            <p className="text-body-sm text-[#475467] mb-6">
              É necessário ter pelo menos uma etapa no convênio para criar tarefas.
              {canEdit ? " Adicione etapas manualmente ou aplique um template de fluxo." : ""}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push(`/convenios/${convenioId}`)}
              >
                Voltar para o convênio
              </Button>
              {canEdit && (
                <Link href={`/convenios/${convenioId}/editar`}>
                  <Button icon={ClipboardList}>
                    Adicionar etapas
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Nova Tarefa"
        description={`Criar tarefa para o convênio: ${convenio.titulo}`}
        breadcrumbs={[
          { label: "Convênios", href: "/convenios" },
          { label: convenio.titulo, href: `/convenios/${convenioId}` },
          { label: "Nova Tarefa" },
        ]}
        actions={
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => router.back()}
          >
            Voltar
          </Button>
        }
      />

      <form onSubmit={handleSubmit}>
        <Card padding="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-label text-text-title mb-1">
                Título <span className="text-[#B42318]">*</span>
              </label>
              <input
                type="text"
                value={form.titulo}
                onChange={(e) =>
                  setForm({ ...form, titulo: e.target.value })
                }
                placeholder="Ex: Elaborar projeto básico de engenharia"
                className={`w-full border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 ${
                  errors.titulo
                    ? "border-[#B42318] focus:ring-[#B42318]/20"
                    : "border-surface-border focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                }`}
              />
              {errors.titulo && (
                <p className="text-meta text-[#B42318] mt-1">{errors.titulo}</p>
              )}
            </div>

            <div>
              <label className="block text-label text-text-title mb-1">
                Descrição
              </label>
              <textarea
                value={form.descricao}
                onChange={(e) =>
                  setForm({ ...form, descricao: e.target.value })
                }
                placeholder="Descreva os detalhes e expectativas da tarefa..."
                rows={3}
                className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-label text-text-title mb-1">
                  Etapa <span className="text-[#B42318]">*</span>
                </label>
                <select
                  value={form.etapa_id}
                  onChange={(e) =>
                    setForm({ ...form, etapa_id: e.target.value })
                  }
                  className={`w-full border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 ${
                    errors.etapa_id
                      ? "border-[#B42318] focus:ring-[#B42318]/20"
                      : "border-surface-border focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                  }`}
                >
                  <option value="">Selecione uma etapa...</option>
                  {etapas
                    .slice()
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((etapa) => (
                      <option key={etapa.id} value={etapa.id}>
                        {etapa.ordem}. {etapa.nome} ({etapa.status === "CONCLUIDA" ? "Concluída" : "Ativa"})
                      </option>
                    ))}
                </select>
                {errors.etapa_id && (
                  <p className="text-meta text-[#B42318] mt-1">{errors.etapa_id}</p>
                )}
                {selectedEtapa?.prazo_governo && (
                  <p className="text-meta text-text-subtle mt-1">
                    Prazo do governo: {new Date(selectedEtapa.prazo_governo).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-label text-text-title mb-1">
                  Setor Destino
                </label>
                <select
                  value={form.setor_destino_id}
                  onChange={(e) =>
                    setForm({ ...form, setor_destino_id: e.target.value })
                  }
                  className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                >
                  <option value="">Selecione um setor...</option>
                  {setores
                    .filter((s) => s.ativo !== false)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sigla ? `${s.sigla} — ` : ""}{s.nome}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                  <label className="block text-label text-text-title mb-1">
                    Responsável
                  </label>
                  <select
                    value={form.responsavel}
                    onChange={(e) =>
                      setForm({ ...form, responsavel: e.target.value })
                    }
                    className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                  >
                    <option value="">Selecione um usuário</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
              </div>

              <div>
                <label className="block text-label text-text-title mb-1">
                  Prioridade
                </label>
                <select
                  value={form.prioridade}
                  onChange={(e) =>
                    setForm({ ...form, prioridade: e.target.value })
                  }
                  className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-label text-text-title mb-1">
                Prazo
              </label>
              <input
                type="date"
                value={form.prazo}
                onChange={(e) =>
                  setForm({ ...form, prazo: e.target.value })
                }
                className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
              />
              <p className="text-meta text-text-subtle mt-1">
                Data limite para conclusão da tarefa
              </p>
            </div>

            {/* Warning: prazo exceeds governo prazo */}
            {prazoExceeded && (
              <div className="flex items-start gap-3 bg-[#FEF0C7] border border-[#FDB022] rounded-card p-3">
                <AlertTriangle className="w-5 h-5 text-[#B54708] shrink-0 mt-0.5" />
                <div>
                  <p className="text-body-sm font-medium text-[#B54708]">
                    Atenção: o prazo da tarefa ultrapassa o prazo do governo
                  </p>
                  <p className="text-body-sm text-[#B54708]/80 mt-0.5">
                    O prazo da tarefa ({new Date(form.prazo).toLocaleDateString("pt-BR")}) é posterior ao prazo do governo da etapa {selectedEtapa?.nome} ({new Date(selectedEtapa!.prazo_governo!).toLocaleDateString("pt-BR")}).
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-surface-border p-4 mt-6 -mx-6 lg:-mx-8 flex items-center justify-between rounded-t-card shadow-elevated">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button icon={Save} type="submit" loading={saving}>
            Criar Tarefa
          </Button>
        </div>
      </form>
    </div>
  );
}
