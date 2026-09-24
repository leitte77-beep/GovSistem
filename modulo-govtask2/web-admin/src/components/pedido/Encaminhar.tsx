"use client";

/**
 * Encaminhar a um setor — o gesto mais repetido do Assessor.
 *
 * Três decisões à vista (para onde, o que fazer, até quando), o resto em
 * "Mais opções". Setor em cartões com o prazo sugerido, modelos prontos que
 * preenchem o assunto e as instruções, prazo em botões com a data já
 * calculada, e um botão que diz exatamente o que vai acontecer.
 */

import clsx from "clsx";
import {
  Building2,
  Calculator,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Gavel,
  Landmark,
  Paperclip,
  Scale,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { EditorDetalhes } from "@/components/EditorDetalhes";
import { api, type Pedido, type Setor, type UsuarioResumo } from "@/lib/api";
import { tamanho } from "@/lib/formato";
import { iniciais } from "@/lib/sessao";
import { useSetores } from "@/lib/setores";

import { BaseModal } from "./Modais";

const LIMITE_MB = 32;
const CHAVE_USO = "govtask_setores_usados";

const ICONE_SETOR: Record<string, LucideIcon> = {
  JURIDICO: Scale,
  CONTABILIDADE: Calculator,
  ENGENHARIA: Wrench,
  LICITACAO: Gavel,
  TESOURARIA: Wallet,
  GABINETE: Landmark,
  ASSESSORIA: Building2,
  COMPRAS: ShoppingCart,
};

/** O que cada setor mais recebe. Um clique preenche assunto e instruções. */
const MODELOS: Record<string, { assunto: string; instrucoes: string }[]> = {
  JURIDICO: [
    {
      assunto: "Elaborar ofício de solicitação",
      instrucoes:
        "Elaborar ofício formal endereçado ao órgão/parlamentar, com a justificativa do pedido. Devolver assinado em PDF.",
    },
    {
      assunto: "Emitir parecer jurídico",
      instrucoes: "Analisar a viabilidade legal e emitir parecer. Devolver o parecer em PDF.",
    },
    {
      assunto: "Elaborar minuta de convênio/termo",
      instrucoes: "Preparar a minuta do instrumento conforme o modelo do órgão concedente.",
    },
  ],
  CONTABILIDADE: [
    {
      assunto: "Emitir certidões negativas (CND)",
      instrucoes:
        "Emitir e anexar:\n- CND federal (Receita/PGFN)\n- CND estadual\n- CRF do FGTS\n- CNDT (trabalhista)",
    },
    {
      assunto: "Declaração de adimplência / CAUC",
      instrucoes: "Verificar a situação no CAUC e emitir a declaração de adimplência.",
    },
    {
      assunto: "Indicar dotação orçamentária",
      instrucoes: "Informar a dotação orçamentária e a disponibilidade para a despesa.",
    },
  ],
  ENGENHARIA: [
    { assunto: "Projeto básico e orçamento", instrucoes: "Elaborar projeto básico, memorial descritivo e planilha orçamentária." },
    { assunto: "Vistoria técnica", instrucoes: "Realizar vistoria no local e anexar relatório com fotos." },
    { assunto: "Medição da obra", instrucoes: "Registrar a medição do período com percentual executado e fotos." },
  ],
  LICITACAO: [
    { assunto: "Abrir processo licitatório", instrucoes: "Instruir e publicar o processo de contratação." },
    { assunto: "Cotação de preços", instrucoes: "Levantar ao menos três cotações e anexar o mapa comparativo." },
  ],
  TESOURARIA: [
    { assunto: "Efetuar pagamento", instrucoes: "Efetuar o pagamento e anexar o comprovante." },
  ],
  GABINETE: [
    { assunto: "Colher assinatura do Prefeito", instrucoes: "Levar o documento anexo para assinatura e devolver digitalizado." },
  ],
};

function somarDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  const dt = new Date(Number(a), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function lerUso(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_USO) || "{}");
  } catch {
    return {};
  }
}

