"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserCog, Loader2, Save, Info } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";

interface RoleOption {
  name: string;
  label: string;
}
interface ContractedModule {
  slug: string;
  name: string;
  roles: RoleOption[];
}

export default function AcessosPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<ContractedModule[]>("/tenant/roles"),
      api<{ grants: Record<string, string[]> }>(`/tenant/users/${id}/grants`),
    ])
      .then(([mods, current]) => {
        setModules(mods);
        setGrants(current.grants);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar acessos"))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleRole = (slug: string, roleName: string) => {
    setGrants((prev) => {
      const cur = prev[slug] ?? [];
      const next = cur.includes(roleName) ? cur.filter((r) => r !== roleName) : [...cur, roleName];
      return { ...prev, [slug]: next };
    });
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ sessions_revoked: number }>(`/tenant/users/${id}/grants`, {
        method: "PUT",
        body: { grants },
      });
      toast("success", res.sessions_revoked > 0 ? "Permissões atualizadas e sessões revogadas." : "Permissões atualizadas.");
      router.push(`/usuarios/${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar acessos";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = Object.values(grants).reduce((acc, r) => acc + r.length, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Acessos e permissões</h1>
        <p className="text-sm text-on-surface-variant">Libere ou remova módulos e roles deste usuário.</p>
      </div>

      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <UserCog size={22} />
            </span>
            <div>
              <h2 className="font-semibold text-on-surface">O que esta página faz</h2>
              <p className="text-sm text-on-surface-variant">Marque as roles que o usuário terá em cada módulo.</p>
            </div>
          </div>
          <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
            {selectedCount} role(s)
          </span>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4 text-sm text-on-surface-variant">
          <Info size={18} className="mt-0.5 shrink-0 text-primary-700" />
          <p>
            Alterar permissões <strong className="text-on-surface">revoga as sessões ativas</strong> do usuário nos
            módulos, fazendo a mudança valer imediatamente.
          </p>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">Carregando...</p>
        ) : modules.length === 0 ? (
          <p className="rounded-lg bg-surface-container-low px-4 py-6 text-center text-sm text-on-surface-variant">
            Nenhum módulo contratado com roles configuráveis.
          </p>
        ) : (
          <div className="space-y-3">
            {modules.map((mod) => (
              <div key={mod.slug} className="rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-on-surface">{mod.name}</p>
                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">
                    {(grants[mod.slug]?.length ?? 0)} selecionada(s)
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {mod.roles.map((r) => {
                    const checked = (grants[mod.slug] ?? []).includes(r.name);
                    return (
                      <label
                        key={r.name}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          checked ? "border-primary-600 bg-primary-50" : "border-outline-variant hover:bg-surface-container-low"
                        }`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleRole(mod.slug, r.name)} className="mt-0.5 accent-primary-600" />
                        <span className="min-w-0">
                          <span className="block font-medium text-on-surface">{r.name}</span>
                          <span className="block text-xs text-on-surface-variant">{r.label}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Link href="/usuarios" className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low">
          Cancelar
        </Link>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? (<><Loader2 size={16} className="animate-spin" /> Salvando...</>) : (<><Save size={16} /> Salvar acessos</>)}
        </button>
      </div>
    </div>
  );
}
