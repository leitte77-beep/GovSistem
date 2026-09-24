"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, ShieldCheck, Loader2, Save, Mail } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/toast";

interface UserDetail {
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
  position?: string | null;
  department?: string | null;
  membership_role: string;
  membership_active: boolean;
}

export default function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("ORG_MEMBER");
  const [active, setActive] = useState(true);

  useEffect(() => {
    api<UserDetail>(`/tenant/users/${id}`)
      .then((u) => {
        setName(u.name);
        setEmail(u.email);
        setPhone(u.phone ?? "");
        setCpf(u.cpf ?? "");
        setPosition(u.position ?? "");
        setDepartment(u.department ?? "");
        setRole(u.membership_role ?? "ORG_MEMBER");
        setActive(u.membership_active ?? true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar usuário"))
      .finally(() => setLoading(false));
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/tenant/users/${id}/profile`, {
        method: "PATCH",
        body: {
          name,
          email,
          phone: phone || null,
          cpf: cpf || null,
          position: position || null,
          department: department || null,
          membership_role: role,
          is_active: active,
        },
      });
      toast("success", "Cadastro atualizado.");
      router.push(`/usuarios/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-600/15";

  if (loading) {
    return <p className="py-10 text-center text-sm text-on-surface-variant">Carregando...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Editar usuário</h1>
        <p className="text-sm text-on-surface-variant">Atualize todos os dados cadastrais e o vínculo deste servidor no órgão.</p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Dados do servidor */}
          <section className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <User size={22} />
              </span>
              <div>
                <h2 className="font-semibold text-on-surface">Dados do servidor</h2>
                <p className="text-sm text-on-surface-variant">Identificação global da pessoa, compartilhada entre órgãos.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-name">Nome *</label>
                <input id="eu-name" required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Nome completo do servidor" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-email">E-mail *</label>
                <input id="eu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="email@orgao.gov.br" />
                <p className="mt-1 text-xs text-on-surface-variant">Usado para login e comunicações. Alterações passam a valer no próximo acesso.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-phone">Telefone</label>
                <input id="eu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-cpf">CPF</label>
                <input id="eu-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} className={field} placeholder="000.000.000-00" />
              </div>
            </div>
          </section>

          {/* Vínculo no órgão */}
          <section className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                <ShieldCheck size={22} />
              </span>
              <div>
                <h2 className="font-semibold text-on-surface">Vínculo no órgão</h2>
                <p className="text-sm text-on-surface-variant">Dados específicos deste órgão, sem afetar outros vínculos da pessoa.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-pos">Cargo</label>
                <input id="eu-pos" value={position} onChange={(e) => setPosition(e.target.value)} className={field} placeholder="Ex.: Analista de Sistemas" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-dept">Departamento</label>
                <input id="eu-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={field} placeholder="Ex.: Tecnologia da Informação" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-role">Perfil no órgão</label>
                <select id="eu-role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
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
        </div>

        {/* Resumo lateral */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border bg-surface-container-lowest p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-on-surface">
              <ShieldCheck size={16} className="text-primary-700" /> Resumo
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Nome</dt>
                <dd className="max-w-[60%] truncate font-medium text-on-surface">{name || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">E-mail</dt>
                <dd className="flex max-w-[60%] items-center gap-1 truncate font-medium text-on-surface">
                  <Mail size={13} className="shrink-0 text-on-surface-variant" />
                  {email || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Perfil</dt>
                <dd className="font-medium text-on-surface">{role === "ORG_ADMIN" ? "Gestor" : "Usuário"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Vínculo</dt>
                <dd className="font-medium text-on-surface">{active ? "Ativo" : "Suspenso"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Cargo</dt>
                <dd className="max-w-[60%] truncate font-medium text-on-surface">{position || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Departamento</dt>
                <dd className="max-w-[60%] truncate font-medium text-on-surface">{department || "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-5">
            <p className="text-sm leading-relaxed text-on-surface-variant">
              Nome, e-mail, telefone e CPF são dados <strong className="text-on-surface">globais</strong> da identidade.
              Cargo, departamento, perfil e status são <strong className="text-on-surface">específicos deste órgão</strong>.
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Barra de ações */}
        <div className="flex items-center justify-end gap-2 lg:col-span-3">
          <Link href={`/usuarios/${id}`} className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
          >
            {busy ? (<><Loader2 size={16} className="animate-spin" /> Salvando...</>) : (<><Save size={16} /> Salvar alterações</>)}
          </button>
        </div>
      </form>
    </div>
  );
}
