"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, Lock, CheckCircle2 } from "lucide-react";
import { Suspense } from "react";
import api from "@/lib/api";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) setError("Link inválido ou incompleto.");
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("A senha deve ter no mínimo 6 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao redefinir a senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-container p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white">
            <KeyRound size={24} />
          </span>
          <h1 className="text-xl font-semibold text-on-surface">Redefinir senha</h1>
          <p className="text-sm text-on-surface-variant">Defina uma nova senha para sua conta.</p>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <CheckCircle2 size={16} /> Senha redefinida com sucesso.
            </p>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-primary-600 py-2 text-center text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              Entrar
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-on-surface-variant">Nova senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-on-surface-variant">Confirmar senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy || !token}
              className="w-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
            >
              {busy ? "Salvando..." : "Redefinir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-primary-container" />}>
      <ResetInner />
    </Suspense>
  );
}
