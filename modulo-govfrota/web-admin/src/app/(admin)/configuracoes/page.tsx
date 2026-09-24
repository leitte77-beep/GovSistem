"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, Configuracoes } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

function Toggle({ label, valor, onChange }: { label: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-body-sm text-text-body">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        onClick={() => onChange(!valor)}
        className={`relative h-6 w-11 rounded-full transition-colors ${valor ? "bg-[#1D4ED8]" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${valor ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<Configuracoes | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.getConfiguracoes().then(setConfig).catch((e) => toast.error((e as Error).message));
  }, []);

  if (!config) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  const set = (campo: keyof Configuracoes) => (valor: unknown) =>
    setConfig((c) => ({ ...c!, [campo]: valor }));

  async function salvar() {
    setSalvando(true);
    try {
      await api.updateConfiguracoes(config!);
      toast.success("Configurações salvas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const publico = config.tipo_organizacao === "PUBLICO";

  return (
    <RequirePermission perms={["config.manage", "vehicle.view"]}>
      <div className="max-w-3xl space-y-4">
        <h1 className="text-h2 text-text-title">Configurações do GovFrota</h1>

        <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <h2 className="mb-3 text-label font-semibold text-text-title">Geral</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-meta">Tipo da organização
              <select value={config.tipo_organizacao} onChange={(e) => set("tipo_organizacao")(e.target.value)}
                className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                <option value="PUBLICO">Administração pública</option>
                <option value="PRIVADO">Empresa privada</option>
              </select>
            </label>
            <label className="text-meta">Nome do módulo exibido
              <input value={config.nome_modulo} onChange={(e) => set("nome_modulo")(e.target.value)}
                className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
            </label>
          </div>
          <p className="mt-2 text-meta text-text-subtle">
            {publico
              ? "Nomenclatura pública: secretaria, unidade, departamento, patrimônio."
              : "Nomenclatura privada: empresa, filial, departamento, centro de custo."}
          </p>
        </section>

        <RequirePermission perms="config.manage">
          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-1 text-label font-semibold text-text-title">Abastecimento</h2>
            <Toggle label="Foto obrigatória" valor={config.foto_obrigatoria} onChange={set("foto_obrigatoria")} />
            <Toggle label="Foto da bomba obrigatória" valor={config.foto_bomba_obrigatoria} onChange={set("foto_bomba_obrigatoria")} />
            <Toggle label="Foto da quilometragem obrigatória" valor={config.foto_km_obrigatoria} onChange={set("foto_km_obrigatoria")} />
            <Toggle label="Exigir campo “completou o tanque?”" valor={config.exigir_tanque_cheio} onChange={set("exigir_tanque_cheio")} />
            <Toggle label="Permitir lançamento retroativo" valor={config.permitir_retroativo} onChange={set("permitir_retroativo")} />
            <Toggle label="Bloquear abastecimento com CNH vencida" valor={config.bloquear_cnh_vencida} onChange={set("bloquear_cnh_vencida")} />
            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              <label className="text-meta">Tolerância de KM divergente (%)
                <input type="number" min="0" max="100" value={config.tolerancia_km_percentual}
                  onChange={(e) => set("tolerancia_km_percentual")(Number(e.target.value))}
                  className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
              </label>
              <label className="text-meta">Alerta consumo fora do padrão (%)
                <input type="number" min="0" max="200" value={config.alerta_consumo_desvio_pct}
                  onChange={(e) => set("alerta_consumo_desvio_pct")(Number(e.target.value))}
                  className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
              </label>
            </div>
          </section>

          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-1 text-label font-semibold text-text-title">Combustível e estoque</h2>
            <Toggle label="Permitir estoque negativo (padrão: NÃO)" valor={config.permitir_estoque_negativo} onChange={set("permitir_estoque_negativo")} />
            <Toggle label="Exigir NF na entrada" valor={config.exigir_nf_entrada} onChange={set("exigir_nf_entrada")} />
            <Toggle label="Exigir fornecedor na entrada" valor={config.exigir_fornecedor_entrada} onChange={set("exigir_fornecedor_entrada")} />
          </section>

          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-3 text-label font-semibold text-text-title">Manutenção</h2>
            <label className="text-meta">Antecedência do alerta de manutenção (dias)
              <input type="number" min="1" max="365" value={config.antecedencia_alerta_manutencao_dias}
                onChange={(e) => set("antecedencia_alerta_manutencao_dias")(Number(e.target.value))}
                className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
            </label>
          </section>

          <div className="flex justify-end">
            <button disabled={salvando} onClick={salvar} className="btn btn-primary">
              {salvando ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        </RequirePermission>
      </div>
    </RequirePermission>
  );
}
