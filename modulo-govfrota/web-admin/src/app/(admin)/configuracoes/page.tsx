"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, Configuracoes, Unidade } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { AcessosUsuarios } from "@/components/AcessosUsuarios";

function Toggle({ label, ajuda, valor, onChange }: { label: string; ajuda?: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-body-sm text-text-body">{label}</span>
        {ajuda && <span className="block text-meta text-text-subtle">{ajuda}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        onClick={() => onChange(!valor)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${valor ? "bg-[#1D4ED8]" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${valor ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Numero({ label, ajuda, valor, min, max, onChange }: {
  label: string; ajuda?: string; valor: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <label className="text-meta">{label}
      <input type="number" min={min} max={max} value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
      {ajuda && <span className="mt-1 block text-text-subtle">{ajuda}</span>}
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
    const c = config!;
    const inicio = c.horario_abastecimento_inicio || "";
    const fim = c.horario_abastecimento_fim || "";
    if (!!inicio !== !!fim) {
      toast.error("Informe o início e o fim do horário permitido, ou deixe os dois vazios.");
      return;
    }
    setSalvando(true);
    try {
      setConfig(await api.updateConfiguracoes({ ...c, horario_abastecimento_inicio: inicio, horario_abastecimento_fim: fim }));
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
          <label className="text-meta">Tipo da organização
            <select value={config.tipo_organizacao} onChange={(e) => set("tipo_organizacao")(e.target.value)}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm sm:w-80">
              <option value="PUBLICO">Administração pública</option>
              <option value="PRIVADO">Empresa privada</option>
            </select>
          </label>
          <p className="mt-2 text-meta text-text-subtle">
            {publico
              ? "Nomenclatura pública: veículos lotados em secretarias; relatórios de gasto por secretaria."
              : "Nomenclatura privada: veículos lotados em centros de custo; relatórios de gasto por centro de custo."}
          </p>
        </section>

        <Unidades publico={publico} />
        <AcessosUsuarios />

        <RequirePermission perms="config.manage">
          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-1 text-label font-semibold text-text-title">Abastecimento</h2>
            <Toggle label="Foto da bomba obrigatória" valor={config.foto_bomba_obrigatoria} onChange={set("foto_bomba_obrigatoria")} />
            <Toggle label="Foto do painel (KM/horímetro) obrigatória" valor={config.foto_km_obrigatoria} onChange={set("foto_km_obrigatoria")} />
            <Toggle
              label="Exigir resposta para “completou o tanque?”"
              ajuda="O lançamento só é aceito com Sim ou Não — melhora o cálculo de consumo."
              valor={config.exigir_tanque_cheio}
              onChange={set("exigir_tanque_cheio")}
            />
            <Toggle label="Permitir lançamento retroativo no painel" valor={config.permitir_retroativo} onChange={set("permitir_retroativo")} />
            <Toggle label="Bloquear abastecimento com CNH vencida" valor={config.bloquear_cnh_vencida} onChange={set("bloquear_cnh_vencida")} />
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <Numero label="Tolerância de KM/horímetro menor (%)" min={0} max={100}
                valor={config.tolerancia_km_percentual} onChange={set("tolerancia_km_percentual")} />
            </div>
          </section>

          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-1 text-label font-semibold text-text-title">Alertas de conferência</h2>
            <p className="mb-3 text-meta text-text-subtle">
              Não bloqueiam o abastecimento: marcam o registro para conferência e aparecem em Alertas.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-meta">Horário permitido — início
                <input type="time" value={config.horario_abastecimento_inicio || ""}
                  onChange={(e) => set("horario_abastecimento_inicio")(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
              </label>
              <label className="text-meta">Horário permitido — fim
                <input type="time" value={config.horario_abastecimento_fim || ""}
                  onChange={(e) => set("horario_abastecimento_fim")(e.target.value)}
                  className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
                <span className="mt-1 block text-text-subtle">Vazio = sem restrição de horário.</span>
              </label>
              <Numero label="Consumo fora do padrão (% da média)" min={0} max={500}
                ajuda="0 desliga o alerta."
                valor={config.alerta_consumo_desvio_pct} onChange={set("alerta_consumo_desvio_pct")} />
              <Numero label="Litros acima da média do veículo (%)" min={0} max={500}
                ajuda="Compara com a média do veículo naquele combustível (a partir de 3 registros). 0 desliga."
                valor={config.alerta_litros_acima_media_pct} onChange={set("alerta_litros_acima_media_pct")} />
            </div>
            <p className="mt-3 text-meta text-text-subtle">
              Sempre ativos: possível duplicidade e abastecimento sem deslocamento desde o anterior.
            </p>
          </section>

          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-1 text-label font-semibold text-text-title">Combustível e estoque</h2>
            <Toggle label="Permitir estoque negativo (padrão: NÃO)" valor={config.permitir_estoque_negativo} onChange={set("permitir_estoque_negativo")} />
            <Toggle label="Exigir NF na entrada" valor={config.exigir_nf_entrada} onChange={set("exigir_nf_entrada")} />
            <Toggle label="Exigir fornecedor na entrada" valor={config.exigir_fornecedor_entrada} onChange={set("exigir_fornecedor_entrada")} />
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <Numero label="Avisar quando o estoque durar menos de (dias)" min={0} max={365}
                ajuda="Calculado pelo consumo dos últimos 30 dias. 0 desliga."
                valor={config.alerta_estoque_minimo_dias} onChange={set("alerta_estoque_minimo_dias")} />
            </div>
          </section>

          <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="mb-3 text-label font-semibold text-text-title">Manutenção e documentos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Numero label="Antecedência dos avisos (dias)" min={1} max={365}
                ajuda="Preventivas por data, CNH e documentos do veículo a vencer."
                valor={config.antecedencia_alerta_manutencao_dias} onChange={set("antecedencia_alerta_manutencao_dias")} />
            </div>
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

/** Cadastro de secretarias (público) ou centros de custo (privado). */
function Unidades({ publico }: { publico: boolean }) {
  const { hasPermission } = useAuth();
  const pode = hasPermission("config.manage");
  const rotulo = publico ? "Secretarias" : "Centros de custo";
  const singular = publico ? "secretaria" : "centro de custo";
  const [lista, setLista] = useState<Unidade[]>([]);
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [editando, setEditando] = useState<Unidade | null>(null);

  const carregar = useCallback(() => {
    api.listUnidades().then(setLista).catch((e) => toast.error((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      if (editando) {
        await api.updateUnidade(editando.id, { nome, sigla: sigla || null });
        toast.success("Atualizado.");
      } else {
        await api.createUnidade({ nome, sigla: sigla || null });
        toast.success(`${publico ? "Secretaria" : "Centro de custo"} cadastrado.`);
      }
      setNome("");
      setSigla("");
      setEditando(null);
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remover(u: Unidade) {
    if (!window.confirm(`Excluir "${u.nome}"? O histórico de gastos é mantido.`)) return;
    try {
      await api.excluirUnidade(u.id);
      toast.success("Excluído.");
      carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <section className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <h2 className="mb-1 text-label font-semibold text-text-title">{rotulo}</h2>
      <p className="mb-3 text-meta text-text-subtle">
        Cada veículo pertence a uma {singular}. Abastecimentos e manutenções guardam a {singular} do momento
        do lançamento — é a base do relatório de gastos por {singular}.
      </p>

      {pode && (
        <form onSubmit={salvar} className="mb-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-meta">Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={150}
              placeholder={publico ? "Ex.: Secretaria Municipal de Saúde" : "Ex.: Logística"}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
          <label className="w-28 text-meta">Sigla
            <input value={sigla} onChange={(e) => setSigla(e.target.value)} maxLength={20}
              placeholder={publico ? "SMS" : ""}
              className="mt-1 w-full rounded-btn border border-surface-border px-3 py-2 text-body-sm" />
          </label>
          <button type="submit" className="btn btn-primary">
            {editando ? "Salvar" : <><Plus size={16} /> Adicionar</>}
          </button>
          {editando && (
            <button type="button" className="btn btn-secondary" onClick={() => { setEditando(null); setNome(""); setSigla(""); }}>
              Cancelar
            </button>
          )}
        </form>
      )}

      {lista.length === 0 ? (
        <p className="rounded-btn bg-surface-bg px-3 py-4 text-center text-body-sm text-text-subtle">
          Nenhuma {singular} cadastrada.
        </p>
      ) : (
        <ul className="divide-y divide-surface-border rounded-btn border border-surface-border">
          {lista.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-body-sm">
              <span>
                <span className="font-medium text-text-title">{u.nome}</span>
                {u.sigla && <span className="text-text-subtle"> · {u.sigla}</span>}
                <span className="ml-2 text-meta text-text-subtle">{u.total_veiculos} veículo(s)</span>
                {!u.ativo && <span className="ml-2 rounded-pill bg-surface-bg px-2 py-0.5 text-meta text-text-subtle">Inativa</span>}
              </span>
              {pode && (
                <span className="flex gap-1">
                  <button className="btn btn-ghost btn-sm" aria-label={`Editar ${u.nome}`}
                    onClick={() => { setEditando(u); setNome(u.nome); setSigla(u.sigla || ""); }}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm text-[#B42318]" aria-label={`Excluir ${u.nome}`}
                    onClick={() => remover(u)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
