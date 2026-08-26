"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { api, Abastecimento, MotoristaListItem, Tanque, VeiculoListItem, Combustivel } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

function FormLancamento({ onSalvo }: { onSalvo: () => void }) {
  const [veiculos, setVeiculos] = useState<VeiculoListItem[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaListItem[]>([]);
  const [tanques, setTanques] = useState<Tanque[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    veiculo_id: "", motorista_id: "", tanque_id: "", combustivel_id: "",
    quantidade_litros: "", quilometragem: "",
    data_abastecimento: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    api.listVeiculos({ limit: 200 }).then((d) => setVeiculos(d.itens)).catch(() => {});
    api.listMotoristas({ limit: 200 }).then((d) => setMotoristas(d.itens)).catch(() => {});
    api.listTanques().then(setTanques).catch(() => {});
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
  }, []);

  const campo = (k: string) => ({
    value: (form as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none",
  });

  return (
    <form
      className="grid gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await api.createAbastecimento({
            ...form,
            motorista_id: form.motorista_id || undefined,
            data_abastecimento: new Date(form.data_abastecimento).toISOString(),
          });
          toast.success("Abastecimento registrado.");
          onSalvo();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setSalvando(false);
        }
      }}
    >
      <label className="text-meta">Veículo *
        <select required {...campo("veiculo_id")}>
          <option value="">Selecione…</option>
          {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {[v.marca, v.modelo].filter(Boolean).join(" ")}</option>)}
        </select>
      </label>
      <label className="text-meta">Motorista
        <select {...campo("motorista_id")}>
          <option value="">—</option>
          {motoristas.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </label>
      <label className="text-meta">Tanque *
        <select required {...campo("tanque_id")}>
          <option value="">Selecione…</option>
          {tanques.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.combustivel_nome})</option>)}
        </select>
      </label>
      <label className="text-meta">Combustível *
        <select required {...campo("combustivel_id")}>
          <option value="">Selecione…</option>
          {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="text-meta">Litros *<input required type="number" step="0.01" min="0.01" {...campo("quantidade_litros")} /></label>
      <label className="text-meta">KM atual *<input required type="number" min="0" {...campo("quilometragem")} /></label>
      <label className="text-meta sm:col-span-2">Data / hora
        <input type="datetime-local" {...campo("data_abastecimento")} />
      </label>
      <div className="flex items-end">
        <button disabled={salvando} className="btn btn-primary w-full">{salvando ? "Registrando…" : "Registrar"}</button>
      </div>
    </form>
  );
}

