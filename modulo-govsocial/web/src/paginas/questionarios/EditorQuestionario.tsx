import { useCallback, useEffect, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Type, AlignLeft, ListChecks, CheckSquare,
  CalendarDays, Hash, SlidersHorizontal, ToggleLeft, Paperclip,
  GripVertical, Trash2, ArrowLeft, Save, Eye, Plus, X,
} from "lucide-react";
import { servicoQuestionarios, type QuestionarioOut } from "@/nucleo/api/servicosFase2";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { avisar } from "@/ui/Toast";
import { Botao } from "@/ui/Botao";
import { ErroApi } from "@/nucleo/http/problemDetails";

type ItemTipo = {
  tipo: string;
  rotulo: string;
  icone: typeof Type;
  opcoesPadrao?: Record<string, unknown>;
};

const TIPOS_QUESTAO: ItemTipo[] = [
  { tipo: "TEXTO", rotulo: "Texto curto", icone: Type, opcoesPadrao: { variant: "curto" } },
  { tipo: "TEXTO", rotulo: "Texto longo", icone: AlignLeft, opcoesPadrao: { variant: "longo" } },
  { tipo: "SELECAO_UNICA", rotulo: "Múltipla escolha", icone: ListChecks },
  { tipo: "SELECAO_MULTIPLA", rotulo: "Caixa de seleção", icone: CheckSquare },
  { tipo: "DATA", rotulo: "Data", icone: CalendarDays },
  { tipo: "NUMERO", rotulo: "Número", icone: Hash },
  { tipo: "SELECAO_UNICA", rotulo: "Escala (1-5)", icone: SlidersHorizontal, opcoesPadrao: { tipo: "escala", opcoes: ["1", "2", "3", "4", "5"] } },
  { tipo: "SELECAO_UNICA", rotulo: "Sim/Não", icone: ToggleLeft, opcoesPadrao: { tipo: "booleano", opcoes: ["Sim", "Não"] } },
  { tipo: "ANEXO", rotulo: "Upload de arquivo", icone: Paperclip },
];

interface QuestaoEditor {
  idTemp: string;
  enunciado: string;
  tipo: string;
  tipoLabel: string;
  obrigatorio: boolean;
  opcoes: Record<string, unknown> | null;
  opcoesArray: string[];
}

function questaoParaEditor(q: NonNullable<QuestionarioOut["questoes"]>[number]): QuestaoEditor {
  const arr: string[] = (q.opcoes && Array.isArray((q.opcoes as Record<string,unknown>).opcoes)
    ? (q.opcoes as Record<string,unknown>).opcoes as string[]
    : []);
  const tipoLabel = extrairLabel(q.tipo, q.opcoes);
  return {
    idTemp: crypto.randomUUID(),
    enunciado: q.enunciado,
    tipo: q.tipo,
    tipoLabel,
    obrigatorio: q.obrigatorio,
    opcoes: q.opcoes as Record<string,unknown> | null,
    opcoesArray: arr,
  };
}

function extrairLabel(tipo: string, opcoes: unknown): string {
  const found = TIPOS_QUESTAO.find(t => {
    if (t.tipo !== tipo) return false;
    if (!t.opcoesPadrao && !opcoes) return true;
    if (t.opcoesPadrao && opcoes && typeof opcoes === "object") {
      const o = opcoes as Record<string,unknown>;
      const p = t.opcoesPadrao as Record<string,unknown>;
      if (p.tipo && o.tipo === p.tipo) return true;
      if (p.variant && o.variant === p.variant) return true;
    }
    if (!t.opcoesPadrao && !opcoes) return true;
    return false;
  });
  return found?.rotulo ?? (tipo === "TEXTO" ? "Texto curto" : tipo);
}

function questaoToPayload(q: QuestaoEditor) {
  return {
    ordem: 0,
    enunciado: q.enunciado,
    tipo: q.tipo,
    obrigatorio: q.obrigatorio,
    opcoes: q.opcoesArray.length > 0
      ? { ...q.opcoes, opcoes: q.opcoesArray }
      : q.opcoes,
  };
}

