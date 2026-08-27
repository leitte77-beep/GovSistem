"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Blocks, Loader2, User, ShieldCheck } from "lucide-react";
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

export default function NovoUsuarioPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("ORG_MEMBER");
  const [active, setActive] = useState(true);
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ContractedModule[]>("/tenant/roles")
      .then(setModules)
      .catch(() => setModules([]));
  }, []);

  const toggleRole = (slug: string, roleName: string) => {
    setGrants((prev) => {
      const cur = prev[slug] ?? [];
      const next = cur.includes(roleName) ? cur.filter((r) => r !== roleName) : [...cur, roleName];
      return { ...prev, [slug]: next };
    });
  };

  const selectedCount = Object.values(grants).reduce((acc, r) => acc + r.length, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ status: string; user_id: string }>("/tenant/users", {
        method: "POST",
        body: {
          name,
          email,
          phone: phone || null,
          cpf: cpf || null,
          position: position || null,
          department: department || null,
          membership_role: role,
          is_active: active,
          force_password_reset: true,
          grants,
        },
      });
      toast(
        res.status === "linked" ? "info" : "success",
        res.status === "linked" ? "Usuário vinculado ao órgão." : "Usuário criado com sucesso."
      );
      router.push("/usuarios");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao criar usuário";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/usuarios"
          className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700"
        >
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Novo usuário</h1>
        <p className="text-sm text-on-surface-variant">
          Cadastre um servidor no órgão, defina os dados e libere os módulos e roles de acesso.
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Dados */}
          <section className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <User size={18} />
              </span>
              <div>
                <h2 className="font-semibold text-on-surface">Dados do servidor</h2>
                <p className="text-xs text-on-surface-variant">Informações de identificação e vínculo.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-name">Nome *</label>
                <input id="nu-name" required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Nome completo do servidor" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-email">E-mail *</label>
                <input id="nu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="email@orgao.gov.br" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-phone">Telefone</label>
                <input id="nu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-cpf">CPF</label>
                <input id="nu-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} className={field} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-pos">Cargo</label>
                <input id="nu-pos" value={position} onChange={(e) => setPosition(e.target.value)} className={field} placeholder="Ex.: Analista de Sistemas" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-dept">Departamento</label>
                <input id="nu-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={field} placeholder="Ex.: Tecnologia da Informação" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="nu-role">Perfil no órgão</label>
                <select id="nu-role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
                  <option value="ORG_MEMBER">Usuário</option>
                  <option value="ORG_ADMIN">Gestor</option>
                </select>
              </div>
              <label className="flex items-center gap-2 self-end rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm text-on-surface">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary-600" />
                Vínculo ativo
              </label>
            </div>
          </section>

          {/* Módulos */}
          <section className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Blocks size={18} />
                </span>
                <div>
                  <h2 className="font-semibold text-on-surface">Módulos e permissões</h2>
                  <p className="text-xs text-on-surface-variant">Libere os sistemas e roles para o usuário.</p>
                </div>
              </div>
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                {selectedCount} role(s) selecionada(s)
              </span>
            </div>

            {modules.length === 0 ? (
              <p className="rounded-lg bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
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
          </section>
        </div>

        {/* Resumo lateral */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border bg-surface-container-lowest p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-on-surface">
              <ShieldCheck size={16} className="text-primary-700" /> Resumo
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Nome</dt>
                <dd className="max-w-[60%] truncate font-medium text-on-surface">{name || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Perfil</dt>
                <dd className="font-medium text-on-surface">{role === "ORG_ADMIN" ? "Gestor" : "Usuário"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Vínculo</dt>
                <dd className="font-medium text-on-surface">{active ? "Ativo" : "Inativo"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Cargo</dt>
                <dd className="max-w-[60%] truncate font-medium text-on-surface">{position || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Departamento</dt>
                <dd className="max-w-[60%] truncate font-medium text-on-surface">{department || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Roles</dt>
                <dd className="font-medium text-on-surface">{selectedCount}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-5">
            <p className="text-sm leading-relaxed text-on-surface-variant">
              O usuário receberá <strong className="text-on-surface">redefinição de senha no primeiro acesso</strong>.
              Se o e-mail já existir, o vínculo é criado sem duplicar a identidade.
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Barra de ações */}
        <div className="flex items-center justify-end gap-2 lg:col-span-3">
          <Link
            href="/usuarios"
            className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <UserPlus size={16} /> Criar usuário
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
