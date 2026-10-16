"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  BellRing, Building2, ChevronRight, Eye, FileText, Fuel, ImagePlus, Landmark, Loader2, Pencil, Plus, RotateCcw,
  Search, Settings2, ShieldCheck, Trash2, Users, Warehouse, Wrench, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, Configuracoes, Unidade } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { AcessosUsuarios } from "@/components/AcessosUsuarios";

const inputCls =
  "mt-1.5 w-full rounded-btn border border-surface-border bg-white px-3 py-2 text-body-sm text-text-body " +
  "transition focus:border-[#1D5BD6] focus:outline-none focus:ring-2 focus:ring-[#1D5BD6]/20";

type SecaoId = "geral" | "unidades" | "acessos" | "abastecimento" | "alertas" | "estoque" | "manutencao" | "simam" | "pdf";

interface Secao { id: SecaoId; titulo: string; resumo: string; icone: LucideIcon; gerencia?: boolean }

function Toggle({ label, ajuda, valor, onChange }: { label: string; ajuda?: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-text-title">{label}</p>
        {ajuda && <p className="mt-0.5 text-meta text-text-subtle">{ajuda}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        aria-label={label}
        onClick={() => onChange(!valor)}
        className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D5BD6] focus-visible:ring-offset-2 ${valor ? "bg-[#1D5BD6]" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${valor ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Numero({ label, ajuda, valor, min, max, sufixo, onChange }: {
  label: string; ajuda?: string; valor: number; min: number; max: number; sufixo?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block text-meta font-medium text-text-body">{label}
      <span className="relative block">
        <input type="number" min={min} max={max} value={valor}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${inputCls} ${sufixo ? "pr-14" : ""}`} />
        {sufixo && (
          <span className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-meta text-text-subtle">{sufixo}</span>
        )}
      </span>
      {ajuda && <span className="mt-1 block font-normal text-text-subtle">{ajuda}</span>}
    </label>
  );
}

function Painel({ titulo, descricao, icone: Icone, children }: {
  titulo: string; descricao?: string; icone: LucideIcon; children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
      <header className="flex items-start gap-3 border-b border-surface-border bg-surface-bg/60 px-5 py-4">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-btn bg-[#EFF4FF] text-[#1D5BD6]">
          <Icone size={18} />
        </span>
        <div>
          <h2 className="text-label font-semibold text-text-title">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-meta text-text-subtle">{descricao}</p>}
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Grupo({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-surface-border">{children}</div>;
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-btn bg-[#EFF4FF] px-3 py-2.5 text-meta text-[#1E3A8A]">{children}</p>;
}

export default function ConfiguracoesPage() {
  const { hasPermission } = useAuth();
  const gerencia = hasPermission("config.manage");
  const [config, setConfig] = useState<Configuracoes | null>(null);
  const [original, setOriginal] = useState<Configuracoes | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ativa, setAtiva] = useState<SecaoId>("geral");
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    api.getConfiguracoes()
      .then((c) => { setConfig(c); setOriginal(c); })
      .catch((e) => toast.error((e as Error).message));
    const hash = window.location.hash.slice(1) as SecaoId;
    if (hash) setAtiva(hash);
  }, []);

  const publico = config?.tipo_organizacao === "PUBLICO";

  const secoes: Secao[] = useMemo(() => [
    { id: "geral", titulo: "Geral", resumo: "Tipo da organização e nomenclatura", icone: Settings2 },
    { id: "unidades", titulo: publico ? "Secretarias" : "Centros de custo", resumo: "Lotação dos veículos e gastos", icone: Building2 },
    { id: "acessos", titulo: "Usuários e acessos", resumo: "Perfis e secretarias visíveis", icone: Users },
    { id: "abastecimento", titulo: "Abastecimento", resumo: "Fotos, tanque cheio, CNH, retroativo", icone: Fuel, gerencia: true },
    { id: "alertas", titulo: "Alertas de conferência", resumo: "Horário, consumo e litros fora do padrão", icone: BellRing, gerencia: true },
    { id: "estoque", titulo: "Combustível e estoque", resumo: "Estoque, notas de entrada e preço do posto", icone: Warehouse, gerencia: true },
    { id: "manutencao", titulo: "Manutenção e documentos", resumo: "Antecedência dos avisos", icone: Wrench, gerencia: true },
    { id: "simam", titulo: "SIM-AM / TCE-PR", resumo: "Entidade e responsável", icone: Landmark, gerencia: true },
    { id: "pdf", titulo: "Relatórios em PDF", resumo: "Logomarca, cabeçalho, cores e rodapé", icone: FileText, gerencia: true },
  ], [publico]);

  const visiveis = secoes.filter((s) => !s.gerencia || gerencia);
  const filtradas = filtro.trim()
    ? visiveis.filter((s) => `${s.titulo} ${s.resumo}`.toLowerCase().includes(filtro.trim().toLowerCase()))
    : visiveis;

  const alterado = useMemo(
    () => !!config && !!original && JSON.stringify(config) !== JSON.stringify(original),
    [config, original],
  );

  // Avisa antes de sair da página com alterações não salvas.
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  if (!config) {
    return (
      <div className="flex items-center gap-2 text-text-subtle">
        <Loader2 size={18} className="animate-spin" /> Carregando configurações…
      </div>
    );
  }

  const set = (campo: keyof Configuracoes) => (valor: unknown) =>
    setConfig((c) => ({ ...c!, [campo]: valor }));

  function abrir(id: SecaoId) {
    setAtiva(id);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar() {
    const c = config!;
    const inicio = c.horario_abastecimento_inicio || "";
    const fim = c.horario_abastecimento_fim || "";
    if (!!inicio !== !!fim) {
      toast.error("Informe o início e o fim do horário permitido, ou deixe os dois vazios.");
      abrir("alertas");
      return;
    }
    setSalvando(true);
    try {
      const salvo = await api.updateConfiguracoes({ ...c, horario_abastecimento_inicio: inicio, horario_abastecimento_fim: fim });
      setConfig(salvo);
      setOriginal(salvo);
      toast.success("Configurações salvas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const atual = visiveis.find((s) => s.id === ativa) ?? visiveis[0];

  return (
    <RequirePermission perms={["config.manage", "vehicle.view"]}>
      <div className="mx-auto max-w-6xl pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-h2 text-text-title">Configurações</h1>
            <p className="mt-1 text-body-sm text-text-subtle">Regras e cadastros que valem para toda a frota da organização.</p>
          </div>
          {hasPermission("audit.view") && (
            <Link href="/auditoria"
              className="group inline-flex items-center gap-2 rounded-btn border border-surface-border bg-white px-4 py-2 text-body-sm font-medium text-text-title shadow-card transition hover:border-[#1D5BD6] hover:text-[#1D5BD6]">
              <ShieldCheck size={16} className="text-[#1D5BD6]" /> Auditoria
              <ChevronRight size={16} className="text-text-subtle transition group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Navegação */}
          <nav aria-label="Seções das configurações" className="lg:sticky lg:top-4 lg:self-start">
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar configuração…"
                aria-label="Buscar configuração"
                className="w-full rounded-btn border border-surface-border bg-white py-2 pl-9 pr-8 text-body-sm focus:border-[#1D5BD6] focus:outline-none focus:ring-2 focus:ring-[#1D5BD6]/20" />
              {filtro && (
                <button type="button" aria-label="Limpar busca" onClick={() => setFiltro("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-subtle hover:bg-surface-bg">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Celular: chips roláveis */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
              {filtradas.map((s) => (
                <button key={s.id} type="button" onClick={() => abrir(s.id)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-meta font-medium transition ${
                    atual.id === s.id ? "border-[#1D5BD6] bg-[#1D5BD6] text-white" : "border-surface-border bg-white text-text-body"}`}>
                  <s.icone size={14} /> {s.titulo}
                </button>
              ))}
            </div>

            {/* Desktop: lista lateral */}
            <ul className="hidden space-y-1 lg:block">
              {filtradas.map((s) => {
                const sel = atual.id === s.id;
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => abrir(s.id)} aria-current={sel ? "page" : undefined}
                      className={`flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left transition ${
                        sel ? "bg-white shadow-card ring-1 ring-[#1D5BD6]/30" : "hover:bg-white/70"}`}>
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-btn ${
                        sel ? "bg-[#1D5BD6] text-white" : "bg-[#EFF4FF] text-[#1D5BD6]"}`}>
                        <s.icone size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-body-sm font-medium ${sel ? "text-[#1D5BD6]" : "text-text-title"}`}>{s.titulo}</span>
                        <span className="block truncate text-meta text-text-subtle">{s.resumo}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtradas.length === 0 && (
                <li className="px-3 py-4 text-center text-meta text-text-subtle">Nada encontrado.</li>
              )}
            </ul>
          </nav>

          {/* Conteúdo */}
          <div className="min-w-0 space-y-4">
            {atual.id === "geral" && (
              <Painel titulo="Geral" icone={Settings2} descricao="Define a nomenclatura usada em todo o sistema.">
                <p className="mb-3 text-meta font-medium text-text-body">Tipo da organização</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["PUBLICO", "Administração pública", "Veículos lotados em secretarias; relatórios de gasto por secretaria.", Landmark],
                    ["PRIVADO", "Empresa privada", "Veículos lotados em centros de custo; relatórios por centro de custo.", Building2],
                  ] as const).map(([valor, titulo, texto, Icone]) => {
                    const sel = config.tipo_organizacao === valor;
                    return (
                      <button key={valor} type="button" disabled={!gerencia} aria-pressed={sel}
                        onClick={() => set("tipo_organizacao")(valor)}
                        className={`flex items-start gap-3 rounded-card border-2 p-4 text-left transition disabled:cursor-default ${
                          sel ? "border-[#1D5BD6] bg-[#EFF4FF]" : "border-surface-border bg-white hover:border-[#93C5FD]"}`}>
                        <Icone size={20} className={sel ? "text-[#1D5BD6]" : "text-text-subtle"} />
                        <span>
                          <span className="block text-body-sm font-semibold text-text-title">{titulo}</span>
                          <span className="mt-0.5 block text-meta text-text-subtle">{texto}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Painel>
            )}

            {atual.id === "unidades" && <Unidades publico={publico} />}
            {atual.id === "acessos" && <AcessosUsuarios />}

            {atual.id === "abastecimento" && (
              <Painel titulo="Abastecimento" icone={Fuel} descricao="O que é exigido do motorista ao registrar um abastecimento.">
                <Grupo>
                  <Toggle label="Foto da bomba obrigatória" valor={config.foto_bomba_obrigatoria} onChange={set("foto_bomba_obrigatoria")} />
                  <Toggle label="Foto do painel (KM/horímetro) obrigatória" valor={config.foto_km_obrigatoria} onChange={set("foto_km_obrigatoria")} />
                  <Toggle label="Exigir resposta para “completou o tanque?”"
                    ajuda="O lançamento só é aceito com Sim ou Não — melhora o cálculo de consumo."
                    valor={config.exigir_tanque_cheio} onChange={set("exigir_tanque_cheio")} />
                  <Toggle label="Permitir lançamento retroativo no painel" valor={config.permitir_retroativo} onChange={set("permitir_retroativo")} />
                  <Toggle label="Bloquear abastecimento com CNH vencida" valor={config.bloquear_cnh_vencida} onChange={set("bloquear_cnh_vencida")} />
                </Grupo>
                <div className="mt-2 grid gap-4 border-t border-surface-border pt-4 sm:grid-cols-2">
                  <Numero label="Tolerância de KM/horímetro menor" sufixo="%" min={0} max={100}
                    valor={config.tolerancia_km_percentual} onChange={set("tolerancia_km_percentual")} />
                </div>
              </Painel>
            )}

            {atual.id === "alertas" && (
              <Painel titulo="Alertas de conferência" icone={BellRing}
                descricao="Não bloqueiam o abastecimento: marcam o registro para conferência e aparecem em Alertas.">
                <p className="mb-2 text-meta font-semibold uppercase tracking-wide text-text-subtle">Horário permitido</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-meta font-medium text-text-body">Início
                    <input type="time" value={config.horario_abastecimento_inicio || ""}
                      onChange={(e) => set("horario_abastecimento_inicio")(e.target.value)} className={inputCls} />
                  </label>
                  <label className="block text-meta font-medium text-text-body">Fim
                    <input type="time" value={config.horario_abastecimento_fim || ""}
                      onChange={(e) => set("horario_abastecimento_fim")(e.target.value)} className={inputCls} />
                  </label>
                </div>
                <p className="mt-1 text-meta text-text-subtle">Deixe os dois vazios para não restringir o horário.</p>

                <p className="mb-2 mt-6 text-meta font-semibold uppercase tracking-wide text-text-subtle">Desvios</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Numero label="Consumo fora do padrão" sufixo="% média" min={0} max={500}
                    ajuda="0 desliga o alerta."
                    valor={config.alerta_consumo_desvio_pct} onChange={set("alerta_consumo_desvio_pct")} />
                  <Numero label="Litros acima da média do veículo" sufixo="%" min={0} max={500}
                    ajuda="Compara com a média do veículo naquele combustível (a partir de 3 registros). 0 desliga."
                    valor={config.alerta_litros_acima_media_pct} onChange={set("alerta_litros_acima_media_pct")} />
                </div>
                <Nota>Sempre ativos: possível duplicidade e abastecimento sem deslocamento desde o anterior.</Nota>
              </Painel>
            )}

            {atual.id === "estoque" && (
              <Painel titulo="Combustível e estoque" icone={Warehouse} descricao="Entradas de combustível, tanques próprios e notas dos postos.">
                <Grupo>
                  <Toggle label="Permitir estoque negativo" ajuda="Recomendado: desligado."
                    valor={config.permitir_estoque_negativo} onChange={set("permitir_estoque_negativo")} />
                  <Toggle label="Exigir NF na entrada" valor={config.exigir_nf_entrada} onChange={set("exigir_nf_entrada")} />
                  <Toggle label="Exigir fornecedor na entrada" valor={config.exigir_fornecedor_entrada} onChange={set("exigir_fornecedor_entrada")} />
                  <Toggle label="Recusar nota do posto com preço acima do contrato"
                    ajuda="Desligado: a nota é aceita com aviso e a Prefeitura é notificada. Ligado: o posto precisa emitir a nota pelo preço do contrato."
                    valor={config.bloquear_nota_preco_acima_contrato} onChange={set("bloquear_nota_preco_acima_contrato")} />
                </Grupo>
                <div className="mt-2 grid gap-4 border-t border-surface-border pt-4 sm:grid-cols-2">
                  <Numero label="Avisar quando o estoque durar menos de" sufixo="dias" min={0} max={365}
                    ajuda="Calculado pelo consumo dos últimos 30 dias. 0 desliga."
                    valor={config.alerta_estoque_minimo_dias} onChange={set("alerta_estoque_minimo_dias")} />
                </div>
              </Painel>
            )}

            {atual.id === "manutencao" && (
              <Painel titulo="Manutenção e documentos" icone={Wrench} descricao="Quando o sistema começa a avisar sobre vencimentos.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Numero label="Antecedência dos avisos" sufixo="dias" min={1} max={365}
                    ajuda="Preventivas por data, CNH e documentos do veículo a vencer."
                    valor={config.antecedencia_alerta_manutencao_dias} onChange={set("antecedencia_alerta_manutencao_dias")} />
                </div>
              </Painel>
            )}

            {atual.id === "simam" && (
              <Painel titulo="SIM-AM / TCE-PR" icone={Landmark} descricao="Usados nos arquivos mensais de frota e combustível (tela SIM-AM).">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-meta font-medium text-text-body">Código da entidade no TCE (idPessoa)
                    <input inputMode="numeric" maxLength={7} value={config.simam_id_pessoa ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        set("simam_id_pessoa")(v ? Number(v) : null);
                      }}
                      className={`${inputCls} font-mono`} />
                  </label>
                  <label className="block text-meta font-medium text-text-body">CPF do responsável pelo combustível
                    <input inputMode="numeric" maxLength={14} value={config.simam_cpf_responsavel ?? ""}
                      onChange={(e) => set("simam_cpf_responsavel")(e.target.value.replace(/\D/g, "").slice(0, 11) || null)}
                      className={`${inputCls} font-mono`} />
                    <span className="mt-1 block font-normal text-text-subtle">
                      Servidor cadastrado no PessoaAM. Padrão das entradas e saídas extraordinárias.
                    </span>
                  </label>
                </div>
              </Painel>
            )}
            {atual.id === "pdf" && (
              <PersonalizacaoPdf config={config} set={set} aoAtualizarLogo={(tem) => {
                setConfig((c) => ({ ...c!, pdf_tem_logo: tem }));
                setOriginal((o) => ({ ...o!, pdf_tem_logo: tem }));
              }} alterado={alterado} salvar={salvar} salvando={salvando} />
            )}
          </div>
        </div>

        {/* Barra de salvar: só aparece com alterações pendentes */}
        {gerencia && alterado && (
          <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div role="status" className="flex w-full max-w-xl items-center gap-3 rounded-card border border-surface-border bg-navy px-4 py-3 text-white shadow-2xl">
              <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-400" />
              <span className="flex-1 text-body-sm">Há alterações não salvas.</span>
              <button type="button" disabled={salvando} onClick={() => setConfig(original)}
                className="inline-flex items-center gap-1.5 rounded-btn px-3 py-2 text-body-sm text-navy-muted hover:bg-white/10 hover:text-white">
                <RotateCcw size={15} /> Descartar
              </button>
              <button type="button" disabled={salvando} onClick={salvar} className="btn btn-primary">
                {salvando ? <><Loader2 size={16} className="animate-spin" /> Salvando…</> : "Salvar"}
              </button>
            </div>
          </div>
        )}
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
  const [busca, setBusca] = useState("");

  const carregar = useCallback(() => {
    api.listUnidades().then(setLista).catch((e) => toast.error((e as Error).message));
  }, []);
  useEffect(carregar, [carregar]);

  function limpar() {
    setEditando(null);
    setNome("");
    setSigla("");
  }

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
      limpar();
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

  const termo = busca.trim().toLowerCase();
  const exibidas = termo
    ? lista.filter((u) => `${u.nome} ${u.sigla ?? ""}`.toLowerCase().includes(termo))
    : lista;
  const totalVeiculos = lista.reduce((s, u) => s + (u.total_veiculos || 0), 0);

  return (
    <Painel titulo={rotulo} icone={Building2}
      descricao={`Cada veículo pertence a uma ${singular}. Abastecimentos e manutenções guardam a ${singular} do momento do lançamento — é a base do relatório de gastos.`}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-btn bg-surface-bg px-4 py-3">
          <p className="text-meta text-text-subtle">{rotulo} cadastradas</p>
          <p className="text-h3 font-semibold text-text-title">{lista.length}</p>
        </div>
        <div className="rounded-btn bg-surface-bg px-4 py-3">
          <p className="text-meta text-text-subtle">Veículos lotados</p>
          <p className="text-h3 font-semibold text-text-title">{totalVeiculos}</p>
        </div>
      </div>

      {pode && (
        <form onSubmit={salvar}
          className={`mb-4 flex flex-wrap items-end gap-3 rounded-card border p-3 transition ${
            editando ? "border-[#1D5BD6] bg-[#EFF4FF]" : "border-dashed border-surface-border"}`}>
          {editando && (
            <p className="w-full text-meta font-medium text-[#1D5BD6]">Editando “{editando.nome}”</p>
          )}
          <label className="min-w-[220px] flex-1 text-meta font-medium text-text-body">Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={150}
              placeholder={publico ? "Ex.: Secretaria Municipal de Saúde" : "Ex.: Logística"} className={inputCls} />
          </label>
          <label className="w-28 text-meta font-medium text-text-body">Sigla
            <input value={sigla} onChange={(e) => setSigla(e.target.value)} maxLength={20}
              placeholder={publico ? "SMS" : ""} className={inputCls} />
          </label>
          <button type="submit" className="btn btn-primary">
            {editando ? "Salvar" : <><Plus size={16} /> Adicionar</>}
          </button>
          {editando && <button type="button" className="btn btn-secondary" onClick={limpar}>Cancelar</button>}
        </form>
      )}

      {lista.length > 6 && (
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Filtrar ${rotulo.toLowerCase()}…`}
            aria-label={`Filtrar ${rotulo.toLowerCase()}`}
            className="w-full rounded-btn border border-surface-border py-2 pl-9 pr-3 text-body-sm focus:border-[#1D5BD6] focus:outline-none focus:ring-2 focus:ring-[#1D5BD6]/20" />
        </div>
      )}

      {exibidas.length === 0 ? (
        <div className="rounded-card border border-dashed border-surface-border px-4 py-10 text-center">
          <Building2 size={28} className="mx-auto mb-2 text-text-subtle" />
          <p className="text-body-sm text-text-subtle">
            {lista.length === 0 ? `Nenhuma ${singular} cadastrada ainda.` : "Nada encontrado."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {exibidas.map((u) => (
            <li key={u.id}
              className={`group flex items-center gap-3 rounded-card border bg-white px-3 py-3 transition hover:shadow-card ${
                editando?.id === u.id ? "border-[#1D5BD6]" : "border-surface-border"} ${!u.ativo ? "opacity-60" : ""}`}>
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-btn bg-[#EFF4FF] text-meta font-bold text-[#1D5BD6]">
                {(u.sigla || u.nome).slice(0, 3).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium text-text-title" title={u.nome}>{u.nome}</span>
                <span className="block text-meta text-text-subtle">
                  {u.total_veiculos} veículo{u.total_veiculos === 1 ? "" : "s"}
                  {!u.ativo && " · Inativa"}
                </span>
              </span>
              {pode && (
                <span className="flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button className="rounded-btn p-2 text-text-subtle hover:bg-[#EFF4FF] hover:text-[#1D5BD6]" aria-label={`Editar ${u.nome}`}
                    onClick={() => { setEditando(u); setNome(u.nome); setSigla(u.sigla || ""); }}>
                    <Pencil size={15} />
                  </button>
                  <button className="rounded-btn p-2 text-text-subtle hover:bg-red-50 hover:text-[#B42318]" aria-label={`Excluir ${u.nome}`}
                    onClick={() => remover(u)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

const COR1 = "#1D4ED8";
const COR2 = "#F59E0B";

/** Cabeçalho e rodapé do PDF dos relatórios, com prévia ao vivo no estilo do documento. */
function PersonalizacaoPdf({ config, set, aoAtualizarLogo, alterado, salvar, salvando }: {
  config: Configuracoes;
  set: (campo: keyof Configuracoes) => (valor: unknown) => void;
  aoAtualizarLogo: (tem: boolean) => void;
  alterado: boolean;
  salvar: () => void;
  salvando: boolean;
}) {
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const versao = useRef(0);

  const carregarLogo = useCallback(() => {
    if (!config.pdf_tem_logo) { setLogoUrl(null); return; }
    const v = ++versao.current;
    api.urlAutenticada("/configuracoes/pdf-logo").then((u) => v === versao.current && setLogoUrl(u)).catch(() => setLogoUrl(null));
  }, [config.pdf_tem_logo]);
  useEffect(() => { carregarLogo(); }, [carregarLogo]);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!["image/png", "image/jpeg"].includes(arquivo.type)) { toast.error("Use uma imagem PNG ou JPG."); return; }
    if (arquivo.size > 1024 * 1024) { toast.error("A logomarca deve ter até 1 MB."); return; }
    setEnviando(true);
    try {
      await api.enviarLogoPdf(arquivo);
      aoAtualizarLogo(true);
      setLogoUrl(URL.createObjectURL(arquivo));
      toast.success("Logomarca atualizada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remover() {
    try {
      await api.removerLogoPdf();
      aoAtualizarLogo(false);
      setLogoUrl(null);
      toast.success("Logomarca removida.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function exemplo() {
    setGerando(true);
    try {
      window.open(await api.urlAutenticada("/configuracoes/pdf-exemplo"), "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  const cor1 = config.pdf_cor_primaria || COR1;
  const cor2 = config.pdf_cor_secundaria || COR2;
  const titulo = config.pdf_titulo || (user?.organization_name || "Nome do órgão").toUpperCase();
  const subtitulo = config.pdf_titulo ? config.pdf_subtitulo : (config.pdf_subtitulo || "GovFrota · Gestão de Frotas");
  const texto = (campo: keyof Configuracoes, rotulo: string, max: number, placeholder: string, ajuda?: string) => (
    <label className="block text-meta font-medium text-text-body">{rotulo}
      <input value={(config[campo] as string | null) ?? ""} maxLength={max} placeholder={placeholder}
        onChange={(e) => set(campo)(e.target.value)} className={inputCls} />
      {ajuda && <span className="mt-1 block font-normal text-text-subtle">{ajuda}</span>}
    </label>
  );
  const cor = (campo: keyof Configuracoes, rotulo: string, padrao: string) => (
    <label className="block text-meta font-medium text-text-body">{rotulo}
      <span className="mt-1.5 flex items-center gap-2">
        <input type="color" value={(config[campo] as string | null) || padrao} onChange={(e) => set(campo)(e.target.value.toUpperCase())}
          className="h-9 w-12 cursor-pointer rounded-btn border border-surface-border bg-white p-1" />
        <span className="font-mono text-body-sm text-text-subtle">{(config[campo] as string | null) || padrao}</span>
        {config[campo] && (
          <button type="button" onClick={() => set(campo)(null)} className="text-meta text-[#1D4ED8] hover:underline">padrão</button>
        )}
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      <Painel titulo="Relatórios em PDF" icone={FileText}
        descricao="Cabeçalho e rodapé usados em todos os relatórios em PDF do GovFrota. Campos vazios usam o padrão.">
        <div className="space-y-5">
          <div>
            <p className="text-meta font-medium text-text-body">Logomarca / brasão</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-4">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-card border border-dashed border-surface-border bg-surface-bg">
                {logoUrl ? <img src={logoUrl} alt="Logomarca" className="max-h-full max-w-full object-contain p-1" /> : <ImagePlus size={22} className="text-text-subtle" />}
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => input.current?.click()} disabled={enviando} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
                    {enviando ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {logoUrl ? "Trocar imagem" : "Enviar imagem"}
                  </button>
                  {logoUrl && (
                    <button type="button" onClick={remover} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5 text-[#B42318]">
                      <Trash2 size={14} /> Remover
                    </button>
                  )}
                </div>
                <p className="text-meta text-text-subtle">PNG (de preferência com fundo transparente) ou JPG, até 1 MB. Salva na hora.</p>
              </div>
              <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => enviar(e.target.files?.[0])} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {texto("pdf_titulo", "Título do cabeçalho", 120, "Ex.: GESTÃO DE FROTAS", "Vazio = nome do órgão.")}
            {texto("pdf_subtitulo", "Subtítulo", 150, "Ex.: Prefeitura de Farol")}
            <div className="sm:col-span-2">{texto("pdf_linha_extra", "Linha complementar", 250, "Ex.: CNPJ 00.000.000/0001-00 · Rua Central, 100 · Centro", "Vazio = CNPJ do órgão, se cadastrado.")}</div>
            <div className="sm:col-span-2">{texto("pdf_rodape", "Texto do rodapé", 300, "Ex.: Prefeitura de Farol · (44) 3333-0000 · farol.pr.gov.br", "Aparece no pé de todas as páginas, com a data de emissão e a numeração.")}</div>
            {cor("pdf_cor_primaria", "Cor principal", COR1)}
            {cor("pdf_cor_secundaria", "Cor de destaque", COR2)}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-surface-border pt-4">
            {alterado && <span className="text-meta text-[#B54708]">Alterações ainda não salvas</span>}
            <button type="button" onClick={salvar} disabled={!alterado || salvando} className="btn btn-primary">
              {salvando ? <><Loader2 size={16} className="animate-spin" /> Salvando…</> : alterado ? "Salvar personalização" : "Tudo salvo"}
            </button>
          </div>
        </div>
      </Painel>

      <section className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-5 py-3">
          <h2 className="text-label font-semibold text-text-title">Prévia</h2>
          <button type="button" onClick={exemplo} disabled={gerando || alterado}
            title={alterado ? "Salve as alterações para gerar o PDF" : undefined}
            className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            {gerando ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} {alterado ? "Salve para ver o PDF real" : "Abrir PDF de exemplo"}
          </button>
        </div>
        <div className="bg-surface-bg p-4 sm:p-6">
          <div className="mx-auto max-w-2xl rounded-md bg-white px-6 pb-4 pt-4 shadow-md sm:px-10" style={{ aspectRatio: "auto" }}>
            <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, #0F172A, ${cor1}, ${cor2})` }} />
            <div className="flex flex-col items-center pt-5 text-center">
              {logoUrl && <img src={logoUrl} alt="" className="mb-2 max-h-20 max-w-28 object-contain" />}
              <p className="text-xl font-extrabold leading-tight tracking-tight text-[#0F172A]">{titulo}</p>
              {subtitulo && <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#475569]">{subtitulo}</p>}
              {config.pdf_linha_extra && <p className="mt-0.5 text-[11px] text-[#64748B]">{config.pdf_linha_extra}</p>}
            </div>
            <hr className="my-4 border-[#E2E8F0]" />
            <p className="text-lg" style={{ color: cor1 }}>Relatório de abastecimentos</p>
            <p className="text-[10px] text-[#6B7280]">Período: 01/01/2026 a 31/01/2026</p>
            <div className="mt-3 overflow-hidden rounded-sm border border-[#D1D5DB] text-[10px]">
              <div className="grid grid-cols-4 font-semibold text-white" style={{ background: cor1 }}>
                {["Placa", "Secretaria", "Litros", "Valor (R$)"].map((h) => <span key={h} className="px-2 py-1 text-center">{h}</span>)}
              </div>
              {[["ABC1D23", "Saúde", "480,50", "2.950,40"], ["EDU1A23", "Educação", "1.630,00", "9.780,00"]].map((r, i) => (
                <div key={i} className={`grid grid-cols-4 ${i % 2 ? "bg-[#F3F4F6]" : ""}`}>
                  {r.map((c, j) => <span key={j} className={`px-2 py-1 ${j > 1 ? "text-right" : ""}`}>{c}</span>)}
                </div>
              ))}
            </div>
            <div className="mt-10 border-t border-[#D1D5DB] pt-1.5 text-[9px] text-[#6B7280]">
              {config.pdf_rodape ? (
                <>
                  <p className="text-center">{config.pdf_rodape}</p>
                  <p className="flex justify-between"><span>Emitido em 02/10/2026 15:00 por {user?.name ?? "Usuário"}</span><span>Página 1 de 1</span></p>
                </>
              ) : (
                <>
                  <p className="flex justify-between"><span>GovFrota · {user?.organization_name ?? "Órgão"}</span><span>Emitido em 02/10/2026 15:00 por {user?.name ?? "Usuário"}</span></p>
                  <p className="text-center">Página 1 de 1</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
