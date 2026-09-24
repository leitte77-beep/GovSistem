"use client";
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import api from "@/lib/api";

interface RoleOption {
  name: string;
  label: string;
}

interface ContractedModule {
  slug: string;
  name: string;
  roles: RoleOption[];
}

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function GrantsModal({ userId, userName, onClose, onSaved }: Props) {
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<ContractedModule[]>("/tenant/roles"),
      api<{ grants: Record<string, string[]>; pending_review: string[] }>(
        `/tenant/users/${userId}/grants`
      ),
    ])
      .then(([mods, current]) => {
        setModules(mods);
        setGrants(current.grants);
        setPending(current.pending_review);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar acessos"))
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleRole = (slug: string, role: string) => {
    setGrants((prev) => {
      const cur = prev[slug] ?? [];
      const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
      return { ...prev, [slug]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api(`/tenant/users/${userId}/grants`, { method: "PUT", body: { grants } });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar acessos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">Acessos do usuário</h2>
            <p className="text-sm text-on-surface-variant">{userName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          )}

          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          {!loading &&
            modules.map((mod) => (
              <div key={mod.slug} className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold text-on-surface">{mod.name}</h3>
                {pending.includes(mod.slug) && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    Acesso legado pendente de revisão
                  </p>
                )}
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {mod.roles.map((role) => {
                    const checked = (grants[mod.slug] ?? []).includes(role.name);
                    return (
                      <label
                        key={role.name}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-primary-600 bg-primary-50"
                            : "border-outline-variant hover:bg-surface-container-low"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRole(mod.slug, role.name)}
                          className="mt-0.5 accent-primary-600"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-on-surface">{role.name}</span>
                          <span className="block text-xs text-on-surface-variant">{role.label}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

          {!loading && modules.length === 0 && (
            <p className="py-6 text-center text-sm text-on-surface-variant">
              Nenhum módulo contratado com roles configuráveis.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar acessos"}
          </button>
        </div>
      </div>
    </div>
  );
}
