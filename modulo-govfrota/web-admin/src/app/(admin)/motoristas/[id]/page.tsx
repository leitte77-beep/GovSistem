"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { Pencil } from "lucide-react";
import { api, AcessoInfo, Motorista, ResumoMotorista } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

export default function DetalheMotoristaPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [motorista, setMotorista] = useState<Motorista | null>(null);
  const [acesso, setAcesso] = useState<AcessoInfo | null>(null);
  const [resumo, setResumo] = useState<ResumoMotorista | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nome: "", cpf: "", matricula: "", telefone: "", email: "", cnh_numero: "", cnh_categoria: "", cnh_validade: "", observacoes: "" });

  useEffect(() => {
    api.getMotorista(id).then((m) => {
      setMotorista(m);
      setForm({
        nome: m.nome, cpf: m.cpf, matricula: m.matricula ?? "", telefone: m.telefone ?? "", email: m.email ?? "",
        cnh_numero: m.cnh_numero ?? "", cnh_categoria: m.cnh_categoria ?? "", cnh_validade: m.cnh_validade ?? "", observacoes: m.observacoes ?? "",
      });
    }).catch((e) => toast.error((e as Error).message));
    api.getAcesso(id).then(setAcesso).catch(() => {});
    api.resumoMotorista(id).then(setResumo).catch(() => {});
  }, [id]);

  if (!motorista) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  async function alternarBloqueio() {
    if (!acesso) return;
    try {
      await api.atualizarCredencial(id, {}, !acesso.bloqueado);
      toast.success(acesso.bloqueado ? "Acesso desbloqueado." : "Acesso bloqueado.");
      setAcesso({ ...acesso, bloqueado: !acesso.bloqueado });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function alternarAtivo() {
    if (!motorista) return;
    try {
      await api.updateMotorista(id, { ...motorista, ativo: !motorista.ativo });
      toast.success(motorista.ativo ? "Motorista desativado." : "Motorista ativado.");
      setMotorista({ ...motorista, ativo: !motorista.ativo });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function salvarEdicao() {
    try {
      await api.updateMotorista(id, {
        ...form,
        cnh_validade: form.cnh_validade || undefined,
      });
      toast.success("Motorista atualizado.");
      setEditando(false);
      const m = await api.getMotorista(id);
      setMotorista(m);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const campo = (k: string) => ({
    value: (form as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none",
  });

  return (
    <RequirePermission perms={["driver.manage", "vehicle.view"]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h2 text-text-title">{motorista.nome}</h1>
            <p className="text-body-sm text-text-subtle">
              CPF {motorista.cpf} {motorista.matricula ? `· Matrícula ${motorista.matricula}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {hasPermission("driver.manage") && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditando(!editando)}>
                  <Pencil size={14} /> Editar cadastro
                </button>
                <button onClick={alternarAtivo} className={`btn ${motorista.ativo ? "btn-danger" : "btn-primary"} btn-sm`}>
                  {motorista.ativo ? "Desativar" : "Ativar"}
                </button>
              </>
            )}
          </div>
        </div>

        {editando && hasPermission("driver.manage") && (
          <form
            className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-4"
            onSubmit={(e) => { e.preventDefault(); salvarEdicao(); }}
          >
            <label className="text-meta">Nome *<input required {...campo("nome")} /></label>
            <label className="text-meta">CPF<input {...campo("cpf")} /></label>
            <label className="text-meta">Matrícula<input {...campo("matricula")} /></label>
            <label className="text-meta">Telefone<input {...campo("telefone")} /></label>
            <label className="text-meta">E-mail<input type="email" {...campo("email")} /></label>
            <label className="text-meta">CNH número<input {...campo("cnh_numero")} /></label>
            <label className="text-meta">Categoria
              <select value={form.cnh_categoria} onChange={(e) => setForm({ ...form, cnh_categoria: e.target.value })}
                className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                <option value="">—</option>
                {["A", "B", "AB", "C", "D", "E"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-meta">Validade CNH<input type="date" {...campo("cnh_validade")} /></label>
            <label className="text-meta sm:col-span-4">Observações<input {...campo("observacoes")} /></label>
            <div className="sm:col-span-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm">Salvar alterações</button>
            </div>
          </form>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card titulo="CNH" valor={motorista.cnh_categoria ?? "—"} sub={
            motorista.cnh_validade
              ? `Vence em ${new Date(motorista.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}`
              : undefined
          } />
          <Card titulo="Abastecimentos" valor={resumo ? String(resumo.total_abastecimentos) : "—"} />
          <Card titulo="Litros abastecidos" valor={resumo ? `${resumo.total_litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` : "—"} />
          <Card titulo="Acesso GovFrota" valor={acesso?.login ? (acesso.bloqueado ? "Bloqueado" : "Ativo") : "Sem acesso"} sub={
            acesso?.ultimo_acesso ? `Último: ${new Date(acesso.ultimo_acesso).toLocaleDateString("pt-BR")}` : undefined
          } />
        </div>

        {acesso?.login && (
          <RequirePermission perms="driver.manage">
            <button onClick={alternarBloqueio} className={`btn ${acesso.bloqueado ? "btn-primary" : "btn-danger"} btn-sm`}>
              {acesso.bloqueado ? "Desbloquear acesso" : "Bloquear acesso"}
            </button>
          </RequirePermission>
        )}

        <div className="rounded-card border border-surface-border bg-white shadow-card">
          <h2 className="border-b border-surface-border px-4 py-3 text-label font-semibold text-text-title">Últimos abastecimentos</h2>
          <ul className="divide-y divide-surface-border">
            {(!resumo || resumo.ultimos_abastecimentos.length === 0) && (
              <li className="px-4 py-4 text-body-sm text-text-subtle">Nenhum registro.</li>
            )}
            {resumo?.ultimos_abastecimentos.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-3 text-body-sm">
                <span>{new Date(a.data).toLocaleDateString("pt-BR")}</span>
                <span>{a.litros.toLocaleString("pt-BR")} L · KM {a.km.toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </RequirePermission>
  );
}

function Card({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="text-meta text-text-subtle">{titulo}</div>
      <div className="text-h3 text-text-title">{valor}</div>
      {sub && <div className="text-meta text-text-subtle">{sub}</div>}
    </div>
  );
}
