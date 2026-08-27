"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";

export default function ChangePasswordPage() {
  const { ctx, changePassword } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Se não houver contexto, volta ao login
    if (!ctx) router.replace("/login");
  }, [ctx, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 6) return setError("A nova senha deve ter no mínimo 6 caracteres.");
    if (next !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar a senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Segurança — Alterar senha</h1>
        <p className="text-sm text-on-surface-variant">Defina uma nova senha para a sua conta.</p>
      </div>

      <div className="rounded-xl border bg-surface-container-lowest p-6 shadow-sm">
        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <ShieldCheck size={16} /> Senha alterada com sucesso.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              Ir para o dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-on-surface-variant">Senha atual</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-on-surface-variant">Nova senha</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="password"
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-on-surface-variant">Confirmar nova senha</label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
            >
              {busy ? "Salvando..." : "Alterar senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
