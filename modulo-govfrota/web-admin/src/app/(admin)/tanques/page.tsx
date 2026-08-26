"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { api, Combustivel, Entrada, Fornecedor, Tanque } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

type Aba = "estoque" | "entradas" | "combustiveis" | "fornecedores";

export default function CombustiveisPage() {
  const [aba, setAba] = useState<Aba>("estoque");
  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const carregar = useCallback(async () => {
    try {
      setTanques(await api.listTanques());
      setEntradas(await api.listEntradas());
      setCombustiveis(await api.listCombustiveis());
      setFornecedores(await api.listFornecedores());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function cancelarEntrada(e: Entrada) {
    const justificativa = window.prompt("Justificativa do cancelamento da entrada:");
    if (!justificativa || justificativa.length < 5) return;
    try {
      await api.cancelarEntrada(e.id, justificativa);
      toast.success("Entrada cancelada e estoque estornado.");
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const abas = [
    { chave: "estoque", label: "Estoque dos tanques" },
    { chave: "entradas", label: "Entradas de combustível" },
    { chave: "combustiveis", label: "Tipos de combustível" },
    { chave: "fornecedores", label: "Fornecedores" },
  ] as const;

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-4">
        <h1 className="text-h2 text-text-title">Combustíveis</h1>

        <div className="flex flex-wrap gap-1 border-b border-surface-border">
          {abas.map((a) => (
            <button key={a.chave} onClick={() => setAba(a.chave)}
              className={`px-4 py-2 text-body-sm ${aba === a.chave ? "border-b-2 border-[#1D4ED8] font-medium text-[#1D4ED8]" : "text-text-body"}`}>
              {a.label}
            </button>
          ))}
        </div>

        {aba === "estoque" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tanques.length === 0 && <p className="text-body-sm text-text-subtle sm:col-span-3">Nenhum tanque cadastrado.</p>}
              {tanques.map((t) => {
                const cor = t.status_estoque === "CRITICO" ? "bg-[#B42318]" : t.status_estoque === "BAIXO" ? "bg-[#B54708]" : "bg-[#067647]";
                return (
                  <Link key={t.id} href={`/tanques/${t.id}`} className="rounded-card border border-surface-border bg-white p-4 shadow-card hover:shadow-elevated">
                    <div className="flex justify-between"><span className="font-medium text-text-title">{t.nome}</span>
                      <span className="text-meta text-text-subtle">{t.combustivel_nome}</span></div>
                    <div className="my-2 h-3 overflow-hidden rounded-full bg-surface-bg">
                      <div className={`h-full ${cor}`} style={{ width: `${Math.min(t.percentual_disponivel ?? 0, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-meta text-text-body">
                      <span>{Number(t.estoque_atual).toLocaleString("pt-BR")} L</span>
                      <span>{(t.percentual_disponivel ?? 0).toFixed(0)}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            <CriarTanqueForm combustiveis={combustiveis} onSalvo={carregar} />
          </div>
        )}

        {aba === "entradas" && (
          <div className="space-y-4">
            <NovaEntradaForm tanques={tanques} fornecedores={fornecedores} onSalvo={carregar} />
            <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
              <table className="w-full min-w-160 text-body-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Litros</th>
                    <th className="px-4 py-3">Nota</th>
                    <th className="px-4 py-3">Valor total</th>
                    <th className="px-4 py-3">R$/L</th>
                    <th className="px-4 py-3">Status</th>
                    <RequirePermission perms="fuel.manage"><th className="px-4 py-3">Ações</th></RequirePermission>
                  </tr>
                </thead>
                <tbody>
                  {entradas.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-text-subtle">Sem entradas.</td></tr>}
                  {entradas.map((e) => (
                    <tr key={e.id} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-3">{new Date(e.data_entrada + "T12:00").toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3 font-medium">{Number(e.quantidade_litros).toLocaleString("pt-BR")} L</td>
                      <td className="px-4 py-3">{e.numero_nota ?? "—"}</td>
                      <td className="px-4 py-3">{e.valor_total ? `R$ ${Number(e.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                      <td className="px-4 py-3">{e.valor_por_litro ? `R$ ${Number(e.valor_por_litro).toFixed(4)}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-pill px-2 py-0.5 text-meta ${e.cancelada ? "bg-red-50 text-[#B42318]" : "bg-green-50 text-[#067647]"}`}>
                          {e.cancelada ? "Cancelada" : "Confirmada"}
                        </span>
                      </td>
                      <RequirePermission perms="fuel.manage">
                        <td className="px-4 py-3">
                          {!e.cancelada && (
                            <button className="text-[#B42318] hover:underline" onClick={() => cancelarEntrada(e)}>Cancelar</button>
                          )}
                        </td>
                      </RequirePermission>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {aba === "combustiveis" && <CombustiveisTab combustiveis={combustiveis} onOk={carregar} />}

        {aba === "fornecedores" && <FornecedoresTab fornecedores={fornecedores} onOk={carregar} />}
      </div>
    </RequirePermission>
  );
}

function CriarTanqueForm({ combustiveis, onSalvo }: { combustiveis: Combustivel[]; onSalvo: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ nome: "", combustivel_id: "", capacidade_maxima: "", estoque_inicial: "0", estoque_minimo: "" });

  if (!aberto)
    return (
      <button className="btn btn-secondary btn-sm self-start" onClick={() => setAberto(true)}>
        <Plus size={14} /> Novo tanque
      </button>
    );

  return (
    <form
      className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.createTanque(form);
          toast.success("Tanque criado.");
          setAberto(false);
          onSalvo();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <input required placeholder="Nome do tanque" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
        className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
      <select required value={form.combustivel_id} onChange={(e) => setForm({ ...form, combustivel_id: e.target.value })}
        className="rounded-btn border border-surface-border px-3 py-2 text-body-sm">
        <option value="">Combustível…</option>
        {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input required type="number" step="0.01" placeholder="Capacidade (L)" value={form.capacidade_maxima}
        onChange={(e) => setForm({ ...form, capacidade_maxima: e.target.value })}
        className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
      <input type="number" step="0.01" placeholder="Estoque mínimo" value={form.estoque_minimo}
        onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
        className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
      <button className="btn btn-primary">Criar tanque</button>
    </form>
  );
}

function NovaEntradaForm({ tanques, fornecedores, onSalvo }: { tanques: Tanque[]; fornecedores: Fornecedor[]; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ tanque_id: "", quantidade_litros: "", numero_nota: "", valor_total: "", fornecedor_id: "", data_entrada: new Date().toISOString().slice(0, 10) });
  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none",
  });

  return (
    <form
      className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          const combustivel_id = tanques.find((t) => t.id === form.tanque_id)?.combustivel_id;
          await api.createEntrada({
            ...form,
            combustivel_id,
            fornecedor_id: form.fornecedor_id || undefined,
            data_entrada: form.data_entrada || undefined,
          });
          toast.success("Entrada registrada — estoque atualizado.");
          setForm({ ...form, quantidade_litros: "", numero_nota: "", valor_total: "" });
          onSalvo();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      <label className="text-meta sm:col-span-2">Tanque *
        <select required {...campo("tanque_id")}>
          <option value="">Selecione…</option>
          {tanques.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.combustivel_nome})</option>)}
        </select>
      </label>
      <label className="text-meta">Litros *<input required type="number" step="0.01" {...campo("quantidade_litros")} /></label>
      <label className="text-meta">Nº da NF *<input required {...campo("numero_nota")} /></label>
      <label className="text-meta">Valor total (R$)<input type="number" step="0.01" {...campo("valor_total")} /></label>
      <label className="text-meta">Data<input type="date" {...campo("data_entrada")} /></label>
      <label className="text-meta sm:col-span-4">Fornecedor
        <select {...campo("fornecedor_id")}>
          <option value="">—</option>
          {fornecedores.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2 flex items-end">
        <button disabled={salvando} className="btn btn-primary w-full">{salvando ? "Registrando…" : "Registrar entrada"}</button>
      </div>
    </form>
  );
}

function CombustiveisTab({ combustiveis, onOk }: { combustiveis: Combustivel[]; onOk: () => void }) {
  const [novo, setNovo] = useState("");
  return (
    <div className="max-w-lg space-y-3">
      <form className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.createCombustivel({ nome: novo });
            setNovo("");
            toast.success("Combustível criado.");
            onOk();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}>
        <input required placeholder="Novo combustível (ex.: Diesel S500)" value={novo} onChange={(e) => setNovo(e.target.value)}
          className="flex-1 rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
        <button className="btn btn-primary btn-sm">Adicionar</button>
      </form>
      <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
        {combustiveis.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3 text-body-sm">
            <span>{c.nome}</span>
            <button
              className={c.ativo ? "text-[#B42318]" : "text-[#067647]"}
              onClick={async () => {
                await api.updateCombustivel(c.id, { nome: c.nome, unidade: c.unidade, ativo: !c.ativo });
                onOk();
              }}
            >
              {c.ativo ? "Desativar" : "Ativar"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FornecedoresTab({ fornecedores, onOk }: { fornecedores: Fornecedor[]; onOk: () => void }) {
  const [novo, setNovo] = useState({ razao_social: "", cpf_cnpj: "", categoria: "COMBUSTIVEL" });
  return (
    <div className="space-y-3">
      <form className="grid gap-2 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.createFornecedor(novo);
            setNovo({ razao_social: "", cpf_cnpj: "", categoria: "COMBUSTIVEL" });
            toast.success("Fornecedor cadastrado.");
            onOk();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}>
        <input required placeholder="Razão social" value={novo.razao_social} onChange={(e) => setNovo({ ...novo, razao_social: e.target.value })}
          className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
        <input placeholder="CPF/CNPJ" value={novo.cpf_cnpj} onChange={(e) => setNovo({ ...novo, cpf_cnpj: e.target.value })}
          className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
        <select value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}
          className="rounded-btn border border-surface-border px-3 py-2 text-body-sm">
          {["COMBUSTIVEL", "AUTOPECAS", "PNEUS", "ELETRICA", "MECANICA", "FUNILARIA", "CONCESSIONARIA", "OUTRO"].map((c) => (
            <option key={c}>{c.replace("_", "-")}</option>
          ))}
        </select>
        <button className="btn btn-primary">Cadastrar</button>
      </form>
      <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
        {fornecedores.map((f) => (
          <li key={f.id} className="flex items-center justify-between px-4 py-3 text-body-sm">
            <span>{f.razao_social} <span className="text-meta text-text-subtle">({f.categoria})</span></span>
            {!f.ativo && <span className="text-meta text-text-subtle">inativo</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
