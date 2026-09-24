"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, ShieldCheck, CheckCircle2, Eye, EyeOff, ArrowLeft, RefreshCcw } from "lucide-react";
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
  const [show, setShow] = useState<{ current?: boolean; next?: boolean; confirm?: boolean }>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!ctx) router.replace("/login");
  }, [ctx, router]);

  // Indicador de força da senha: pontua por tamanho e variedade de caracteres.
  const forcaSenha = (pw: string): { nivel: number; rotulo: string; cor: string; corBarra: string } => {
    if (!pw) return { nivel: 0, rotulo: "", cor: "", corBarra: "" };
    let pontos = 0;
    if (pw.length >= 6) pontos++;
    if (pw.length >= 10) pontos++;
    if (/[A-Z]/.test(pw)) pontos++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) pontos++;
    if (/[0-9]/.test(pw)) pontos++;
    if (/[^A-Za-z0-9]/.test(pw)) pontos++;
    const nivel = Math.min(4, pontos);
    const mapa = [
      null,
      { rotulo: "Fraca", cor: "text-red-600", corBarra: "bg-red-500" },
      { rotulo: "Média", cor: "text-amber-600", corBarra: "bg-amber-500" },
      { rotulo: "Boa", cor: "text-sky-600", corBarra: "bg-sky-500" },
      { rotulo: "Forte", cor: "text-green-600", corBarra: "bg-green-500" },
    ];
    const m = mapa[nivel];
    return { nivel, rotulo: m?.rotulo ?? "", cor: m?.cor ?? "", corBarra: m?.corBarra ?? "" };
  };

  const f = forcaSenha(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setTouched(true);
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

  const senhaValida = next.length >= 6;
  const conferem = next !== "" && next === confirm;

  const inputCls = (ativo: boolean, erro = false) =>
    `w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-on-surface outline-none transition-all focus:ring-2 ${
      erro
        ? "border-red-300 focus:border-red-500 focus:ring-red-500/15"
        : "border-outline-variant focus:border-primary-600 focus:ring-primary-600/15"
    } ${ativo ? "bg-surface-container-low" : "bg-surface-container-lowest"}`;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Cabeçalho */}
      <div>
        <button
          onClick={() => router.push("/seguranca")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary-700"
        >
          <ArrowLeft size={15} /> Segurança
        </button>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
            <KeyRound size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">Alterar senha</h1>
            <p className="text-sm text-on-surface-variant">Defina uma nova senha para proteger a sua conta.</p>
          </div>
        </div>
      </div>

      {done ? (
        <div className="rounded-xl border bg-surface-container-lowest p-6 shadow-sm">
          <div className="flex flex-col items-center py-4 text-center">
            <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <CheckCircle2 size={28} />
            </span>
            <h2 className="text-lg font-semibold text-on-surface">Senha alterada com sucesso</h2>
            <p className="mt-1 max-w-xs text-sm text-on-surface-variant">
              Sua nova senha já está ativa. Use-a no próximo acesso aos módulos.
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              Ir para o dashboard
            </button>
            <button
              onClick={() => { setDone(false); setCurrent(""); setNext(""); setConfirm(""); setTouched(false); }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-outline-variant py-2.5 text-sm font-medium text-on-surface-variant transition hover:bg-surface-container-low"
            >
              <RefreshCcw size={15} /> Alterar novamente
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-surface-container-lowest shadow-sm">
          <form onSubmit={submit} className="space-y-5 p-6">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                <span className="mt-px shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Senha atual */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface-variant" htmlFor="senha-atual">
                Senha atual
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
                <input
                  id="senha-atual"
                  type={show.current ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className={inputCls(current.length > 0)}
                  placeholder="Digite sua senha atual"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, current: !s.current }))}
                  aria-label={show.current ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 transition-colors hover:text-primary-700"
                >
                  {show.current ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Nova senha */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface-variant" htmlFor="senha-nova">
                Nova senha
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
                <input
                  id="senha-nova"
                  type={show.next ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className={inputCls(next.length > 0, touched && next !== "" && !senhaValida)}
                  placeholder="Mínimo de 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, next: !s.next }))}
                  aria-label={show.next ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 transition-colors hover:text-primary-700"
                >
                  {show.next ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {next.length > 0 && (
                <div className="mt-2 space-y-2">
                  {/* Indicador de nível da senha */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-1.5 flex-1 gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-full flex-1 rounded-full transition-colors duration-200 ${
                            i <= f.nivel ? f.corBarra : "bg-surface-container-high"
                          }`}
                        />
                      ))}
                    </div>
                    {f.nivel > 0 && (
                      <span className={`shrink-0 text-xs font-semibold ${f.cor}`}>
                        {f.rotulo}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={senhaValida ? "text-green-700" : "text-on-surface-variant"}>
                      {senhaValida ? "✓" : "•"} Mínimo de 6 caracteres
                    </span>
                    <span className="text-on-surface-variant/40">·</span>
                    <span className={next === confirm && conferem ? "text-green-700" : "text-on-surface-variant"}>
                      {conferem ? "✓" : "•"} Senhas conferem
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmar */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-on-surface-variant" htmlFor="senha-confirmar">
                Confirmar nova senha
              </label>
              <div className="relative">
                <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
                <input
                  id="senha-confirmar"
                  type={show.confirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls(confirm.length > 0, touched && confirm !== "" && next !== confirm)}
                  placeholder="Repita a nova senha"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
                  aria-label={show.confirm ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 transition-colors hover:text-primary-700"
                >
                  {show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Rodapé do card */}
            <div className="flex flex-col gap-3 border-t border-outline-variant/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <ShieldCheck size={14} className="text-green-700" />
                Mantenha sua senha em sigilo.
              </p>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <KeyRound size={16} /> Alterar senha
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