export default function AbastecimentosPage() {
  const [lista, setLista] = useState<Abastecimento[] | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [corrigir, setCorrigir] = useState<Abastecimento | null>(null);
  const { hasPermission } = useAuth();

  const carregar = useCallback(async () => {
    try {
      setLista(await api.listAbastecimentos({ data_inicio: dataInicio || undefined, data_fim: dataFim || undefined }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  async function cancelar(id: string) {
    const justificativa = window.prompt("Justificativa do cancelamento:");
    if (!justificativa || justificativa.length < 5) return;
    try {
      await api.cancelarAbastecimento(id, justificativa);
      toast.success("Cancelado e estoque estornado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Abastecimentos</h1>
          {hasPermission("refueling.manage") && (
            <button className="btn btn-primary" onClick={() => setMostrarForm(!mostrarForm)}>
              <Plus size={16} /> Lançar abastecimento
            </button>
          )}
        </div>

        {mostrarForm && hasPermission("refueling.manage") && (
          <FormLancamento onSalvo={() => { setMostrarForm(false); carregar(); }} />
        )}

        <div className="flex flex-wrap gap-3">
          <label className="text-meta">De
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
              className="ml-2 rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
          <label className="text-meta">Até
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
              className="ml-2 rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
        </div>

        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-240 text-body-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Veículo</th>
                <th className="px-4 py-3">Combustível</th>
                <th className="px-4 py-3">Motorista</th>
                <th className="px-4 py-3">Litros</th>
                <th className="px-4 py-3">KM</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Status</th>
                {hasPermission("refueling.manage") && <th className="px-4 py-3">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {!lista && <tr><td colSpan={10} className="px-4 py-8 animate-pulse text-center text-text-subtle">Carregando…</td></tr>}
              {lista?.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-text-subtle">Nenhum abastecimento no período.</td></tr>
              )}
              {lista?.map((a) => (
                <tr key={a.id} className="border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
                  <td className="px-4 py-3">{new Date(a.data_abastecimento).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 font-medium">{a.veiculo_placa ?? "—"}</td>
                  <td className="px-4 py-3">{a.combustivel_nome ?? "—"}</td>
                  <td className="px-4 py-3">{a.motorista_nome ?? "—"}</td>
                  <td className="px-4 py-3">{Number(a.quantidade_litros).toLocaleString("pt-BR")} L</td>
                  <td className="px-4 py-3">{a.quilometragem.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{a.custo_total ? `R$ ${Number(a.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                  <td className="px-4 py-3">{a.origem === "APP_MOTORISTA" ? "App motorista" : "Admin"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-pill px-2 py-0.5 text-meta ${a.status === "CONFIRMADO" ? "bg-green-50 text-[#067647]" : "bg-red-50 text-[#B42318]"}`}>
                      {a.status === "CONFIRMADO" ? "Confirmado" : "Cancelado"}
                    </span>
                  </td>
                  {hasPermission("refueling.manage") && (
                    <td className="px-4 py-3 space-x-2">
                      {a.status === "CONFIRMADO" && (
                        <>
                          <button onClick={() => setCorrigir(a)} className="text-[#1D4ED8] hover:underline">Corrigir</button>
                          <button onClick={() => cancelar(a.id)} className="text-[#B42318] hover:underline">Cancelar</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {corrigir && (
          <ModalCorrigir
            abastecimento={corrigir}
            onFechar={() => setCorrigir(null)}
            onSalvo={() => { setCorrigir(null); carregar(); }}
          />
        )}
      </div>
    </RequirePermission>
  );
}

function ModalCorrigir({ abastecimento, onFechar, onSalvo }: { abastecimento: Abastecimento; onFechar: () => void; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    quantidade_litros: Number(abastecimento.quantidade_litros),
    quilometragem: abastecimento.quilometragem,
    justificativa: "",
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-elevated">
        <h2 className="mb-1 text-label font-semibold text-text-title">Corrigir abastecimento</h2>
        <p className="text-meta text-text-subtle mb-4">
          {abastecimento.veiculo_placa ?? "Veículo"} · {abastecimento.data_abastecimento ? new Date(abastecimento.data_abastecimento).toLocaleDateString("pt-BR") : ""}
          {" — a correção é rastreada em auditoria."}
        </p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSalvando(true);
            try {
              await api.corrigirAbastecimento(abastecimento.id, {
                ...form,
                quantidade_litros: String(form.quantidade_litros),
              });
              toast.success("Abastecimento corrigido.");
              onSalvo();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setSalvando(false);
            }
          }}
        >
          <label className="block text-meta">Litros
            <input required type="number" step="0.01" min="0.01" value={form.quantidade_litros}
              onChange={(e) => setForm({ ...form, quantidade_litros: Number(e.target.value) })}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
          <label className="block text-meta">Quilometragem
            <input required type="number" min="0" value={form.quilometragem}
              onChange={(e) => setForm({ ...form, quilometragem: Number(e.target.value) })}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
          <label className="block text-meta">Justificativa *
            <textarea required minLength={5} value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onFechar} className="btn btn-secondary btn-sm">Cancelar</button>
            <button disabled={salvando} className="btn btn-primary btn-sm">{salvando ? "…" : "Confirmar correção"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
