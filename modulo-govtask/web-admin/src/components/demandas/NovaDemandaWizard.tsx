"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { fimDoDia, semVazios } from "@/lib/demandaForm";
import type { WorkflowResumo } from "@/types/govtask";

/** Formulário progressivo de nova demanda (§113) com criação rápida (§114).
 *
 * Nada de 50 campos de uma vez: o passo 1 já basta para abrir a demanda. Os
 * passos seguintes (pessoas, prazos, documentos, workflow) aparecem um de cada
 * vez, e qualquer um além do primeiro pode ser pulado — os campos ficam
 * editáveis depois no detalhe da demanda.
 */

const ORIGENS: [string, string][] = [
  ["DETERMINACAO_PREFEITO", "Determinação do Prefeito"],
  ["REUNIAO", "Reunião"],
  ["CONVERSA", "Conversa"],
  ["LIGACAO", "Ligação"],
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "E-mail"],
  ["OFICIO", "Ofício"],
  ["SOLICITACAO_INTERNA", "Solicitação interna"],
  ["SECRETARIO", "Secretário"],
  ["VEREADOR", "Vereador"],
  ["DEPUTADO_ESTADUAL", "Deputado estadual"],
  ["DEPUTADO_FEDERAL", "Deputado federal"],
  ["SENADOR", "Senador"],
  ["GOVERNO_ESTADUAL", "Governo Estadual"],
  ["GOVERNO_FEDERAL", "Governo Federal"],
  ["MINISTERIO", "Ministério"],
  ["SECRETARIA_ESTADUAL", "Secretaria estadual"],
  ["CIDADAO", "Cidadão"],
  ["EMPRESA", "Empresa"],
  ["ORGAO_CONTROLE", "Órgão de controle"],
  ["PROCESSO_ADMINISTRATIVO", "Processo administrativo"],
  ["SISTEMA_EXTERNO", "Sistema externo"],
  ["OUTRO", "Outro"],
];

const PRIORIDADES: [string, string][] = [
  ["BAIXA", "Baixa"],
  ["NORMAL", "Normal"],
  ["ALTA", "Alta"],
  ["URGENTE", "Urgente"],
  ["CRITICA", "Crítica"],
];

const PASSOS = [
  "O que precisa ser feito?",
  "Quem está relacionado?",
  "Prazos",
  "Documentos",
  "Workflow",
];

type Pessoa = { id: string; name: string; email: string };
type Setor = { id: string; nome: string; sigla?: string | null };
type Tipo = { id: string; chave: string; rotulo: string };

const CAMPO =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-100";

const vazio = {
  titulo: "",
  descricao: "",
  objeto: "",
  tipo_id: "",
  prioridade: "NORMAL",
  solicitante_id: "",
  responsavel_geral_id: "",
  setor_atual_id: "",
  origem: "",
  origem_descricao: "",
  data_solicitacao: "",
  prazo_final: "",
  prazo_interno: "",
  workflow_id: "",
  rascunho: false,
};

