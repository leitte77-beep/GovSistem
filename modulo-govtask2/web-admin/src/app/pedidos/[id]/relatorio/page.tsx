"use client";

/**
 * Relatório do pedido. Uma página para imprimir e arquivar: identificação,
 * participantes, protocolo, financeiro, a tramitação com documentos e
 * medições, e a timeline inteira. Nada aqui é editável.
 */

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  PauseCircle,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { CardConquista } from "@/components/CardConquista";
import { Markdown } from "@/components/Markdown";
import { api, type Eu, type Pedido } from "@/lib/api";
import {
  ROTULO_ENCAMINHAMENTO,
  ROTULO_MOTIVO_PARADA,
  ROTULO_ORIGEM,
  ROTULO_TIPO,
  data,
  dataHora,
  duracao,
  entre,
  haDias,
  hora,
  moeda,
  ondeEsta,
  tamanho,
} from "@/lib/formato";
import { useNomeSetor, useSetores } from "@/lib/setores";

type Secao = "financeiro" | "documentos" | "historico";

const ROTULO_SECAO: Record<Secao, string> = {
  financeiro: "Financeiro",
  documentos: "Documentos",
  historico: "Histórico completo",
};

const COR_SITUACAO: Record<string, string> = {
  COM_ASSESSOR: "bg-brand-50 text-brand-700",
  EM_SETOR: "bg-estado-andamento/10 text-estado-andamento",
  AGUARDANDO_TERCEIRO: "bg-estado-externo/10 text-estado-externo",
  CONCLUIDO: "bg-estado-concluido/10 text-estado-concluido",
  CANCELADO: "bg-estado-cancelado/10 text-estado-cancelado",
};

/** Só a primeira letra: o título é digitado livre e muitas vezes vem em minúscula. */
function capitular(texto: string) {
  return texto ? texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1) : texto;
}

/** Devolvida até o fim do dia do prazo conta como no prazo. */
function noPrazo(prazo: string | null, entregue: string | null): boolean | null {
  if (!prazo || !entregue) return null;
  const limite = new Date(`${prazo.slice(0, 10)}T23:59:59`);
  return new Date(entregue) <= limite;
}

