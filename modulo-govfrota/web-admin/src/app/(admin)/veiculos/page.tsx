"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus, Search } from "lucide-react";
import { api, Combustivel, VeiculoListItem } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";

const SITUACOES: Record<string, { label: string; classe: string }> = {
  DISPONIVEL: { label: "Disponível", classe: "bg-green-50 text-[#067647]" },
  EM_USO: { label: "Em uso", classe: "bg-blue-50 text-[#1D4ED8]" },
  EM_MANUTENCAO: { label: "Em manutenção", classe: "bg-orange-50 text-[#B54708]" },
  INDISPONIVEL: { label: "Indisponível", classe: "bg-gray-100 text-gray-600" },
  BAIXADO: { label: "Baixado", classe: "bg-red-50 text-[#B42318]" },
};

function FormVeiculo({ onSalvo, combustiveis }: { onSalvo: () => void; combustiveis: Combustivel[] }) {
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    placa: "",
    marca: "",
    modelo: "",
    tipo: "CARRO",
    cor: "",
    ano_fabricacao: "",
    quilometragem_atual: 0,
    combustivel_principal_id: "",
    capacidade_tanque_litros: "",
    unidade: "",
    departamento: "",
    centro_custo: "",
  });

  const campo = (k: string) => ({
    value: (form as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className:
      "w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm focus:border-[#1D4ED8] focus:outline-none",
  });

  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <h2 className="text-label font-semibold text-text-title mb-3">Novo veículo</h2>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          try {
            await api.createVeiculo({
              ...form,
              ano_fabricacao: form.ano_fabricacao ? Number(form.ano_fabricacao) : undefined,
              capacidade_tanque_litros: form.capacidade_tanque_litros || undefined,
              combustivel_principal_id: form.combustivel_principal_id || undefined,
            });
            toast.success("Veículo cadastrado.");
            onSalvo();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setSalvando(false);
          }
        }}
      >
        <label className="text-meta">Placa *<input required placeholder="ABC1D23" {...campo("placa")} /></label>
        <label className="text-meta">Marca<input {...campo("marca")} /></label>
        <label className="text-meta">Modelo<input {...campo("modelo")} /></label>
        <label className="text-meta">Tipo
          <select {...campo("tipo")}>
            {["CARRO", "UTILITARIO", "CAMINHONETE", "CAMINHAO", "ONIBUS", "MICRO_ONIBUS", "VAN", "MOTOCICLETA", "MAQUINA", "TRATOR", "EQUIPAMENTO", "OUTRO"].map((t) => (
              <option key={t} value={t}>{t.replace("_", "-")}</option>
            ))}
          </select>
        </label>
        <label className="text-meta">Cor<input {...campo("cor")} /></label>
        <label className="text-meta">Ano fabricação<input type="number" {...campo("ano_fabricacao")} /></label>
        <label className="text-meta">KM inicial<input type="number" {...campo("quilometragem_atual")} /></label>
        <label className="text-meta">Combustível principal
          <select {...campo("combustivel_principal_id")}>
            <option value="">—</option>
            {combustiveis.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label className="text-meta">Capacidade tanque (L)<input type="number" step="0.01" {...campo("capacidade_tanque_litros")} /></label>
        <label className="text-meta">Unidade / Secretaria<input {...campo("unidade")} /></label>
        <label className="text-meta">Departamento<input {...campo("departamento")} /></label>
        <label className="text-meta">Centro de custo<input {...campo("centro_custo")} /></label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button disabled={salvando} className="btn btn-primary">
            {salvando ? "Salvando…" : "Cadastrar veículo"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<VeiculoListItem[] | null>(null);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [busca, setBusca] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const { hasPermission } = useAuth();

  const carregar = useCallback(async () => {
    try {
      const dados = await api.listVeiculos({ search: busca || undefined, situacao: situacaoFiltro || undefined });
      setVeiculos(dados);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [busca, situacaoFiltro]);

  useEffect(() => {
    carregar();
    api.listCombustiveis(true).then(setCombustiveis).catch(() => {});
  }, [carregar]);

  return (
    <RequirePermission perms="vehicle.view">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-h2 text-text-title">Veículos</h1>
          {hasPermission("vehicle.manage") && (
            <button className="btn btn-primary" onClick={() => setMostrarForm(!mostrarForm)}>
              <Plus size={16} /> Novo veículo
            </button>
          )}
        </div>

        {mostrarForm && hasPermission("vehicle.manage") && (
          <FormVeiculo
            combustiveis={combustiveis}
            onSalvo={() => {
              setMostrarForm(false);
              carregar();
            }}
          />
        )}

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52 max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-text-subtle" />
            <input
              placeholder="Buscar por placa ou modelo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-btn border border-surface-border bg-white py-2 pl-9 pr-3 text-body-sm focus:border-[#1D4ED8] focus:outline-none"
            />
          </div>
          <select
            value={situacaoFiltro}
            onChange={(e) => setSituacaoFiltro(e.target.value)}
            className="rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm"
          >
            <option value="">Todas as situações</option>
            {Object.entries(SITUACOES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
          <table className="w-full min-w-220 text-body-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3">Veículo</th>
                <th className="px-4 py-3">KM</th>
                <th className="px-4 py-3">Consumo médio</th>
                <th className="px-4 py-3">Último abastecimento</th>
                <th className="px-4 py-3">Última manutenção</th>
                <th className="px-4 py-3">Próxima manutenção</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {!veiculos && (
                <tr><td colSpan={8} className="px-4 py-8 text-center animate-pulse text-text-subtle">Carregando…</td></tr>
              )}
              {veiculos?.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-text-subtle">Nenhum veículo encontrado.</td></tr>
              )}
              {veiculos?.map((v) => {
                const sit = SITUACOES[v.situacao] ?? SITUACOES.DISPONIVEL;
                const prox = v.proxima_manutencao;
                const proxVencida = prox && prox.situacao === "VENCIDA";
                const proxProxima = prox && prox.situacao === "PROXIMA";
                return (
                  <tr key={v.id} className="border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
                    <td className="px-4 py-3">
                      <Link href={`/veiculos/${v.id}`} className="font-medium text-[#1D4ED8] hover:underline">
                        {v.placa}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{[v.marca, v.modelo].filter(Boolean).join(" ")}</td>
                    <td className="px-4 py-3">{v.quilometragem_atual.toLocaleString("pt-BR")} km</td>
                    <td className="px-4 py-3">
                      {v.consumo_medio_km_l != null ? `${Number(v.consumo_medio_km_l).toFixed(2)} km/L` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.ultimo_abastecimento ? (
                        <>
                          {new Date(v.ultimo_abastecimento.data + (v.ultimo_abastecimento.data.length === 10 ? "T12:00" : "")).toLocaleDateString("pt-BR")}
                          {" · "}{Number(v.ultimo_abastecimento.litros).toLocaleString("pt-BR")} L
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.ultima_manutencao ? (
                        <>
                          {new Date(v.ultima_manutencao.data + "T12:00").toLocaleDateString("pt-BR")}
                          <span className="text-meta text-text-subtle"> · {v.ultima_manutencao.status.replace("_", " ")}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {prox ? (
                        <span className={`rounded-pill px-2 py-0.5 text-meta ${proxVencida ? "bg-red-50 text-[#B42318]" : proxProxima ? "bg-orange-50 text-[#B54708]" : "bg-green-50 text-[#067647]"}`}>
                          {prox.nome}
                          {prox.proxima_km ? ` · ${prox.proxima_km.toLocaleString("pt-BR")} km` : prox.proxima_data ? ` · ${new Date(prox.proxima_data + "T12:00").toLocaleDateString("pt-BR")}` : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-pill px-2 py-0.5 text-meta ${sit.classe}`}>{sit.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </RequirePermission>
  );
}