export function NovaDemandaWizard({
  aberto,
  onFechar,
  onCriada,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriada: (demanda: { id: string; numero: string }) => void;
}) {
  const [passo, setPasso] = useState(0);
  const [form, setForm] = useState({ ...vazio });
  const [salvando, setSalvando] = useState(false);

  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowResumo[]>([]);

  useEffect(() => {
    if (!aberto) return;
    setPasso(0);
    setForm({ ...vazio });
    // Cada fonte falha isolada: uma permissão que não temos não pode derrubar
    // o formulário inteiro.
    api.catalogosDemandas().then((c) => setTipos(c.tipos)).catch(() => setTipos([]));
    api.listUsers().then((u) => setPessoas(u)).catch(() => setPessoas([]));
    api.listSetores().then((s) => setSetores(s)).catch(() => setSetores([]));
    api.listarWorkflows().then((w) => setWorkflows(w)).catch(() => setWorkflows([]));
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, onFechar]);

  const definido = useMemo(() => semVazios({
    titulo: form.titulo.trim(),
    descricao: form.descricao.trim() || undefined,
    objeto: form.objeto.trim() || undefined,
    tipo_id: form.tipo_id || undefined,
    prioridade: form.prioridade,
    solicitante_id: form.solicitante_id || undefined,
    responsavel_geral_id: form.responsavel_geral_id || undefined,
    setor_atual_id: form.setor_atual_id || undefined,
    origem: form.origem || undefined,
    origem_descricao: form.origem_descricao.trim() || undefined,
    data_solicitacao: form.data_solicitacao || undefined,
    prazo_final: fimDoDia(form.prazo_final),
    prazo_interno: fimDoDia(form.prazo_interno),
    rascunho: form.rascunho || undefined,
  }), [form]);

  const podeCriar = form.titulo.trim().length >= 3;

  if (!aberto) return null;

  const setCampo = (campo: keyof typeof form, valor: string | boolean) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  async function criar(parcial = false) {
    if (!podeCriar || salvando) return;
    const payload = parcial
      ? semVazios({
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim() || undefined,
          tipo_id: form.tipo_id || undefined,
          prioridade: form.prioridade,
          rascunho: true,
        })
      : definido;
    setSalvando(true);
    try {
      const demanda = await api.criarDemandaV2(payload);
      if (!parcial && form.workflow_id) {
        // O fluxo é aplicado depois de a demanda existir; se falhar, a demanda
        // já foi criada e o usuário aplica o fluxo pela tela, sem perder o resto.
        try {
          await api.aplicarFluxo(demanda.id, form.workflow_id);
        } catch {
          notify.error("A demanda foi criada, mas o workflow não pôde ser aplicado.");
        }
      }
      notify.success(`Demanda ${demanda.numero} criada`);
      onCriada(demanda);
      onFechar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível criar a demanda");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-demanda-titulo"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-100 p-6">
          <div>
            <h2 id="nova-demanda-titulo" className="text-lg font-bold text-slate-900">
              Nova demanda
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Passo {passo + 1} de {PASSOS.length} — {PASSOS[passo]}
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav aria-label="Etapas do formulário" className="flex gap-1 border-b border-slate-100 px-6 py-3">
          {PASSOS.map((rotulo, indice) => (
            <button
              key={rotulo}
              type="button"
              onClick={() => setPasso(indice)}
              aria-current={indice === passo ? "step" : undefined}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                indice === passo
                  ? "bg-blue-700 text-white"
                  : indice < passo
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {indice < passo ? <Check className="h-3 w-3" /> : <span>{indice + 1}</span>}
              <span className="hidden sm:inline">{rotulo}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          {passo === 0 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Título *</span>
                <input
                  autoFocus
                  value={form.titulo}
                  onChange={(e) => setCampo("titulo", e.target.value)}
                  placeholder="Ex.: Aquisição de veículo por indicação parlamentar"
                  className={`mt-1 ${CAMPO}`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Descrição</span>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setCampo("descricao", e.target.value)}
                  rows={3}
                  placeholder="O que foi solicitado e o que se espera"
                  className={`mt-1 resize-y ${CAMPO}`}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Tipo</span>
                  <select value={form.tipo_id} onChange={(e) => setCampo("tipo_id", e.target.value)} className={`mt-1 ${CAMPO}`}>
                    <option value="">Não classificado</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>{t.rotulo}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Prioridade</span>
                  <select value={form.prioridade} onChange={(e) => setCampo("prioridade", e.target.value)} className={`mt-1 ${CAMPO}`}>
                    {PRIORIDADES.map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>{rotulo}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                Vários campos são opcionais. Se preferir, use <b>Criar rápido</b> e registre os
                demais detalhes depois, na própria demanda.
              </p>
            </div>
          )}

          {passo === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Solicitante</span>
                  <select value={form.solicitante_id} onChange={(e) => setCampo("solicitante_id", e.target.value)} className={`mt-1 ${CAMPO}`}>
                    <option value="">Não informado</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Responsável geral</span>
                  <select value={form.responsavel_geral_id} onChange={(e) => setCampo("responsavel_geral_id", e.target.value)} className={`mt-1 ${CAMPO}`}>
                    <option value="">Eu mesmo</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Departamento atual</span>
                <select value={form.setor_atual_id} onChange={(e) => setCampo("setor_atual_id", e.target.value)} className={`mt-1 ${CAMPO}`}>
                  <option value="">Não informado</option>
                  {setores.map((s) => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ""}{s.nome}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Origem</span>
                  <select value={form.origem} onChange={(e) => setCampo("origem", e.target.value)} className={`mt-1 ${CAMPO}`}>
                    <option value="">Não informada</option>
                    {ORIGENS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Autoridade relacionada (texto)</span>
                  <input
                    value={form.origem_descricao}
                    onChange={(e) => setCampo("origem_descricao", e.target.value)}
                    placeholder="Ex.: Deputado XXXXX, reunião em Curitiba"
                    className={`mt-1 ${CAMPO}`}
                  />
                </label>
              </div>
            </div>
          )}

          {passo === 2 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Data da solicitação</span>
                <input type="date" value={form.data_solicitacao} onChange={(e) => setCampo("data_solicitacao", e.target.value)} className={`mt-1 ${CAMPO}`} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Prazo final</span>
                  <input type="date" value={form.prazo_final} onChange={(e) => setCampo("prazo_final", e.target.value)} className={`mt-1 ${CAMPO}`} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Prazo interno</span>
                  <input type="date" value={form.prazo_interno} onChange={(e) => setCampo("prazo_interno", e.target.value)} className={`mt-1 ${CAMPO}`} />
                </label>
              </div>
            </div>
          )}

          {passo === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Os documentos são anexados à demanda depois de criada, na aba
                <b> Documentos</b>. Assim o arquivo já nasce com número de demanda, autor,
                versão e trilha de auditoria — em vez de ficar solto antes de o processo existir.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-500">
                <li>Você pode criar a demanda agora e anexar em seguida.</li>
                <li>Documentos obrigatórios são cobrados por etapa/checklist.</li>
              </ul>
            </div>
          )}

          {passo === 4 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Modelo de workflow</span>
                <select value={form.workflow_id} onChange={(e) => setCampo("workflow_id", e.target.value)} className={`mt-1 ${CAMPO}`}>
                  <option value="">Fluxo livre (sem etapas fixas)</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome}{w.qtd_etapas ? ` (${w.qtd_etapas} etapas)` : ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-400">
                  O fluxo escolhido cria as etapas e tarefas-modelo automaticamente. Sem ele, a
                  demanda segue em fluxo livre (§19).
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.rascunho} onChange={(e) => setCampo("rascunho", e.target.checked)} className="h-4 w-4" />
                Salvar como rascunho (não aparece nas listas operacionais)
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-800">{form.titulo || "Sem título"}</p>
                <p className="mt-1 text-slate-500">
                  {form.origem
                    ? ORIGENS.find(([v]) => v === form.origem)?.[1]
                    : "Origem não informada"}
                  {form.prazo_final ? ` · prazo ${form.prazo_final}` : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-6">
          <button
            type="button"
            onClick={() => setPasso((p) => Math.max(0, p - 1))}
            disabled={passo === 0}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void criar(true)}
              disabled={!podeCriar || salvando}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-40"
              title="Cria agora com o título e o essencial; o resto pode ser preenchido depois"
            >
              <Zap className="h-4 w-4" /> Criar rápido
            </button>
            {passo < PASSOS.length - 1 ? (
              <button
                type="button"
                onClick={() => setPasso((p) => Math.min(PASSOS.length - 1, p + 1))}
                disabled={!podeCriar}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void criar(false)}
                disabled={!podeCriar || salvando}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Criar demanda
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