export default function RelatorioDoPedido() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [eu, setEu] = useState<Eu | null>(null);
  const [secoes, setSecoes] = useState<Record<Secao, boolean>>({
    financeiro: true,
    documentos: true,
    historico: false,
  });
  const { nomes } = useSetores();
  const nomeSetor = useNomeSetor();

  useEffect(() => {
    api.obter(id).then(setPedido).catch((e) => setErro(e.message));
    api.eu().then(setEu).catch(() => setEu(null));
  }, [id]);

  const pessoas = useMemo(() => {
    const papeis = new Map<string, Set<string>>();
    const marcar = (nome: string | undefined, papel: string) => {
      if (!nome) return;
      if (!papeis.has(nome)) papeis.set(nome, new Set());
      papeis.get(nome)!.add(papel);
    };
    if (!pedido) return [] as { nome: string; papeis: string[] }[];
    marcar(pedido.criado_por?.name, "abriu");
    pedido.encaminhamentos.forEach((enc) => {
      marcar(enc.responsavel?.name, "responsável");
      enc.participantes.forEach((p) => marcar(p.name, "mencionado"));
    });
    return [...papeis].map(([nome, p]) => ({ nome, papeis: [...p] }));
  }, [pedido]);

  /** O histórico grava o nome do setor como estava na hora; normaliza pelo cadastro atual. */
  const normalizarSetores = useMemo(() => {
    const pares = Object.entries(nomes).flatMap(([codigo, nome]) => [
      [codigo, nome],
      [nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase(), nome],
    ]);
    return (texto: string) =>
      pares.reduce(
        (t, [de, para]) => (de.length > 2 ? t.replace(new RegExp(`\\b${de.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), para) : t),
        texto
      );
  }, [nomes]);

  const historicoPorDia = useMemo(() => {
    const grupos: { dia: string; eventos: Pedido["andamentos"] }[] = [];
    pedido?.andamentos.forEach((ev) => {
      const dia = data(ev.created_at);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.dia === dia) ultimo.eventos.push(ev);
      else grupos.push({ dia, eventos: [ev] });
    });
    return grupos;
  }, [pedido]);

  if (erro) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!pedido) return <p className="p-6 text-sm text-ink-muted">Carregando…</p>;

  const encerrado = ["CONCLUIDO", "CANCELADO"].includes(pedido.situacao);
  const encaminhamentos = [...pedido.encaminhamentos].sort((a, b) => a.ordem - b.ordem);
  const devolvidos = encaminhamentos.filter((e) => e.devolvido_em && e.prazo);
  const noPrazoQtd = devolvidos.filter((e) => noPrazo(e.prazo, e.devolvido_em)).length;
  const totalDocumentos =
    pedido.anexos.length ||
    encaminhamentos.reduce((n, e) => n + e.anexos.length, 0);
  const diasAberto = Math.max(
    0,
    Math.floor(
      ((pedido.concluido_em ? new Date(pedido.concluido_em).getTime() : Date.now()) -
        new Date(pedido.created_at).getTime()) /
        86400000
    )
  );
  const ind = pedido.indicadores;
  const protocolo = [
    pedido.protocolo_externo,
    pedido.protocolo_sistema,
    pedido.protocolo_orgao,
    pedido.protocolo_data ? data(pedido.protocolo_data) : null,
  ].filter(Boolean);
  const somenteTela = (s: Secao) => (secoes[s] ? "" : "print:hidden");

  return (
    <div className="animate-fade-subir space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/pedidos/${pedido.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand"
        >
          <ArrowLeft size={15} aria-hidden />
          Voltar ao pedido
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="botao-secundario cursor-pointer list-none">
              <SlidersHorizontal size={16} aria-hidden />
              O que entra no PDF
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-56 space-y-1 rounded-card border border-line bg-elevated p-3 shadow-pop">
              {(Object.keys(ROTULO_SECAO) as Secao[]).map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={secoes[s]}
                    onChange={(e) => setSecoes((v) => ({ ...v, [s]: e.target.checked }))}
                  />
                  {ROTULO_SECAO[s]}
                </label>
              ))}
            </div>
          </details>
          <button
            className="botao-secundario"
            onClick={() =>
              api
                .baixarPedidoXlsx(pedido.id, pedido.numero)
                .catch((e) => toast.error(e.message))
            }
          >
            <FileSpreadsheet size={16} aria-hidden />
            Excel
          </button>
          <button className="botao-primario" onClick={() => window.print()}>
            <Printer size={16} aria-hidden />
            Gerar PDF
          </button>
        </div>
      </div>

      <p className="hidden text-xs uppercase tracking-wide text-ink-muted print:block">
        GovTask · Relatório do pedido
      </p>

      <header className="border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="numero">{pedido.numero}</span>
          <span
            className={`rounded-pill px-2 py-0.5 text-xs font-medium ${
              COR_SITUACAO[pedido.situacao] ?? "bg-canvas text-ink-muted"
            }`}
          >
            {ondeEsta(pedido.situacao, pedido.setor_atual, nomeSetor)}
          </span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          {capitular(pedido.titulo)}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {ROTULO_TIPO[pedido.tipo] ?? pedido.tipo} · aberto em {data(pedido.created_at)} ·
          gerado em {dataHora(new Date().toISOString())}
        </p>
        {!encerrado && pedido.motivo_parada && (
          <div className="mt-3 flex items-start gap-2 rounded-card border border-estado-andamento/30 bg-estado-andamento/5 px-3 py-2 text-sm text-ink">
            <PauseCircle size={16} className="mt-0.5 shrink-0 text-estado-andamento" aria-hidden />
            <span>
              <strong className="font-medium">
                {ROTULO_MOTIVO_PARADA[pedido.motivo_parada]}
              </strong>
              {pedido.motivo_parada_texto ? ` — ${pedido.motivo_parada_texto}` : ""}
              {pedido.motivo_parada_em ? ` · desde ${data(pedido.motivo_parada_em)}` : ""}
            </span>
          </div>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo={encerrado ? "Duração" : "Dias em aberto"} valor={`${diasAberto}`} />
        <Numero rotulo="Envios a setores" valor={`${encaminhamentos.length}`} />
        <Numero
          rotulo="Tarefas no prazo"
          valor={devolvidos.length ? `${noPrazoQtd}/${devolvidos.length}` : "—"}
          alerta={noPrazoQtd < devolvidos.length}
        />
        <Numero rotulo="Documentos" valor={`${totalDocumentos}`} />
      </section>

      {ind && ind.horas_total > 0 && (
        <section className="cartao p-4">
          <h2 className="font-medium text-ink">Onde o tempo foi gasto</h2>
          <div className="mt-3 flex h-3 overflow-hidden rounded-pill bg-canvas">
            {[
              { h: ind.horas_com_assessor, cor: "bg-brand" },
              { h: ind.horas_nos_setores, cor: "bg-estado-andamento" },
              { h: ind.horas_aguardando_governo, cor: "bg-estado-externo" },
            ].map((f, i) => (
              <span
                key={i}
                className={f.cor}
                style={{ width: `${(f.h / ind.horas_total) * 100}%` }}
              />
            ))}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <Legenda cor="bg-brand" rotulo="Com o Assessor" valor={duracao(ind.horas_com_assessor)} />
            <Legenda cor="bg-estado-andamento" rotulo="Nos setores" valor={duracao(ind.horas_nos_setores)} />
            <Legenda cor="bg-estado-externo" rotulo="Órgão externo" valor={duracao(ind.horas_aguardando_governo)} />
          </dl>
          {Object.keys(ind.por_setor).length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-line pt-3">
              <p className="legenda">Tempo em cada setor</p>
              {Object.entries(ind.por_setor)
                .sort((a, b) => b[1] - a[1])
                .map(([setor, horas]) => (
                  <div key={setor} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 truncate text-ink-soft">{nomeSetor(setor)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-pill bg-canvas">
                      <span
                        className="block h-full bg-estado-andamento"
                        style={{ width: `${(horas / Math.max(...Object.values(ind.por_setor))) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right font-medium text-ink">{duracao(horas)}</span>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Bloco titulo="Identificação">
          <Linha rotulo="Origem" valor={ROTULO_ORIGEM[pedido.origem] ?? pedido.origem} />
          <Linha rotulo="Quem conseguiu" valor={pedido.origem_nome || "—"} />
          {pedido.emenda && <Linha rotulo="Emenda" valor={pedido.emenda} />}
          {pedido.situacao === "EM_SETOR" ? (
            <>
              <Linha rotulo="Tarefa atual" valor={pedido.tarefa_atual || "—"} />
              <Linha rotulo="Prazo atual" valor={data(pedido.prazo_atual)} />
            </>
          ) : null}
          {!encerrado && (
            <Linha
              rotulo={`${ondeEsta(pedido.situacao, pedido.setor_atual, nomeSetor)} desde`}
              valor={`${data(pedido.situacao_desde)} (${haDias(pedido.dias_na_situacao)})`}
            />
          )}
          {pedido.concluido_em && (
            <Linha rotulo="Concluído em" valor={dataHora(pedido.concluido_em)} />
          )}
        </Bloco>

        <section className={`cartao p-4 ${somenteTela("financeiro")}`}>
          <h2 className="font-medium text-ink">Financeiro</h2>
          <Financeiro pedido={pedido} />
        </section>
      </section>

      {protocolo.length > 0 && (
        <Bloco titulo="Protocolo">
          <Linha rotulo="Número" valor={pedido.protocolo_externo || "—"} />
          <Linha rotulo="Sistema" valor={pedido.protocolo_sistema || "—"} />
          <Linha rotulo="Órgão" valor={pedido.protocolo_orgao || "—"} />
          <Linha rotulo="Data" valor={data(pedido.protocolo_data)} />
        </Bloco>
      )}

      <CardConquista pedido={pedido} />

      <section className="cartao p-4">
        <h2 className="font-medium text-ink">Participantes</h2>
        {pessoas.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Sem participantes registrados.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {pessoas.map((p) => (
              <li key={p.nome} className="rounded-pill border border-line px-3 py-1 text-ink">
                {p.nome} <span className="text-ink-muted">· {p.papeis.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium text-ink">Tramitação</h2>
        {encaminhamentos.length === 0 && (
          <p className="text-sm text-ink-muted">Nenhum encaminhamento registrado.</p>
        )}
        {encaminhamentos.length > 0 && (
          <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            <li className="rounded-pill bg-brand-50 px-2 py-1 font-medium text-brand-700">Assessor</li>
            {encaminhamentos.map((enc) => (
              <li key={enc.id} className="flex items-center gap-1.5">
                <ArrowRight size={12} className="text-ink-faint" aria-hidden />
                <span className="rounded-pill bg-estado-andamento/10 px-2 py-1 font-medium text-estado-andamento">
                  {nomeSetor(enc.setor)} · {entre(enc.created_at, enc.devolvido_em) || "—"}
                </span>
                {enc.devolvido_em && (
                  <>
                    <ArrowRight size={12} className="text-ink-faint" aria-hidden />
                    <span className="rounded-pill bg-brand-50 px-2 py-1 font-medium text-brand-700">
                      Assessor
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
        {encaminhamentos.map((enc) => {
          const prazoOk = noPrazo(enc.prazo, enc.devolvido_em);
          return (
            <div key={enc.id} className="cartao break-inside-avoid p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-ink">
                  #{enc.ordem}. {enc.assunto}
                </h3>
                <span className="flex flex-wrap items-center gap-2">
                  {prazoOk !== null && (
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                        prazoOk
                          ? "bg-estado-concluido/10 text-estado-concluido"
                          : "bg-estado-atrasado/10 text-estado-atrasado"
                      }`}
                    >
                      {prazoOk ? "No prazo" : "Fora do prazo"}
                    </span>
                  )}
                  <span className="legenda">
                    {nomeSetor(enc.setor)} · {ROTULO_ENCAMINHAMENTO[enc.status] ?? enc.status}
                    {enc.prazo ? ` · prazo ${data(enc.prazo)}` : ""}
                    {enc.devolvido_em
                      ? ` · devolvido em ${data(enc.devolvido_em)} (levou ${entre(enc.created_at, enc.devolvido_em)})`
                      : ""}
                  </span>
                </span>
              </div>
              {enc.instrucoes && (
                <Markdown texto={enc.instrucoes} className="mt-1 space-y-1.5 text-sm text-ink-soft" />
              )}
              {enc.responsavel && (
                <p className="mt-1 text-sm text-ink-muted">
                  Responsável: {enc.responsavel.name}
                  {enc.participantes.length > 0
                    ? ` · com ${enc.participantes.map((p) => p.name).join(", ")}`
                    : ""}
                </p>
              )}
              {enc.complemento_pedido && (
                <p className="mt-1 text-sm text-ink-soft">Complemento pedido: {enc.complemento_pedido}</p>
              )}
              {enc.complemento_resposta && (
                <p className="mt-1 text-sm text-ink-soft">
                  Resposta do Assessor: {enc.complemento_resposta}
                </p>
              )}
              {enc.resultado && (
                <div className="mt-2 rounded-card bg-canvas px-3 py-2 text-sm text-ink-soft">
                  <span className="font-medium text-ink">Resultado: </span>
                  <Markdown texto={enc.resultado} className="inline space-y-1.5 [&>*:first-child]:inline" />
                </div>
              )}
              {enc.anexos.length > 0 && (
                <ul className={`mt-2 space-y-1 text-sm ${somenteTela("documentos")}`}>
                  {enc.anexos.map((anexo) => (
                    <li key={anexo.id}>
                      <button
                        type="button"
                        onClick={() =>
                          api.baixarAnexo(pedido.id, anexo).catch((e) => toast.error(e.message))
                        }
                        className="inline-flex items-center gap-1.5 text-left text-brand hover:underline print:text-ink-soft print:no-underline"
                      >
                        <FileText size={14} className="shrink-0" aria-hidden />
                        {anexo.nome_original}
                        {anexo.versao > 1 ? ` (v${anexo.versao})` : ""}
                      </button>
                      <span className="text-ink-muted">
                        {` · ${tamanho(anexo.tamanho_bytes)}`}
                        {anexo.enviado_por ? ` · ${anexo.enviado_por.name}` : ""}
                        {` · ${dataHora(anexo.created_at)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {pedido.tipo === "OBRA" && pedido.medicoes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-medium text-ink">Medições e fotos</h2>
          {pedido.medicoes.map((m) => (
            <div key={m.id} className="cartao break-inside-avoid p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-ink">Medição {m.numero}</h3>
                <span className="legenda">
                  {m.responsavel ? m.responsavel.name : "—"} · {dataHora(m.created_at)}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                Período: {data(m.periodo_inicio)} – {data(m.periodo_fim)} · Valor:{" "}
                {moeda(m.valor)} · Executado:{" "}
                {m.percentual_executado ? `${m.percentual_executado}%` : "—"}
              </p>
              {m.observacao && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{m.observacao}</p>
              )}
              {m.fotos.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {m.fotos.map((f) => (
                    <li key={f.id} className="text-ink-soft">
                      Foto: {f.nome_original}
                      {` · ${dataHora(f.created_at)}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      <details className={`group ${somenteTela("historico")}`} open={secoes.historico}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-lg font-medium text-ink print:hidden">
          <ChevronRight size={18} className="transition group-open:rotate-90" aria-hidden />
          Histórico completo
          <span className="text-sm font-normal text-ink-muted">({pedido.andamentos.length} eventos)</span>
        </summary>
        <h2 className="hidden font-display text-lg font-medium text-ink print:block">
          Histórico completo
        </h2>
        <div className="mt-3 space-y-4">
          {historicoPorDia.map((g) => (
            <div key={g.dia} className="break-inside-avoid">
              <p className="legenda mb-1">{g.dia}</p>
              <ol className="space-y-1.5">
                {g.eventos.map((evento) => (
                  <li key={evento.id} className="flex gap-3 border-b border-line/60 pb-1.5 text-sm">
                    <span className="w-12 shrink-0 font-mono text-xs text-ink-faint">
                      {hora(evento.created_at)}
                    </span>
                    <span className="text-ink-soft">{normalizarSetores(evento.texto ?? "")}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-faint">{evento.autor_nome}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </details>

      <footer className="hidden border-t border-line pt-2 text-[11px] text-ink-muted print:block">
        Emitido {eu ? `por ${eu.nome} ` : ""}em {dataHora(new Date().toISOString())} · Pedido{" "}
        {pedido.numero} · {typeof window !== "undefined" ? `${window.location.origin}/pedidos/${pedido.id}` : ""}
      </footer>
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="cartao p-3">
      <p className="legenda">{rotulo}</p>
      <p className={`mt-1 font-display text-2xl font-medium ${alerta ? "text-estado-atrasado" : "text-ink"}`}>
        {valor}
      </p>
    </div>
  );
}

function Legenda({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${cor}`} aria-hidden />
      <dt className="text-ink-muted">{rotulo}</dt>
      <dd className="ml-auto font-medium text-ink sm:ml-1">{valor}</dd>
    </div>
  );
}

function Financeiro({ pedido }: { pedido: Pedido }) {
  const previsto = Number(pedido.valor_previsto) || 0;
  const liberado = Number(pedido.valor_liberado) || 0;
  const pago = Number(pedido.valor_pago) || 0;
  const pct = (v: number) => (previsto ? Math.min(100, (v / previsto) * 100) : 0);
  return (
    <div className="mt-2 space-y-3 text-sm">
      <dl className="space-y-2">
        <Linha rotulo="Valor previsto" valor={moeda(pedido.valor_previsto)} />
        {pedido.valor_empenhado && <Linha rotulo="Empenhado" valor={moeda(pedido.valor_empenhado)} />}
        <Linha rotulo="Valor liberado" valor={moeda(pedido.valor_liberado)} />
        <Linha rotulo="Valor pago" valor={moeda(pedido.valor_pago)} />
      </dl>
      {previsto > 0 && (
        <div>
          <div className="relative h-2.5 overflow-hidden rounded-pill bg-canvas">
            <span className="absolute inset-y-0 left-0 bg-brand-200" style={{ width: `${pct(liberado)}%` }} />
            <span className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${pct(pago)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {Math.round(pct(pago))}% pago · {Math.round(pct(liberado))}% liberado · falta liberar{" "}
            {moeda(Math.max(0, previsto - liberado))}
          </p>
        </div>
      )}
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="cartao p-4">
      <h2 className="font-medium text-ink">{titulo}</h2>
      <dl className="mt-2 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{rotulo}</dt>
      <dd className="text-right font-medium text-ink">{valor}</dd>
    </div>
  );
}
