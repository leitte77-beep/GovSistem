"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import AddressForm from "@/components/address/AddressForm";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import api from "@/lib/api";
import toast from "react-hot-toast";
import Spinner from "@/components/ui/Spinner";
import { Power, UserPlus, Trash2, Shield, ShieldCheck, Pencil } from "lucide-react";

interface Manager {
  user_id: string;
  membership_id: string;
  name: string;
  email: string;
  is_active: boolean;
  global_active: boolean;
  created_at?: string | null;
}

interface FormData {
  name: string;
  slug: string;
  cnpj: string;
  email: string;
  phone: string;
  description: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  is_active: boolean;
}

interface ModuleItem {
  id: string;
  name: string;
  slug: string;
}

interface AssignedModule {
  id: string;
  module_id: string;
  organization_id: string;
  is_active: boolean;
  module?: ModuleItem;
}

export default function EditOrganizacaoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [assignedModules, setAssignedModules] = useState<AssignedModule[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [editManager, setEditManager] = useState<Manager | null>(null);
  const [managing, setManaging] = useState(false);

  const loadManagers = () => {
    api<Manager[]>(`/organizations/${id}/managers`).then(setManagers).catch(() => setManagers([]));
  };

  useEffect(() => {
    Promise.all([
      api<any>(`/organizations/${id}`),
      api<ModuleItem[]>("/modules?is_active=true"),
      api<AssignedModule[]>(`/modules/organization/${id}`).catch(() => [] as AssignedModule[]),
      api<Manager[]>(`/organizations/${id}/managers`).catch(() => [] as Manager[]),
    ])
      .then(([data, mods, assigned, mgrs]) => {
        setForm({
          name: data.name || "",
          slug: data.slug || "",
          cnpj: data.cnpj || "",
          email: data.email || "",
          phone: data.phone || "",
          description: data.description || "",
          address_street: data.address_street || "",
          address_number: data.address_number || "",
          address_complement: data.address_complement || "",
          address_neighborhood: data.address_neighborhood || "",
          address_city: data.address_city || "",
          address_state: data.address_state || "",
          address_zip: data.address_zip || "",
          is_active: data.is_active ?? true,
        });
        setModules(Array.isArray(mods) ? mods : []);
        setAssignedModules(Array.isArray(assigned) ? assigned : []);
        setManagers(Array.isArray(mgrs) ? mgrs : []);
      })
      .catch(() => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : prev);
    } else {
      setForm((prev) => prev ? { ...prev, [name]: value } : prev);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/organizations/${id}`, { method: "PUT", body: form });
      toast.success("Organização atualizada com sucesso!");
      router.push("/orgaos");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/organizations/${id}`, { method: "DELETE" });
      toast.success("Organização excluída com sucesso!");
      router.push("/orgaos");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const toggleModule = async (moduleId: string) => {
    setAssigning(true);
    try {
      const existing = assignedModules.find((a) => a.module_id === moduleId);
      if (existing) {
        await api(`/modules/organization/${existing.id}`, { method: "DELETE" });
        setAssignedModules((prev) => prev.filter((a) => a.id !== existing.id));
        toast.success("Módulo desassociado");
      } else {
        const res = await api<AssignedModule>("/modules/organization", {
          method: "POST",
          body: { organization_id: id, module_id: moduleId },
        });
        setAssignedModules((prev) => [...prev, res]);
        toast.success("Módulo associado");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar associação");
    } finally {
      setAssigning(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#002b54]/5 focus:border-[#002b54]/30 focus:bg-white bg-white outline-none text-sm transition-all";
  const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

  if (loading) {
    return (
      <AppLayout title="Editar Organização">
        <div className="flex justify-center py-16"><Spinner /></div>
      </AppLayout>
    );
  }

  if (!form) {
    return (
      <AppLayout title="Editar Organização">
        <p className="text-gray-500">Organização não encontrada.</p>
      </AppLayout>
    );
  }

  const assignedModuleIds = new Set(assignedModules.map((a) => a.module_id));

  return (
    <AppLayout title="Editar Organização">
      <div className="max-w-[800px] mx-auto">
        <div className="mb-10">
          <button onClick={() => router.push("/orgaos")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-[#002b54] font-medium transition-colors mb-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 12H5m7 7l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            Voltar para Organizações
          </button>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Editar Organização</h2>
          <p className="text-slate-500">Atualize os dados da organização no sistema.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white rounded-3xl border border-slate-200/60 p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-3">
              <svg className="w-5 h-5" style={{ color: "#002b54" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
              Dados da Organização
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Nome *</label>
                <input name="name" value={form.name} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Slug *</label>
                <input name="slug" value={form.slug} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CNPJ</label>
                <input name="cnpj" value={form.cnpj} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Telefone</label>
                <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Descrição</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/60 p-8">
            <AddressForm
              values={{
                address_street: form.address_street,
                address_number: form.address_number,
                address_complement: form.address_complement,
                address_neighborhood: form.address_neighborhood,
                address_city: form.address_city,
                address_state: form.address_state,
                address_zip: form.address_zip,
              }}
              onChange={(field, value) => setForm((prev) => prev ? { ...prev, [field]: value } : prev)}
              inputClass={inputClass}
              labelClass={labelClass}
            />
            <div className="mt-6 flex items-center gap-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="rounded border-slate-300 text-[#002b54] focus:ring-[#002b54]/20" />
                <span className="text-sm font-semibold text-slate-700">Ativo</span>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/60 p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-3">
              <svg className="w-5 h-5" style={{ color: "#002b54" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
              Módulos
            </h3>
            <p className="text-sm text-slate-500 mb-4">Ative ou desative os módulos disponíveis para esta organização.</p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {modules.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Nenhum módulo ativo encontrado.</p>
              )}
              {modules.map((mod) => {
                const isAssigned = assignedModuleIds.has(mod.id);
                return (
                  <div key={mod.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700">{mod.name}</span>
                      <Badge variant={isAssigned ? "success" : "warning"}>
                        {isAssigned ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      disabled={assigning}
                      onClick={() => toggleModule(mod.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        isAssigned
                          ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                          : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                      }`}
                      title={isAssigned ? "Desativar módulo" : "Ativar módulo"}
                    >
                      <Power size={18} className={isAssigned ? "fill-emerald-600" : ""} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/60 p-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                <Shield size={20} style={{ color: "#002b54" }} />
                Gestores
              </h3>
              <button
                type="button"
                onClick={() => setShowManagerModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all shadow"
                style={{ backgroundColor: "#002b54" }}
              >
                <UserPlus size={16} /> Adicionar gestor
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Define quem administra os usuários e acessos do órgão no portal.</p>
            {managers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nenhum gestor definido.</p>
            ) : (
              <div className="space-y-2">
                {managers.map((m) => (
                  <div key={m.membership_id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-semibold" style={{ backgroundColor: "#002b54" }}>
                        {m.name?.charAt(0) || "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{m.name}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={m.is_active ? "success" : "warning"}>
                        <span className="inline-flex items-center gap-1"><ShieldCheck size={11} /> {m.is_active ? "Gestor ativo" : "Inativo"}</span>
                      </Badge>
                      <button
                        type="button"
                        onClick={() => setEditManager(m)}
                        className="p-2 rounded-lg text-slate-400 hover:text-[#002b54] hover:bg-slate-100 transition-colors"
                        title="Editar gestor"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={managing}
                        onClick={async () => {
                          if (!confirm(`Remover ${m.name} como gestor deste órgão?`)) return;
                          setManaging(true);
                          try {
                            await api(`/organizations/${id}/managers/${m.user_id}`, { method: "DELETE" });
                            toast.success("Gestor removido");
                            loadManagers();
                          } catch (err: any) {
                            toast.error(err.message || "Erro ao remover gestor");
                          } finally {
                            setManaging(false);
                          }
                        }}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        title="Remover gestor"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-3 px-8 py-3.5 font-bold text-sm rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "#002b54", color: "white", boxShadow: "0 10px 15px -3px rgba(0,43,84,0.2)" }}
            >
              {saving ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
              )}
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/orgaos")}
              className="px-8 py-3.5 font-bold text-sm rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="px-8 py-3.5 font-bold text-sm rounded-2xl border border-red-200 text-red-600 hover:bg-red-50 transition-all ml-auto"
            >
              Excluir
            </button>
          </div>
        </form>
      </div>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Confirmar Exclusão" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir esta organização?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>

      {showManagerModal && (
        <ManagerModal
          organizationId={id}
          onClose={() => setShowManagerModal(false)}
          onSaved={() => { loadManagers(); setShowManagerModal(false); }}
        />
      )}

      {editManager && (
        <EditManagerModal
          manager={editManager}
          onClose={() => setEditManager(null)}
          onSaved={() => { loadManagers(); setEditManager(null); }}
        />
      )}
    </AppLayout>
  );
}

function EditManagerModal({ manager, onClose, onSaved }: {
  manager: Manager;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(manager.name || "");
  const [email, setEmail] = useState(manager.email || "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/users/${manager.user_id}`, { method: "PUT", body: { name, email } });
      toast.success("Gestor atualizado");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao editar gestor");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Editar gestor — ${manager.name}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#002b54]/5 focus:border-[#002b54]/30 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">E-mail *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#002b54]/5 focus:border-[#002b54]/30 outline-none text-sm"
          />
        </div>
        <p className="text-xs text-slate-400">A alteração atualiza o cadastro do usuário no sistema.</p>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#002b54" }}
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManagerModal({ organizationId, onClose, onSaved }: {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"link" | "create">("link");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, string> = { email };
      if (mode === "create") {
        body.name = name;
        body.password = password;
      }
      await api(`/organizations/${organizationId}/managers`, { method: "POST", body });
      toast.success(mode === "link" ? "Usuário vinculado como gestor" : "Gestor criado");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir gestor");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Adicionar Gestor" size="sm">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${mode === "link" ? "text-white border-transparent" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          style={mode === "link" ? { backgroundColor: "#002b54" } : undefined}
        >
          Vincular existente
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${mode === "create" ? "text-white border-transparent" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}
          style={mode === "create" ? { backgroundColor: "#002b54" } : undefined}
        >
          Criar novo
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">E-mail do usuário *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#002b54]/5 focus:border-[#002b54]/30 outline-none text-sm"
            placeholder="gestor@orgao.gov.br"
          />
        </div>

        {mode === "create" && (
          <>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#002b54]/5 focus:border-[#002b54]/30 outline-none text-sm"
                placeholder="Nome do gestor"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Senha temporária *</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#002b54]/5 focus:border-[#002b54]/30 outline-none text-sm"
                placeholder="••••••••"
              />
            </div>
            <p className="text-xs text-slate-400">Se o e-mail já existir, o usuário será apenas vinculado como gestor (a senha não será alterada).</p>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#002b54" }}
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
