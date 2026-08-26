"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Eye } from "lucide-react";
import { api, Manutencao, Oficina, PlanoPreventivo, VeiculoListItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

const STATUS_CLASSE: Record<string, string> = {
  ABERTA: "bg-gray-100 text-gray-600",
  AGUARDANDO_ORCAMENTO: "bg-orange-50 text-[#B54708]",
  APROVADA: "bg-blue-50 text-[#1D4ED8]",
  EM_MANUTENCAO: "bg-indigo-50 text-indigo-600",
  CONCLUIDA: "bg-green-50 text-[#067647]",
  CANCELADA: "bg-red-50 text-[#B42318]",
};

const ALERTA_PLANO_CLASSE: Record<string, string> = {
  VENCIDA: "bg-red-50 text-[#B42318]",
  PROXIMA: "bg-orange-50 text-[#B54708]",
  OK: "bg-green-50 text-[#067647]",
};

type Aba = "manutencoes" | "preventivas";

export default function ManutencoesPage() {
  const { hasPermission } = useAuth();
  const [aba, setAba] = useState<Aba>("manutencoes");
  const [lista, setLista] = useState<Manutencao[]>([]);
  const [planos, setPlanos] = useState<PlanoPreventivo[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [oficinas, setOficinas] = useState<Oficina[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [detalhe, setDetalhe] = useState<Manutencao | null>(null);
  const [filtros, setFiltros] = useState({ status: "", tipo: "", veiculo_id: "" });
  const [form, setForm] = useState({ veiculo_id: "", tipo: "CORRETIVA", descricao_problema: "", prioridade: "NORMAL", oficina_id: "", data_solicitacao: new Date().toISOString().slice(0, 10), quilometragem: "" });

  const carregar = useCallback(async () => {
    try {
      setLista(await api.listManutencoes({
        status: filtros.status || undefined,
        tipo: filtros.tipo || undefined,
        veiculo_id: filtros.veiculo_id || undefined,
      }));
      setPlanos(await api.listPlanosPreventivos());
      setVeiculos(await api.listVeiculos());
      setOficinas(await api.listOficinas());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [filtros.status, filtros.tipo, filtros.veiculo_id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(id: string, status: string) {
    let data_conclusao: string | undefined;
    if (status === "CONCLUIDA") {
      data_conclusao = new Date().toISOString().slice(0, 10);
    }
    try {
      await api.updateManutencao(id, { status, ...(data_conclusao ? { data_conclusao } : {}) });
      toast.success("Manutenção atualizada.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const placaDe = (vid: string) => veiculos.find((v) => v.id === vid)?.placa ?? "—";
  const nomeOficina = (oid: string | null) => (oid ? oficinas.find((o) => o.id === oid)?.nome ?? "—" : "—");

  return (
    <RequirePermission perms={["maintenance.view", "vehicle.view"]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-text-title">Manutenções</h1>
          <RequirePermission perms="maintenance.manage">
            <button className="btn btn-primary" onClick={() => setMostrarForm(!mostrarForm)}>
              <Plus size={16} /> Nova manutenção
            </button>
          </RequirePermission>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-surface-border">
          {([["manutencoes", `Manutenções (${lista.length})`], ["preventivas", `Preventivas (${planos.length})`]] as [Aba, string][]).map(([chave, label]) => (
            <button key={chave} onClick={() => setAba(chave)}
              className={`px-4 py-2 text-body-sm ${aba === chave ? "border-b-2 border-[#1D4ED8] font-medium text-[#1D4ED8]" : "text-text-body"}`}>
              {label}
            </button>
          ))}
        </div>

        {aba === "manutencoes" && (
          <>
            {mostrarForm && (
              <form
                className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api.createManutencao({
                      ...form,
                      descricao_problema: form.descricao_problema || undefined,
                      oficina_id: form.oficina_id || undefined,
                      quilometragem: form.quilometragem ? Number(form.quilometragem) : undefined,
                    });
                    toast.success("Manutenção aberta.");
                    setMostrarForm(false);
                    setForm({ ...form, descricao_problema: "", quilometragem: "" });
                    carregar();
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                <label className="text-meta">Veículo *
                  <select required value={form.veiculo_id} onChange={(e) => setForm({ ...form, veiculo_id: e.target.value })}
                    className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                    <option value="">Selecione…</option>
                    {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>)}
                  </select>
                </label>
                <label className="text-meta">Tipo
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                    {["PREVENTIVA", "CORRETIVA", "REVISAO", "TROCA_OLEO", "PNEUS", "ELETRICA", "MECANICA", "FUNILARIA", "OUTRO"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="text-meta">Prioridade
                  <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                    className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                    {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="text-meta">KM do veículo
                  <input type="number" min="0" value={form.quilometragem} onChange={(e) => setForm({ ...form, quilometragem: e.target.value })}
                    className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
                </label>
                <label className="text-meta sm:col-span-3">Descrição do problema
                  <input value={form.descricao_problema} onChange={(e) => setForm({ ...form, descricao_problema: e.target.value })}
                    className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
                </label>
                <label className="text-meta">Oficina
                  <select value={form.oficina_id} onChange={(e) => setForm({ ...form, oficina_id: e.target.value })}
                    className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                    <option value="">—</option>
                    {oficinas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </label>
                <div className="sm:col-span-4">
                  <button className="btn btn-primary">Abrir manutenção</button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap gap-3">
              <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
                className="rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm">
                <option value="">Todos os status</option>
                {Object.keys(STATUS_CLASSE).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
              <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
                className="rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm">
                <option value="">Todos os tipos</option>
                {["PREVENTIVA", "CORRETIVA", "REVISAO", "TROCA_OLEO", "PNEUS", "ELETRICA", "MECANICA", "FUNILARIA", "OUTRO"].map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
              <select value={filtros.veiculo_id} onChange={(e) => setFiltros({ ...filtros, veiculo_id: e.target.value })}
                className="rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm">
                <option value="">Todos os veículos</option>
                {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
              <table className="w-full min-w-220 text-body-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                    <th className="px-4 py-3">Veículo</th>
                    <th className="px-4 py-3">Solicitação</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Oficina</th>
                    <th className="px-4 py-3">Prioridade</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {!lista && <tr><td colSpan={8} className="px-4 py-8 animate-pulse text-center text-text-subtle">Carregando…</td></tr>}
                  {lista.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-text-subtle">Nenhuma manutenção.</td></tr>}
                  {lista.map((m) => (
                    <tr key={m.id} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-3 font-medium">{placaDe(m.veiculo_id)}</td>
                      <td className="px-4 py-3">{new Date(m.data_solicitacao + "T12:00").toLocaleDateString("pt-BR")} · {m.descricao_problema?.slice(0, 40)}</td>
                      <td className="px-4 py-3">{m.tipo.replace("_", " ")}</td>
                      <td className="px-4 py-3">{nomeOficina(m.oficina_id)}</td>
                      <td className="px-4 py-3">{m.prioridade}</td>
                      <td className="px-4 py-3">R$ {Number(m.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-pill px-2 py-0.5 text-meta ${STATUS_CLASSE[m.status] ?? ""}`}>{m.status.replace("_", " ")}</span>
                      </td>
                      <td className="space-x-2 px-4 py-3">
                        <button className="inline-flex items-center gap-1 text-[#1D4ED8] hover:underline" onClick={() => setDetalhe(m)}>
                          <Eye size={13} /> Ver
                        </button>
                        <RequirePermission perms="maintenance.manage">
                          {["ABERTA", "AGUARDANDO_ORCAMENTO"].includes(m.status) && (
                            <button className="text-[#1D4ED8] hover:underline" onClick={() => mudarStatus(m.id, "EM_MANUTENCAO")}>Iniciar</button>
                          )}
                          {m.status === "EM_MANUTENCAO" && (
                            <button className="text-[#067647] hover:underline" onClick={() => mudarStatus(m.id, "CONCLUIDA")}>Concluir</button>
                          )}
                          {m.status !== "CONCLUIDA" && m.status !== "CANCELADA" && (
                            <button className="text-[#B42318] hover:underline" onClick={() => mudarStatus(m.id, "CANCELADA")}>Cancelar</button>
                          )}
                        </RequirePermission>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {aba === "preventivas" && (
          <div className="space-y-4">
            {hasPermission("maintenance.manage") && <FormPlanoPreventivo veiculos={veiculos} onSalvo={carregar} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {planos.length === 0 && <p className="text-body-sm text-text-subtle sm:col-span-3">Nenhum plano preventivo configurado.</p>}
              {planos.map((p) => (
                <div key={p.id} className="rounded-card border border-surface-border bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-title">{p.nome}</span>
                    <span className={`rounded-pill px-2 py-0.5 text-meta ${ALERTA_PLANO_CLASSE[p.situacao_alerta ?? "OK"] ?? ""}`}>
                      {p.situacao_alerta === "VENCIDA" ? "Vencida" : p.situacao_alerta === "PROXIMA" ? "Próxima" : "Em dia"}
                    </span>
                  </div>
                  <p className="text-meta text-text-subtle mt-1">{placaDe(p.veiculo_id)} · {p.base.replace("_", " ")}</p>
                  <div className="mt-2 text-body-sm text-text-body">
                    {p.proxima_execucao_km != null && <>Próxima em <strong>{p.proxima_execucao_km.toLocaleString("pt-BR")} km</strong></>}
                    {p.proxima_execucao_data && <>Próxima em <strong>{new Date(p.proxima_execucao_data + "T12:00").toLocaleDateString("pt-BR")}</strong></>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {detalhe && <ModalDetalhe manutencao={detalhe} oficina={nomeOficina(detalhe.oficina_id)} placa={placaDe(detalhe.veiculo_id)} onFechar={() => setDetalhe(null)} onSalvo={carregar} />}
      </div>
    </RequirePermission>
  );
}

function FormPlanoPreventivo({ veiculos, onSalvo }: { veiculos: VeiculoListItem[]; onSalvo: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ veiculo_id: "", nome: "", base: "QUILOMETRAGEM", intervalo_km: "", intervalo_meses: "", ultima_execucao_km: "", ultima_execucao_data: "" });
  if (!aberto) return <button className="btn btn-secondary btn-sm" onClick={() => setAberto(true)}><Plus size={14} /> Novo plano preventivo</button>;
  return (
    <form
      className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.createPlanoPreventivo({
            ...form,
            intervalo_km: form.intervalo_km ? Number(form.intervalo_km) : undefined,
            intervalo_meses: form.intervalo_meses ? Number(form.intervalo_meses) : undefined,
            ultima_execucao_km: form.ultima_execucao_km ? Number(form.ultima_execucao_km) : undefined,
            ultima_execucao_data: form.ultima_execucao_data || undefined,
          });
          toast.success("Plano preventivo criado.");
          setAberto(false);
          setForm({ ...form, nome: "", intervalo_km: "", intervalo_meses: "", ultima_execucao_km: "", ultima_execucao_data: "" });
          onSalvo();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <label className="text-meta">Veículo *<select required value={form.veiculo_id} onChange={(e) => setForm({ ...form, veiculo_id: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
        <option value="">Selecione…</option>
        {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
      </select></label>
      <label className="text-meta">Nome *<input required placeholder="ex.: Troca de óleo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" /></label>
      <label className="text-meta">Base
        <select value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
          <option value="QUILOMETRAGEM">Quilometragem</option>
          <option value="MESES">Meses</option>
          <option value="DATA">Data</option>
        </select>
      </label>
      {form.base === "QUILOMETRAGEM" ? (
        <>
          <label className="text-meta">Intervalo (km) *<input required type="number" min="1" value={form.intervalo_km} onChange={(e) => setForm({ ...form, intervalo_km: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" /></label>
          <label className="text-meta">Última execução (km)<input type="number" min="0" value={form.ultima_execucao_km} onChange={(e) => setForm({ ...form, ultima_execucao_km: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" /></label>
        </>
      ) : (
        <>
          <label className="text-meta">Intervalo (meses) *<input required type="number" min="1" value={form.intervalo_meses} onChange={(e) => setForm({ ...form, intervalo_meses: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" /></label>
          <label className="text-meta">Última execução (data)<input type="date" value={form.ultima_execucao_data} onChange={(e) => setForm({ ...form, ultima_execucao_data: e.target.value })} className="w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" /></label>
        </>
      )}
      <div className="flex items-end gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
        <button className="btn btn-primary btn-sm">Criar plano</button>
      </div>
    </form>
  );
}

function ModalDetalhe({ manutencao, placa, oficina, onFechar, onSalvo }: { manutencao: Manutencao; placa: string; oficina: string; onFechar: () => void; onSalvo: () => void }) {
  const [novoItem, setNovoItem] = useState({ descricao: "", quantidade: "1", valor_unitario: "" });
  const [salvando, setSalvando] = useState(false);
  const itens = manutencao.itens ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-white p-5 shadow-elevated">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-label font-semibold text-text-title">Manutenção {manutencao.tipo.replace("_", " ")}</h2>
            <p className="text-meta text-text-subtle">Veículo {placa} · Oficina {oficina} · {manutencao.status.replace("_", " ")}</p>
          </div>
          <button onClick={onFechar} className="text-text-subtle hover:text-text-title">✕</button>
        </div>
        <p className="mb-4 text-body-sm text-text-body">{manutencao.descricao_problema ?? "Sem descrição."}</p>

        <h3 className="text-label font-semibold text-text-title mb-2">Custos (R$ {Number(manutencao.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})</h3>
        <ul className="divide-y divide-surface-border mb-4">
          {itens.length === 0 && <li className="py-2 text-meta text-text-subtle">Nenhum custo lançado.</li>}
          {itens.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2 text-body-sm">
              <span>{i.descricao} <span className="text-meta text-text-subtle">×{i.quantidade}</span></span>
              <span>R$ {Number(i.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </li>
          ))}
        </ul>

        <form className="grid gap-2 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSalvando(true);
            try {
              await api.adicionarItemManutencao(manutencao.id, {
                categoria: "SERVICO",
                descricao: novoItem.descricao,
                quantidade: Number(novoItem.quantidade),
                valor_unitario: novoItem.valor_unitario,
              });
              toast.success("Custo adicionado.");
              setNovoItem({ descricao: "", quantidade: "1", valor_unitario: "" });
              onSalvo();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setSalvando(false);
            }
          }}>
          <input required placeholder="Descrição (serviço/peça)" value={novoItem.descricao} onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })} className="rounded-btn border border-surface-border px-3 py-2 text-body-sm sm:col-span-1" />
          <input required type="number" min="1" placeholder="Qtd" value={novoItem.quantidade} onChange={(e) => setNovoItem({ ...novoItem, quantidade: e.target.value })} className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          <input required type="number" step="0.01" min="0" placeholder="Valor unitário (R$)" value={novoItem.valor_unitario} onChange={(e) => setNovoItem({ ...novoItem, valor_unitario: e.target.value })} className="rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          <button disabled={salvando} className="btn btn-primary btn-sm sm:col-span-3">{salvando ? "…" : "Adicionar custo"}</button>
        </form>
      </div>
    </div>
  );
}
