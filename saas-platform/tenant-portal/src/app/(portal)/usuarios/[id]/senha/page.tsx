"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, Info, Eye, EyeOff } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";

export default function RedefinirSenhaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (password.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
    if (!/[A-Z]/.test(password)) return "A senha deve conter ao menos uma letra maiúscula.";
    if (!/[a-z]/.test(password)) return "A senha deve conter ao menos uma letra minúscula.";
    if (!/[0-9]/.test(password)) return "A senha deve conter ao menos um número.";
    if (!/[^A-Za-z0-9]/.test(password)) return "A senha deve conter ao menos um caractere especial.";
    if (password !== confirm) return "As senhas não coincidem.";
    return "";
  };

  const submit = async () => {
    setError("");
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    try {
      await api(`/tenant/users/${id}/password`, {
        method: "POST",
        body: { password },
      });
      toast("success", "Senha redefinida com sucesso!");
      router.push("/usuarios");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na operação";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const requirements = [
    { ok: password.length >= 8, label: "Mínimo de 8 caracteres" },
    { ok: /[A-Z]/.test(password), label: "1 letra maiúscula" },
    { ok: /[a-z]/.test(password), label: "1 letra minúscula" },
    { ok: /[0-9]/.test(password), label: "1 número" },
    { ok: /[^A-Za-z0-9]/.test(password), label: "1 caractere especial" },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Redefinir senha</h1>
        <p className="text-sm text-on-surface-variant">Defina uma nova senha para este usuário do órgão.</p>
      </div>

      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm space-y-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <KeyRound size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-on-surface">Nova senha</h2>
            <p className="text-sm text-on-surface-variant">O acesso do usuário será atualizado imediatamente.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-on-surface">Senha</label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-2.5 pr-11 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              placeholder="Nova senha"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary-700"
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-on-surface">Confirmar senha</label>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-2.5 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            placeholder="Repita a senha"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {requirements.map((r) => (
            <span
              key={r.label}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                r.ok
                  ? "bg-secondary-container text-on-secondary-container"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {r.ok ? "✓" : "•"} {r.label}
            </span>
          ))}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4 text-sm text-on-surface-variant">
          <Info size={18} className="mt-0.5 shrink-0 text-primary-700" />
          <p>
            Defina aqui uma senha temporária e <strong className="text-on-surface">informe ao usuário</strong>.
            Ela substitui a senha atual e já entra em vigor no próximo acesso.
          </p>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Link href="/usuarios" className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low">
          Cancelar
        </Link>
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
        >
          {busy ? (<><Loader2 size={16} className="animate-spin" /> Processando...</>) : (<><KeyRound size={16} /> Redefinir senha</>)}
        </button>
      </div>
    </div>
  );
}
