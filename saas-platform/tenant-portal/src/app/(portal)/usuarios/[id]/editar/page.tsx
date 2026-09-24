"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Loader2, Info, Save } from "lucide-react";
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
}

export default function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");

  useEffect(() => {
    api<UserDetail>(`/tenant/users/${id}`)
      .then((u) => {
        setName(u.name);
        setPhone(u.phone ?? "");
        setCpf(u.cpf ?? "");
        setPosition(u.position ?? "");
        setDepartment(u.department ?? "");
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
        body: { name, phone: phone || null, cpf: cpf || null, position: position || null, department: department || null },
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/usuarios" className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant transition hover:text-primary-700">
          <ArrowLeft size={15} /> Voltar para usuários
        </Link>
        <h1 className="text-2xl font-semibold text-on-surface">Editar usuário</h1>
        <p className="text-sm text-on-surface-variant">Atualize os dados cadastrais deste servidor no órgão.</p>
      </div>

      <div className="rounded-2xl border bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            <Pencil size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-on-surface">O que esta página faz</h2>
            <p className="text-sm text-on-surface-variant">Edite os dados do vínculo e o perfil do usuário.</p>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/30 p-4 text-sm text-on-surface-variant">
          <Info size={18} className="mt-0.5 shrink-0 text-primary-700" />
          <p>
            Nome, telefone e CPF são dados <strong className="text-on-surface">globais</strong> da identidade. Cargo e
            departamento são <strong className="text-on-surface">específicos deste órgão</strong>. O e-mail não é alterado aqui.
          </p>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">Carregando...</p>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-name">Nome *</label>
              <input id="eu-name" required value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-phone">Telefone</label>
              <input id="eu-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-cpf">CPF</label>
              <input id="eu-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-pos">Cargo</label>
              <input id="eu-pos" value={position} onChange={(e) => setPosition(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface" htmlFor="eu-dept">Departamento</label>
              <input id="eu-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className={field} />
            </div>

            {error && <p className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}

            <div className="mt-2 flex items-center justify-end gap-2 sm:col-span-2">
              <Link href={`/usuarios/${id}`} className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-low">
                Cancelar
              </Link>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
              >
                {busy ? (<><Loader2 size={16} className="animate-spin" /> Salvando...</>) : (<><Save size={16} /> Salvar</>)}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
