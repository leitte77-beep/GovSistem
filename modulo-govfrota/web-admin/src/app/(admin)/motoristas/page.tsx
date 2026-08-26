"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { KeyRound, Plus, Search } from "lucide-react";
import { api, AcessoInfo, MotoristaListItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

function ModalCredencial({ motorista, onFechar, onSalvo }: { motorista: MotoristaListItem; onFechar: () => void; onSalvo: () => void }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.getAcesso(motorista.id).then((a: AcessoInfo) => setLogin(a.login ?? "")).catch(() => {});
  }, [motorista.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-card bg-white p-5 shadow-elevated">
        <h2 className="text-label font-semibold text-text-title mb-1">Acesso do motorista</h2>
        <p className="text-meta text-text-subtle mb-4">{motorista.nome}</p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSalvando(true);
            try {
              await api.definirCredencial(motorista.id, login, senha);
              toast.success("Credencial salva.");
              onSalvo();
              onFechar();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setSalvando(false);
            }
          }}
        >
          <label className="block text-meta">Login
            <input required value={login} onChange={(e) => setLogin(e.target.value)}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none" />
          </label>
          <label className="block text-meta">PIN / senha (mín. 4)
            <input required minLength={4} type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none" />
          </label>
          <p className="text-meta text-text-subtle">O PIN é armazenado com hash seguro — nunca em texto puro.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onFechar} className="btn btn-secondary btn-sm">Cancelar</button>
            <button disabled={salvando} className="btn btn-primary btn-sm">{salvando ? "…" : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MotoristasPage() {
  const [motoristas, setMotoristas] = useState<MotoristaListItem[] | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState<MotoristaListItem | null>(null);
  const [credencialPara, setCredencialPara] = useState<MotoristaListItem | null>(null);
  const [novo, setNovo] = useState({ nome: "", cpf: "", telefone: "", cnh_categoria: "" });

  const carregar = useCallback(async () => {
    try {
      setMotoristas(await api.listMotoristas({ search: busca || undefined }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [busca]);

  useEffect(() => { carregar(); }, [carregar]);

  async function alternarAtivo(m: MotoristaListItem) {
    try {
      const completo = await api.getMotorista(m.id);
      await api.updateMotorista(m.id, { ...completo, ativo: !m.ativo });
      toast.success(m.ativo ? "Motorista desativado." : "Motorista ativado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const formAberto = mostrarForm || editando;

  return (
    <RequirePermission perms={["driver.manage", "vehicle.view"]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Motoristas</h1>
          <RequirePermission perms="driver.manage">
            <button className="btn btn-primary" onClick={() => { setMostrarForm(!mostrarForm); setEditando(null); setNovo({ nome: "", cpf: "", telefone: "", cnh_categoria: "" }); }}>
              <Plus size={16} /> Novo motorista
            </button>
          </RequirePermission>
        </div>

        {formAberto && (
          <form
            className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (editando) {
                  await api.updateMotorista(editando.id, novo);
                  toast.success("Motorista atualizado.");
                } else {
                  await api.createMotorista(novo);
                  toast.success("Motorista cadastrado.");
                }
                setNovo({ nome: "", cpf: "", telefone: "", cnh_categoria: "" });
                setMostrarForm(false);
                setEditando(null);
                carregar();
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <input required placeholder="Nome completo" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
            <input required placeholder="CPF (somente números)" value={novo.cpf} onChange={(e) => setNovo({ ...novo, cpf: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
            <input placeholder="Telefone" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
              className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
            <div className="flex gap-2">
              <select value={novo.cnh_categoria} onChange={(e) => setNovo({ ...novo, cnh_categoria: e.target.value })}
                className="flex-1 rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                <option value="">CNH</option>
                {["A", "B", "AB", "C", "D", "E"].map((c) => <option key={c}>{c}</option>)}
              </select>
              <button className="btn btn-primary">{editando ? "Salvar" : "Salvar"}</button>
            </div>
            {editando && (
              <button type="button" className="sm:col-span-4 text-left text-meta text-[#1D4ED8] hover:underline"
                onClick={() => { setEditando(null); setMostrarForm(false); setNovo({ nome: "", cpf: "", telefone: "", cnh_categoria: "" }); }}>
                Cancelar edição
              </button>
            )}
          </form>
        )}

        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-2.5 text-text-subtle" />
          <input placeholder="Buscar por nome ou CPF…" value={busca} onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-btn border border-surface-border bg-white py-2 pl-9 pr-3 text-body-sm" />
        </div>

        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-160 text-body-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">CNH</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Acesso</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!motoristas && <tr><td colSpan={6} className="px-4 py-8 animate-pulse text-center text-text-subtle">Carregando…</td></tr>}
              {motoristas?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-subtle">Nenhum motorista encontrado.</td></tr>
              )}
              {motoristas?.map((m) => {
                const cnhVencida = m.cnh_validade && new Date(m.cnh_validade + "T12:00") < new Date();
                return (
                  <tr key={m.id} className="border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
                    <td className="px-4 py-3 font-medium">{m.nome}</td>
                    <td className="px-4 py-3">{m.cpf}</td>
                    <td className="px-4 py-3">
                      {m.cnh_validade ? (
                        <span className={cnhVencida ? "font-medium text-[#B42318]" : ""}>
                          {m.cnh_categoria ?? "—"} · vence {new Date(m.cnh_validade + "T12:00").toLocaleDateString("pt-BR")}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-pill px-2 py-0.5 text-meta ${m.ativo ? "bg-green-50 text-[#067647]" : "bg-gray-100 text-gray-600"}`}>
                        {m.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/motoristas/${m.id}`} className="text-[#1D4ED8] hover:underline">Detalhes</Link>
                      {" · "}
                      <button className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline" onClick={() => setCredencialPara(m)}>
                        <KeyRound size={13} /> Acesso
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <RequirePermission perms="driver.manage">
                        <button className="text-[#1D4ED8] hover:underline mr-2" onClick={() => {
                          api.getMotorista(m.id).then((completo) => {
                            setNovo({ nome: completo.nome, cpf: completo.cpf, telefone: completo.telefone ?? "", cnh_categoria: completo.cnh_categoria ?? "" });
                            setEditando(m);
                            setMostrarForm(false);
                          }).catch(() => toast.error("Falha ao carregar motorista."));
                        }}>
                          Editar
                        </button>
                        <button className={m.ativo ? "text-[#B42318] hover:underline" : "text-[#067647] hover:underline"} onClick={() => alternarAtivo(m)}>
                          {m.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </RequirePermission>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {credencialPara && (
          <ModalCredencial motorista={credencialPara} onFechar={() => setCredencialPara(null)} onSalvo={carregar} />
        )}
      </div>
    </RequirePermission>
  );
}