export default function EditorQuestionario() {
  const { id } = useParams<{ id: string }>();
  const ehNovo = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [questoes, setQuestoes] = useState<QuestaoEditor[]>([]);
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [arrastandoIdx, setArrastandoIdx] = useState<number | null>(null);
  const [sobreIdx, setSobreIdx] = useState<number | null>(null);
  const [inicializado, setInicializado] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["questionarios", id],
    queryFn: () => servicoQuestionarios.obter(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (!inicializado && data && id) {
      setNome(data.nome);
      setDescricao(data.descricao ?? "");
      setQuestoes(data.questoes.map(questaoParaEditor));
      setInicializado(true);
    }
  }, [data, id, inicializado]);

  const salvarMut = useMutation({
    mutationFn: async () => {
      const corpo = {
        nome,
        descricao: descricao || null,
        questoes: questoes.map(questaoToPayload),
      };
      if (ehNovo) {
        return servicoQuestionarios.criar(corpo);
      }
      return servicoQuestionarios.atualizar(id!, corpo);
    },
    onSuccess: () => {
      avisar.sucesso(ehNovo ? "Questionário criado" : "Questionário salvo");
      qc.invalidateQueries({ queryKey: ["questionarios"] });
      navigate("/questionarios");
    },
    onError: () => avisar.erro("Erro ao salvar questionário"),
  });

  function validar(): boolean {
    if (!nome.trim()) { avisar.erro("Informe o nome do questionário"); return false; }
    if (questoes.length === 0) { avisar.erro("Adicione pelo menos uma questão"); return false; }
    for (const q of questoes) {
      if (!q.enunciado.trim()) { avisar.erro("Todas as questões precisam de enunciado"); return false; }
      if ((q.tipo === "SELECAO_UNICA" || q.tipo === "SELECAO_MULTIPLA") && q.opcoesArray.length < 2) {
        avisar.erro(`"${q.enunciado}" precisa de pelo menos 2 opções`); return false;
      }
    }
    return true;
  }

  const adicionarQuestao = useCallback((tipoIdx: number) => {
    const item = TIPOS_QUESTAO[tipoIdx];
    const nova: QuestaoEditor = {
      idTemp: crypto.randomUUID(),
      enunciado: "",
      tipo: item.tipo,
      tipoLabel: item.rotulo,
      obrigatorio: false,
      opcoes: item.opcoesPadrao ?? null,
      opcoesArray: (item.opcoesPadrao?.opcoes as string[]) ?? [],
    };
    setQuestoes(prev => [...prev, nova]);
    setEditandoIdx(questoes.length);
  }, [questoes.length]);

  function removerQuestao(idx: number) {
    setQuestoes(prev => prev.filter((_, i) => i !== idx));
    if (editandoIdx === idx) setEditandoIdx(null);
    else if (editandoIdx !== null && editandoIdx > idx) setEditandoIdx(editandoIdx - 1);
  }

  function moverQuestao(de: number, para: number) {
    if (de === para) return;
    setQuestoes(prev => {
      const cp = [...prev];
      const [item] = cp.splice(de, 1);
      cp.splice(para, 0, item);
      return cp;
    });
  }

  function onDragInicioTipo(e: DragEvent, tipoIdx: number) {
    e.dataTransfer.setData("application/tipo-questao", String(tipoIdx));
    e.dataTransfer.effectAllowed = "copy";
  }

  function onArrastarSobre(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onSoltarTipo(e: DragEvent) {
    e.preventDefault();
    const tipoIdx = e.dataTransfer.getData("application/tipo-questao");
    if (tipoIdx) adicionarQuestao(Number(tipoIdx));
  }

  function onDragInicioQuestao(e: DragEvent, idx: number) {
    setArrastandoIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/indice-questao", String(idx));
  }

  function onDragFimQuestao() {
    setArrastandoIdx(null);
    setSobreIdx(null);
  }

  function onArrastarSobreQuestao(e: DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (arrastandoIdx !== null && arrastandoIdx !== idx) {
      setSobreIdx(idx);
    }
  }

  function onSoltarQuestao(e: DragEvent) {
    e.preventDefault();
    const deStr = e.dataTransfer.getData("application/indice-questao");
    const tipoStr = e.dataTransfer.getData("application/tipo-questao");
    if (deStr) {
      const de = Number(deStr);
      const para = sobreIdx ?? de;
      moverQuestao(de, para);
    } else if (tipoStr) {
      adicionarQuestao(Number(tipoStr));
    }
    setArrastandoIdx(null);
    setSobreIdx(null);
  }

  function atualizarEnunciado(idx: number, val: string) {
    setQuestoes(prev => prev.map((q, i) => i === idx ? { ...q, enunciado: val } : q));
  }

  function toggleObrigatorio(idx: number) {
    setQuestoes(prev => prev.map((q, i) => i === idx ? { ...q, obrigatorio: !q.obrigatorio } : q));
  }

  function adicionarOpcao(idx: number) {
    setQuestoes(prev => prev.map((q, i) =>
      i === idx ? { ...q, opcoesArray: [...q.opcoesArray, ""] } : q));
  }

  function atualizarOpcao(idx: number, opcIdx: number, val: string) {
    setQuestoes(prev => prev.map((q, i) =>
      i === idx ? { ...q, opcoesArray: q.opcoesArray.map((o, j) => j === opcIdx ? val : o) } : q));
  }

  function removerOpcao(idx: number, opcIdx: number) {
    setQuestoes(prev => prev.map((q, i) =>
      i === idx ? { ...q, opcoesArray: q.opcoesArray.filter((_, j) => j !== opcIdx) } : q));
  }

  // ─── RENDER STATES ──────────────────────────────────
  if (!!id && isLoading) return <Skeleton variante="cartao" />;
  if (!!id && isError) return <EstadoErro problema={(error as ErroApi)?.problema} aoTentarNovamente={() => qc.invalidateQueries({ queryKey: ["questionarios", id] })} />;
  if (!!id && !data) return <EstadoVazio titulo="Questionário não encontrado" />;

  const temOpcoes = (q: QuestaoEditor) => q.tipo === "SELECAO_UNICA" || q.tipo === "SELECAO_MULTIPLA";
  const salvando = salvarMut.isPending;

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">
      {/* CABEÇALHO */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate("/questionarios")} className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink transition-colors" aria-label="Voltar">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <h1 className="text-lg font-bold flex items-center gap-2 flex-1">
          <ClipboardList className="w-5 h-5 text-primary" />
          {ehNovo ? "Novo Questionário" : "Editar Questionário"}
        </h1>
        <Botao
          variante="primario"
          tamanho="sm"
          iconeInicio={<Save className="w-4 h-4" />}
          carregando={salvando}
          bloqueiaDuploSubmit
          onClick={() => { if (validar()) salvarMut.mutate(); }}
        >
          Salvar
        </Botao>
      </div>

      {/* METADADOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Nome do questionário *"
          className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface-container-lowest text-ink placeholder:text-ink-soft focus-visible:outline-focus"
        />
        <input
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Descrição (opcional)"
          className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface-container-lowest text-ink placeholder:text-ink-soft focus-visible:outline-focus"
        />
      </div>

      {/* CORPO: 2 COLUNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[600px]">
        {/* COLUNA ESQUERDA: PALETA + CONSTRUTOR */}
        <div className="space-y-4">
          {/* Paleta de tipos */}
          <div className="rounded-cartao border border-outline-variant bg-surface p-3">
            <h3 className="text-sm font-semibold text-ink-soft mb-2">Tipos de Questão</h3>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS_QUESTAO.map((item, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={(e) => onDragInicioTipo(e, idx)}
                  className="flex flex-col items-center gap-1 p-2 rounded-input border border-outline-variant bg-surface-container-lowest cursor-grab active:cursor-grabbing hover:border-primary hover:bg-primary-soft/30 transition-colors text-center select-none"
                  title={`Arraste para adicionar: ${item.rotulo}`}
                >
                  <item.icone className="w-5 h-5 text-ink-soft" />
                  <span className="text-xs leading-tight text-ink">{item.rotulo}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Área de construção */}
          <div
            className="rounded-cartao border-2 border-dashed border-outline-variant bg-surface p-3 min-h-[400px] flex flex-col gap-2"
            onDragOver={onArrastarSobre}
            onDrop={onSoltarTipo}
          >
            <h3 className="text-sm font-semibold text-ink-soft mb-1">Questões ({questoes.length})</h3>

            {questoes.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-ink-soft text-center">
                  Arraste tipos de questão da paleta para cá<br />ou clique duas vezes para adicionar
                </p>
              </div>
            )}

            {questoes.map((q, idx) => (
              <div
                key={q.idTemp}
                draggable
                onDragStart={(e) => onDragInicioQuestao(e, idx)}
                onDragEnd={onDragFimQuestao}
                onDragOver={(e) => onArrastarSobreQuestao(e, idx)}
                onDrop={onSoltarQuestao}
                className={`rounded-cartao border bg-surface-container-lowest transition-all ${
                  arrastandoIdx === idx ? "opacity-40" : ""
                } ${sobreIdx === idx ? "border-primary border-2" : "border-outline-variant"}`}
              >
                {/* Barra de título da questão */}
                <div
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => setEditandoIdx(editandoIdx === idx ? null : idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditandoIdx(editandoIdx === idx ? null : idx);
                    }
                  }}
                >
                  <GripVertical className="w-4 h-4 text-ink-soft cursor-grab active:cursor-grabbing shrink-0" />
                  <span className="text-xs bg-primary-soft text-primary px-1.5 py-0.5 rounded font-semibold shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm truncate text-ink">
                    {q.enunciado || "(sem enunciado)"}
                  </span>
                  <span className="text-xs text-ink-soft shrink-0">{q.tipoLabel}</span>
                  {q.obrigatorio && (
                    <span className="text-xs text-danger font-semibold shrink-0">*</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removerQuestao(idx); }}
                    className="text-ink-soft hover:text-danger transition-colors shrink-0"
                    aria-label={`Remover questão ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Painel de edição expandido */}
                {editandoIdx === idx && (
                  <div className="px-3 pb-3 pt-0 space-y-3 border-t border-outline-variant">
                    <textarea
                      value={q.enunciado}
                      onChange={e => atualizarEnunciado(idx, e.target.value)}
                      placeholder="Escreva o enunciado da questão..."
                      className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface text-ink placeholder:text-ink-soft focus-visible:outline-focus resize-y min-h-[60px] mt-3"
                      rows={2}
                    />

                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.obrigatorio}
                        onChange={() => toggleObrigatorio(idx)}
                        className="rounded accent-primary"
                      />
                      Obrigatório
                    </label>

                    {temOpcoes(q) && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-ink-soft">Opções de resposta</p>
                        {q.opcoesArray.map((opc, opcIdx) => (
                          <div key={opcIdx} className="flex items-center gap-2">
                            <input
                              value={opc}
                              onChange={e => atualizarOpcao(idx, opcIdx, e.target.value)}
                              placeholder={`Opção ${opcIdx + 1}`}
                              className="flex-1 border border-outline-variant rounded-input px-3 py-1.5 text-sm bg-surface text-ink placeholder:text-ink-soft focus-visible:outline-focus"
                            />
                            <button
                              onClick={() => removerOpcao(idx, opcIdx)}
                              className="text-ink-soft hover:text-danger transition-colors shrink-0"
                              aria-label="Remover opção"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => adicionarOpcao(idx)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Plus className="w-3 h-3" /> Adicionar opção
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* COLUNA DIREITA: PRÉ-VISUALIZAÇÃO */}
        <div className="rounded-cartao border border-outline-variant bg-surface p-4 sticky top-4 self-start">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-ink-soft" />
            <h3 className="text-sm font-semibold text-ink-soft">Pré-visualização</h3>
          </div>

          <div className="space-y-1">
            <div className="text-lg font-bold text-ink">{nome || "(sem título)"}</div>
            {descricao && <p className="text-sm text-ink-soft mb-3">{descricao}</p>}
          </div>

          {questoes.length === 0 && (
            <p className="text-sm text-ink-soft text-center py-8">
              Adicione questões para ver a pré-visualização
            </p>
          )}

          <div className="space-y-5">
            {questoes.map((q, idx) => (
              <div key={q.idTemp} className="space-y-1.5">
                <label className="block text-sm font-semibold text-ink">
                  {idx + 1}. {q.enunciado || "(sem enunciado)"}
                  {q.obrigatorio && <span className="text-danger ml-0.5">*</span>}
                </label>

                {/* TEXTO curto */}
                {q.tipo === "TEXTO" && (!q.opcoes || (q.opcoes as Record<string,unknown>).variant !== "longo") && (
                  <input disabled className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface-container-low text-ink-soft" placeholder="Resposta curta" />
                )}

                {/* TEXTO longo */}
                {q.tipo === "TEXTO" && q.opcoes && (q.opcoes as Record<string,unknown>).variant === "longo" && (
                  <textarea disabled className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface-container-low text-ink-soft resize-none" rows={3} placeholder="Resposta longa" />
                )}

                {/* SELECAO_UNICA */}
                {q.tipo === "SELECAO_UNICA" && (
                  <div className="space-y-1.5">
                    {q.opcoesArray.length > 0 ? q.opcoesArray.map((opc, oi) => (
                      <label key={oi} className="flex items-center gap-2 text-sm text-ink">
                        <input type="radio" disabled name={`preview-${q.idTemp}`} className="accent-primary" />
                        {opc}
                      </label>
                    )) : (
                      <p className="text-xs text-ink-soft">Sem opções definidas</p>
                    )}
                  </div>
                )}

                {/* SELECAO_MULTIPLA */}
                {q.tipo === "SELECAO_MULTIPLA" && (
                  <div className="space-y-1.5">
                    {q.opcoesArray.length > 0 ? q.opcoesArray.map((opc, oi) => (
                      <label key={oi} className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" disabled className="rounded accent-primary" />
                        {opc}
                      </label>
                    )) : (
                      <p className="text-xs text-ink-soft">Sem opções definidas</p>
                    )}
                  </div>
                )}

                {/* DATA */}
                {q.tipo === "DATA" && (
                  <input type="date" disabled className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface-container-low text-ink-soft" />
                )}

                {/* NUMERO */}
                {q.tipo === "NUMERO" && (
                  <input type="number" disabled className="w-full border border-outline-variant rounded-input px-3 py-2 text-sm bg-surface-container-low text-ink-soft" placeholder="0" />
                )}

                {/* ANEXO */}
                {q.tipo === "ANEXO" && (
                  <div className="border-2 border-dashed border-outline-variant rounded-cartao p-4 text-center text-sm text-ink-soft bg-surface-container-low">
                    <Paperclip className="w-5 h-5 mx-auto mb-1" />
                    Clique para enviar arquivo
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