function registrarUso(setor: string) {
  try {
    const uso = lerUso();
    uso[setor] = (uso[setor] || 0) + 1;
    localStorage.setItem(CHAVE_USO, JSON.stringify(uso));
  } catch {
    /* sem storage: só perde a ordenação por uso */
  }
}

export function ModalEncaminhar({
  pedido,
  usuarios,
  aoFechar,
  aoAtualizar,
}: {
  pedido: Pedido;
  usuarios: UsuarioResumo[];
  aoFechar: () => void;
  aoAtualizar: (p: Pedido) => void;
}) {
  const { setores } = useSetores();
  const [setor, setSetor] = useState<Setor | null>(null);
  const [assunto, setAssunto] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [prazo, setPrazo] = useState<{ modo: "sugerido" | number | "outra"; data: string }>({
    modo: "sugerido",
    data: "",
  });
  const [responsavel, setResponsavel] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Os setores que este Assessor mais usa primeiro; o órgão externo por
  // último (esperar o governo tem botão próprio).
  const ordenados = useMemo(() => {
    const uso = lerUso();
    return setores
      .filter((s) => s.ativo && s.codigo !== "EXTERNO")
      .sort((a, b) => (uso[b.codigo] || 0) - (uso[a.codigo] || 0));
  }, [setores]);

  const doSetor = usuarios.filter((u) => u.setor === setor?.codigo);
  const modelos = setor ? MODELOS[setor.codigo] ?? [] : [];
  const dataFinal =
    prazo.modo === "sugerido"
      ? setor
        ? somarDias(setor.prazo_sugerido_dias)
        : ""
      : prazo.modo === "outra"
        ? prazo.data
        : somarDias(prazo.modo);
  const nomeResponsavel = doSetor.find((u) => u.id === responsavel)?.name;

  const falta = !setor
    ? "Escolha o setor"
    : assunto.trim().length < 3
      ? "Diga o que o setor deve fazer"
      : prazo.modo === "outra" && !prazo.data
        ? "Escolha a data do prazo"
        : null;

  function escolherSetor(s: Setor) {
    setSetor(s);
    setResponsavel("");
    // Trocar de setor com um modelo do setor anterior preenchido confunde.
    const eraModelo = Object.values(MODELOS)
      .flat()
      .some((m) => m.assunto === assunto);
    if (eraModelo) {
      setAssunto("");
      setInstrucoes("");
    }
  }

  function aplicarModelo(m: { assunto: string; instrucoes: string }) {
    setAssunto(m.assunto);
    setInstrucoes(m.instrucoes);
  }

  function escolherArquivos(lista: FileList | File[] | null) {
    const escolhidos = Array.from(lista ?? []);
    const grandes = escolhidos.filter((f) => f.size > LIMITE_MB * 1024 * 1024);
    if (grandes.length > 0) {
      toast.error(`Arquivo acima de ${LIMITE_MB} MB: ${grandes.map((f) => f.name).join(", ")}`);
    }
    setArquivos((atuais) => [...atuais, ...escolhidos.filter((f) => f.size <= LIMITE_MB * 1024 * 1024)]);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  async function enviar() {
    if (!setor || falta) return;
    setOcupado(true);
    try {
      let atualizado = await api.encaminhar(pedido.id, {
        setor: setor.codigo,
        assunto: assunto.trim(),
        instrucoes: instrucoes.trim() || null,
        prazo: dataFinal || null,
        responsavel_id: responsavel || null,
        // Linhas "- item" das instruções viram o checklist de entregas.
        checklist: instrucoes
          .split("\n")
          .map((l) => l.match(/^\s*[-*]\s+(.+)/)?.[1]?.trim())
          .filter((l): l is string => Boolean(l)),
      });
      registrarUso(setor.codigo);
      const encId = atualizado.encaminhamento_atual?.id;
      const falhas: string[] = [];
      for (const arquivo of arquivos) {
        if (!encId) {
          falhas.push(arquivo.name);
          continue;
        }
        try {
          atualizado = await api.anexar(pedido.id, arquivo, {
            encaminhamentoId: encId,
            categoria: "DOCUMENTO",
          });
        } catch {
          falhas.push(arquivo.name);
        }
      }
      aoAtualizar(atualizado);
      if (falhas.length > 0) {
        toast.error(`Encaminhado, mas falhou o envio de: ${falhas.join(", ")}`);
      } else {
        toast.success(`Encaminhado para ${setor.nome}.`);
      }
      aoFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao encaminhar.");
      setOcupado(false);
    }
  }

  const resumo = setor ? (
    <p className="text-xs leading-snug text-ink-muted">
      Vai para{" "}
      <strong className="font-medium text-ink">
        {nomeResponsavel ? `${nomeResponsavel} (${setor.nome})` : `a fila de ${setor.nome}`}
      </strong>
      {dataFinal && (
        <>
          {" · prazo "}
          <strong className="font-medium text-ink">{dataCurta(dataFinal)}</strong>
        </>
      )}
      {arquivos.length > 0 && ` · ${arquivos.length} anexo${arquivos.length > 1 ? "s" : ""}`}
    </p>
  ) : (
    <p className="text-xs text-ink-faint">{falta}</p>
  );

  return (
    <BaseModal
      largo
      titulo="Encaminhar a um setor"
      subtitulo={`${pedido.numero} · ${pedido.titulo}`}
      aoFechar={aoFechar}
      aoConfirmar={enviar}
      confirmar={falta && setor ? falta : setor ? `Encaminhar para ${setor.nome}` : "Encaminhar"}
      ocupado={ocupado}
      desabilitado={Boolean(falta)}
      rodape={resumo}
    >
      {/* 1. Para onde */}
      <section>
        <p className="rotulo">
          <Passo n={1} feito={Boolean(setor)} /> Para qual setor?
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ordenados.map((s) => {
            const Icone = ICONE_SETOR[s.codigo] ?? Building2;
            const ativo = setor?.codigo === s.codigo;
            return (
              <button
                key={s.codigo}
                type="button"
                onClick={() => escolherSetor(s)}
                aria-pressed={ativo}
                className={clsx(
                  "flex items-center gap-2.5 rounded-btn border px-3 py-2.5 text-left transition",
                  ativo
                    ? "border-brand bg-brand-50 shadow-brilho"
                    : "border-line bg-paper hover:border-line-strong hover:bg-canvas"
                )}
              >
                <span
                  className={clsx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    ativo ? "bg-brand text-white" : "bg-ink/[.05] text-ink-muted"
                  )}
                >
                  <Icone size={16} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className={clsx("block truncate text-sm font-medium", ativo ? "text-brand" : "text-ink")}>
                    {s.nome}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    ~{s.prazo_sugerido_dias} dias
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. O que fazer */}
      <section className={clsx("transition-opacity", !setor && "pointer-events-none opacity-40")}>
        <label className="rotulo" htmlFor="enc-assunto">
          <Passo n={2} feito={assunto.trim().length >= 3} /> O que o setor deve fazer?
        </label>
        {modelos.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {modelos.map((m) => (
              <button
                key={m.assunto}
                type="button"
                onClick={() => aplicarModelo(m)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-xs transition",
                  assunto === m.assunto
                    ? "border-brand bg-brand-50 text-brand"
                    : "border-line text-ink-soft hover:border-brand hover:text-brand"
                )}
              >
                <Sparkles size={11} aria-hidden />
                {m.assunto}
              </button>
            ))}
          </div>
        )}
        <input
          id="enc-assunto"
          className="campo"
          placeholder={modelos.length ? "Escolha um modelo acima ou escreva" : "Ex.: Elaborar ofício ao deputado"}
          value={assunto}
          maxLength={160}
          onChange={(e) => setAssunto(e.target.value)}
        />
        {instrucoes && !maisOpcoes && (
          <button
            type="button"
            onClick={() => setMaisOpcoes(true)}
            className="mt-1.5 text-xs text-brand hover:underline"
          >
            Instruções preenchidas pelo modelo — ver ou editar
          </button>
        )}
      </section>

      {/* 3. Até quando */}
      <section className={clsx("transition-opacity", !setor && "pointer-events-none opacity-40")}>
        <p className="rotulo">
          <Passo n={3} feito={Boolean(dataFinal)} /> Até quando?
        </p>
        <div className="flex flex-wrap gap-1.5">
          <OpcaoPrazo
            ativo={prazo.modo === "sugerido"}
            onClick={() => setPrazo({ modo: "sugerido", data: "" })}
            titulo="Sugerido"
            detalhe={setor ? `${dataCurta(somarDias(setor.prazo_sugerido_dias))} · ${setor.prazo_sugerido_dias}d` : "—"}
          />
          {[3, 7, 15, 30]
            .filter((d) => d !== setor?.prazo_sugerido_dias)
            .map((d) => (
              <OpcaoPrazo
                key={d}
                ativo={prazo.modo === d}
                onClick={() => setPrazo({ modo: d, data: "" })}
                titulo={`${d} dias`}
                detalhe={dataCurta(somarDias(d))}
              />
            ))}
          <OpcaoPrazo
            ativo={prazo.modo === "outra"}
            onClick={() => setPrazo({ modo: "outra", data: prazo.data })}
            titulo="Outra data"
            detalhe={prazo.modo === "outra" && prazo.data ? dataCurta(prazo.data) : "escolher"}
          />
        </div>
        {prazo.modo === "outra" && (
          <input
            type="date"
            className="campo mt-2 sm:max-w-[12rem]"
            min={new Date().toISOString().slice(0, 10)}
            value={prazo.data}
            onChange={(e) => setPrazo({ modo: "outra", data: e.target.value })}
            autoFocus
          />
        )}
      </section>

      {/* Anexos: sempre à vista, porque o setor quase sempre precisa de um */}
      <section className={clsx("transition-opacity", !setor && "pointer-events-none opacity-40")}>
        <p className="rotulo">Documentos para o setor (opcional)</p>
        <input
          ref={arquivoRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => escolherArquivos(e.target.files)}
          tabIndex={-1}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => escolherArquivos(e.target.files)}
          tabIndex={-1}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            escolherArquivos(e.dataTransfer.files);
          }}
          className={clsx(
            "flex flex-wrap items-center justify-center gap-2 rounded-btn border border-dashed px-4 py-4 text-center text-sm transition",
            arrastando ? "border-brand bg-brand-50 text-brand" : "border-line-strong text-ink-muted"
          )}
        >
          <Upload size={16} aria-hidden />
          <span className="hidden sm:inline">Arraste os arquivos aqui ou</span>
          <button type="button" onClick={() => arquivoRef.current?.click()} className="font-medium text-brand hover:underline">
            <Paperclip size={14} className="mr-1 inline" aria-hidden />
            escolher arquivos
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="font-medium text-brand hover:underline sm:hidden"
          >
            <Camera size={14} className="mr-1 inline" aria-hidden />
            tirar foto
          </button>
        </div>
        {arquivos.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {arquivos.map((arquivo, indice) => (
              <li
                key={`${arquivo.name}-${indice}`}
                className="flex items-center gap-2 rounded-btn border border-line bg-paper px-3 py-2 text-sm"
              >
                <FileText size={15} className="shrink-0 text-ink-faint" aria-hidden />
                <span className="truncate font-medium text-ink">{arquivo.name}</span>
                <span className="shrink-0 text-xs text-ink-faint">{tamanho(arquivo.size)}</span>
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-ink-muted hover:bg-canvas hover:text-estado-atrasado"
                  aria-label={`Remover ${arquivo.name}`}
                  onClick={() => setArquivos((atuais) => atuais.filter((_, i) => i !== indice))}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mais opções */}
      <section className={clsx("rounded-btn border border-line", !setor && "pointer-events-none opacity-40")}>
        <button
          type="button"
          onClick={() => setMaisOpcoes((m) => !m)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm text-ink-soft"
          aria-expanded={maisOpcoes}
        >
          <span>
            Mais opções
            <span className="ml-1.5 text-xs text-ink-faint">instruções detalhadas · entregar a uma pessoa</span>
          </span>
          <ChevronDown size={16} className={clsx("transition", maisOpcoes && "rotate-180")} aria-hidden />
        </button>
        {maisOpcoes && (
          <div className="space-y-4 border-t border-line px-3.5 py-3.5">
            <div>
              <label className="rotulo" htmlFor="enc-instr">
                Instruções detalhadas
              </label>
              <EditorDetalhes
                id="enc-instr"
                valor={instrucoes}
                aoMudar={setInstrucoes}
                maxLength={8000}
                placeholder="O que o setor precisa fazer, com detalhes."
              />
            </div>
            <div>
              <p className="rotulo">Quem vai fazer?</p>
              <div className="flex flex-wrap gap-1.5">
                <Pessoa ativo={!responsavel} onClick={() => setResponsavel("")} nome="Fila do setor" sub="o primeiro que assumir" />
                {doSetor.map((u) => (
                  <Pessoa
                    key={u.id}
                    ativo={responsavel === u.id}
                    onClick={() => setResponsavel(u.id)}
                    nome={u.name}
                    iniciais={iniciais(u.name)}
                  />
                ))}
              </div>
              {setor && doSetor.length === 0 && (
                <p className="mt-1.5 legenda">Ninguém lotado em {setor.nome} ainda — vai para a fila.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </BaseModal>
  );
}

function Passo({ n, feito }: { n: number; feito: boolean }) {
  return (
    <span
      className={clsx(
        "mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full align-[-3px] text-[11px] font-semibold",
        feito ? "bg-estado-concluido text-white" : "bg-ink/[.07] text-ink-muted"
      )}
    >
      {feito ? <Check size={12} aria-hidden /> : n}
    </span>
  );
}

function OpcaoPrazo({
  ativo,
  onClick,
  titulo,
  detalhe,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  detalhe: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={clsx(
        "rounded-btn border px-3 py-1.5 text-left transition",
        ativo ? "border-brand bg-brand-50" : "border-line hover:border-line-strong"
      )}
    >
      <span className={clsx("block text-sm font-medium", ativo ? "text-brand" : "text-ink")}>{titulo}</span>
      <span className="block text-[11px] capitalize text-ink-faint">{detalhe}</span>
    </button>
  );
}

function Pessoa({
  ativo,
  onClick,
  nome,
  sub,
  iniciais: ini,
}: {
  ativo: boolean;
  onClick: () => void;
  nome: string;
  sub?: string;
  iniciais?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={clsx(
        "flex items-center gap-2 rounded-pill border py-1 pl-1 pr-3 text-left transition",
        ativo ? "border-brand bg-brand-50" : "border-line hover:border-line-strong"
      )}
    >
      <span
        className={clsx(
          "grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold",
          ativo ? "bg-brand text-white" : "bg-ink/[.07] text-ink-muted"
        )}
      >
        {ini ?? <Building2 size={13} aria-hidden />}
      </span>
      <span>
        <span className={clsx("block text-xs font-medium", ativo ? "text-brand" : "text-ink")}>{nome}</span>
        {sub && <span className="block text-[10px] text-ink-faint">{sub}</span>}
      </span>
    </button>
  );
}
