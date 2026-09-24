"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Power, Loader2, Info } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";

interface UserDetail {
  user_id: string;
  name: string;
  email: string;
  membership_role: string;
  membership_active: boolean;
}

export default function PerfilOrgaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<UserDetail>(`/tenant/users/${id}`)
      .then(setUser)
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar usuário"));
  }, [id]);

  const isManager = user?.membership_role === "ORG_ADMIN";
  const isActive = user?.membership_active;

  const updateRole = async (makeManager: boolean) => {
    setBusy(true);
    setError("");
    try {
      await api(`/tenant/users/${id}/status`, {
        method: "PATCH",
        body: { membership_role: makeManager ? "ORG_ADMIN" : "ORG_MEMBER" },
      });
      toast("success", makeManager ? "Usuário promovido a gestor." : "Usuário rebaixado para membro.");
      router.push("/usuarios");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na operação";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const updateActive = async (active: boolean) => {
    setBusy(true);
    setError("");
    try {
      await api(`/tenant/users/${id}/status`, { method: "PATCH", body: { is_active: active } });
      toast(active ? "success" : "info", active ? "Usuário ativado." : "Usuário suspenso.");
      router.push("/usuarios");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na operação";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Perfil no órgão</h1>
        <p className="text-sm text-on-surface-variant">Gerencie o perfil e o vínculo deste usuário na organização.</p>
      </div>

      {user && (
        <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3 border-b pb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="font-semibold text-on-surface">{user.name}</h2>
              <p className="text-sm text-on-surface-variant">{user.email}</p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-on-surface-variant">
                  {isManager ? "Gestor" : "Usuário"}
                </span>
                <span className={`rounded-full px-2 py-0.5 ${isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  {isActive ? "Ativo" : "Suspenso"}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="mb-1 text-sm font-bold text-on-surface">Perfil (Gestor × Usuário)</h3>
            <p className="mb-3 text-sm text-on-surface-variant">
              O gestor administra usuários, acessos e módulos do órgão. O usuário tem acesso apenas aos seus módulos liberados.
            </p>
            {isManager ? (
              <button
                onClick={() => updateRole(false)}
                disabled={busy}
                className="w-full rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low disabled:opacity-60"
              >
                Rebaixar para usuário
              </button>
            ) : (
              <button
                onClick={() => updateRole(true)}
                disabled={busy}
                className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
              >
                Promover a gestor
              </button>
            )}
          </div>

          <div className="border-t pt-4">
            <h3 className="mb-1 text-sm font-bold text-on-surface">Vínculo (Ativo × Suspenso)</h3>
            <p className="mb-3 text-sm text-on-surface-variant">
              Suspender bloqueia o acesso aos módulos deste órgão, sem apagar dados. Ativar restaura o acesso.
            </p>
            {isActive ? (
              <button
                onClick={() => updateActive(false)}
                disabled={busy}
                className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                <Power size={15} className="mr-1 inline" /> Suspender vínculo
              </button>
            ) : (
              <button
                onClick={() => updateActive(true)}
                disabled={busy}
                className="w-full rounded-lg border border-green-200 px-4 py-2.5 text-sm font-medium text-green-700 transition hover:bg-green-50 disabled:opacity-60"
              >
                Ativar vínculo
              </button>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4 text-sm text-on-surface-variant">
            <Info size={18} className="mt-0.5 shrink-0 text-primary-700" />
            <p>Não é possível remover ou rebaixar o <strong className="text-on-surface">último gestor ativo</strong> do órgão.</p>
          </div>

          {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link href="/usuarios" className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low">
          Cancelar
        </Link>
        <Link href="/usuarios" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700">
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Concluir"}
        </Link>
      </div>
    </div>
  );
}
