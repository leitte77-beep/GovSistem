"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Eye, Plus } from "lucide-react";
import { api, Manutencao, Oficina, ResumoOficina } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

const CAMPOS_VAZIOS = { nome: "", razao_social: "", cpf_cnpj: "", telefone: "", email: "", endereco: "", responsavel: "", especialidade: "", observacoes: "" };

export default function OficinasPage() {
  const { hasPermission } = useAuth();
  const [lista, setLista] = useState<Oficina[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<Oficina | null>(null);
  const [detalhe, setDetalhe] = useState<Oficina | null>(null);
  const [novo, setNovo] = useState(CAMPOS_VAZIOS);

  const carregar = useCallback(async () => {
    try {
      setLista(await api.listOficinas());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    try {
      if (editando) {
        await api.updateOficina(editando.id, novo);
        toast.success("Oficina atualizada.");
        setEditando(null);
      } else {
        await api.createOficina(novo);
        toast.success("Oficina cadastrada.");
      }
      setNovo(CAMPOS_VAZIOS);
      setMostrarForm(false);
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const campo = (k: string) => ({
    value: (novo as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNovo((n) => ({ ...n, [k]: e.target.value })),
    className: "w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none",
  });

  return (
    <RequirePermission perms="maintenance.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Oficinas</h1>
          {hasPermission("maintenance.manage") && (
            <button className="btn btn-primary" onClick={() => { setMostrarForm(!mostrarForm); setEditando(null); setNovo(CAMPOS_VAZIOS); }}>
              <Plus size={16} /> Nova oficina
            </button>
          )}
        </div>

        {mostrarForm && hasPermission("maintenance.manage") && (
          <form
            className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); salvar(); }}
          >
            <label className="text-meta">Nome *<input required {...campo("nome")} /></label>
            <label className="text-meta">Razão social<input {...campo("razao_social")} /></label>
            <label className="text-meta">CPF/CNPJ<input {...campo("cpf_cnpj")} /></label>
            <label className="text-meta">Telefone<input {...campo("telefone")} /></label>
            <label className="text-meta">E-mail<input type="email" {...campo("email")} /></label>
            <label className="text-meta">Endereço<input {...campo("endereco")} /></label>
            <label className="text-meta">Responsável<input {...campo("responsavel")} /></label>
            <label className="text-meta">Especialidade<input {...campo("especialidade")} /></label>
            <label className="text-meta">Observações<input {...campo("observacoes")} /></label>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMostrarForm(false); setEditando(null); setNovo(CAMPOS_VAZIOS); }}>Cancelar</button>
              <button className="btn btn-primary btn-sm">{editando ? "Salvar alterações" : "Cadastrar"}</button>
            </div>
          </form>
        )}

        <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white shadow-card">
          {lista.length === 0 && <li className="px-4 py-8 text-center text-body-sm text-text-subtle">Nenhuma oficina.</li>}
          {lista.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <span className="text-body-sm font-medium">{o.nome}</span>
                {o.especialidade && <span className="text-meta text-text-subtle"> · {o.especialidade}</span>}
                {!o.ativo && <span className="ml-2 rounded-pill bg-gray-100 px-2 py-0.5 text-meta text-gray-600">inativa</span>}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setDetalhe(o)}>
                  <Eye size={14} /> Detalhes
                </button>
                {hasPermission("maintenance.manage") && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditando(o); setNovo({ ...CAMPOS_VAZIOS, ...o, razao_social: o.razao_social ?? "", cpf_cnpj: o.cpf_cnpj ?? "", telefone: o.telefone ?? "", email: o.email ?? "", endereco: o.endereco ?? "", responsavel: o.responsavel ?? "", especialidade: o.especialidade ?? "", observacoes: o.observacoes ?? "" }); setMostrarForm(true); }}>
                      <Pencil size={14} /> Editar
                    </button>
                    <button className="text-meta text-text-subtle hover:underline" onClick={async () => {
                      await api.updateOficina(o.id, { ...o, ativo: !o.ativo });
                      carregar();
                    }}>
                      {o.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        {detalhe && <ModalDetalhe oficina={detalhe} onFechar={() => setDetalhe(null)} />}
      </div>
    </RequirePermission>
  );
}

function ModalDetalhe({ oficina, onFechar }: { oficina: Oficina; onFechar: () => void }) {
  const [resumo, setResumo] = useState<ResumoOficina | null>(null);
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);

  useEffect(() => {
    api.resumoOficina(oficina.id).then(setResumo).catch(() => {});
    api.listManutencoes({ oficina_id: oficina.id }).then(setManutencoes).catch(() => {});
  }, [oficina.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-white p-5 shadow-elevated">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-label font-semibold text-text-title">{oficina.nome}</h2>
            <p className="text-meta text-text-subtle">{oficina.especialidade ?? "—"}{oficina.telefone ? ` · ${oficina.telefone}` : ""}</p>
          </div>
          <button onClick={onFechar} className="text-text-subtle hover:text-text-title">✕</button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-card border border-surface-border p-3">
            <div className="text-meta text-text-subtle">Manutenções atendidas</div>
            <div className="text-h3 text-text-title">{resumo?.total_manutencoes ?? "—"}</div>
          </div>
          <div className="rounded-card border border-surface-border p-3">
            <div className="text-meta text-text-subtle">Valor total</div>
            <div className="text-h3 text-text-title">R$ {(resumo?.valor_total ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <h3 className="mb-2 text-label font-semibold text-text-title">Últimos atendimentos</h3>
        <ul className="divide-y divide-surface-border">
          {manutencoes.length === 0 && <li className="py-3 text-meta text-text-subtle">Nenhum atendimento registrado.</li>}
          {manutencoes.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-body-sm">
              <span>{new Date(m.data_solicitacao + "T12:00").toLocaleDateString("pt-BR")} · {m.tipo.replace("_", " ")}</span>
              <span className="text-meta text-text-subtle">{m.status.replace("_", " ")} · R$ {Number(m.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
