"use client";

/**
 * Visão de tabela, para quem prefere densidade e quer exportar. Ordenação é
 * local, sobre o que está na tela — sem prometer um relatório que o filtro
 * não sustenta.
 */

import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Clock,
  Download,
  Inbox,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { EtiquetaPrazo, EtiquetaSituacao } from "@/components/Etiquetas";
import { api, type PedidoLinha } from "@/lib/api";
import {
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  ROTULO_SITUACAO,
  ROTULO_TIPO,
  data,
  moeda,
} from "@/lib/formato";
import { useSessao } from "@/lib/sessao";
import { useNomeSetor } from "@/lib/setores";

type Coluna = "numero" | "titulo" | "prazo_atual" | "prioridade" | "valor_previsto";

const ORDEM_PRIORIDADE: Record<string, number> = {
  URGENTE: 3,
  ALTA: 2,
  NORMAL: 1,
};

const PONTO: Record<string, string> = {
  COM_ASSESSOR: "bg-brand",
  EM_SETOR: "bg-estado-andamento",
  AGUARDANDO_TERCEIRO: "bg-estado-externo",
  CONCLUIDO: "bg-estado-concluido",
  CANCELADO: "bg-estado-cancelado",
};

const TOM_PRIORIDADE: Record<string, string> = {
  URGENTE: "border-estado-atrasado/25 bg-estado-atrasado/10 text-estado-atrasado",
  ALTA: "border-brass/25 bg-brass-50 text-brass-700",
  NORMAL: "border-line bg-ink/[.05] text-ink-muted",
};

const FECHADOS = ["CONCLUIDO", "CANCELADO"];

const ROTULO_COLUNA: Record<Coluna, string> = {
  numero: "Número",
  titulo: "Título",
  prioridade: "Prioridade",
  prazo_atual: "Prazo",
  valor_previsto: "Valor",
};

export function TabelaDePedidos({ pedidos }: { pedidos: PedidoLinha[] }) {
  const nomeSetor = useNomeSetor();
  const router = useRouter();
  const { eu } = useSessao();
  const [assumindo, setAssumindo] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({
    coluna: "prazo_atual",
    asc: true,
  });

  const linhas = useMemo(() => {
    const copia = [...pedidos];
    copia.sort((a, b) => {
      const va = valorDe(a, ordem.coluna);
      const vb = valorDe(b, ordem.coluna);
      if (va === vb) return 0;
      const comparacao = va > vb ? 1 : -1;
      return ordem.asc ? comparacao : -comparacao;
    });
    return copia;
  }, [pedidos, ordem]);

  function ordenarPor(coluna: Coluna) {
    setOrdem((atual) =>
      atual.coluna === coluna ? { coluna, asc: !atual.asc } : { coluna, asc: true }
    );
  }

  async function assumir(pedido: PedidoLinha) {
    setAssumindo(pedido.id);
    try {
      const completo = await api.obter(pedido.id);
      const enc = completo.encaminhamento_atual;
      if (!enc) throw new Error("Esta tarefa não está mais aberta.");
      await api.assumir(pedido.id, enc.id);
      toast.success("Tarefa assumida. Ela é sua agora.");
      router.push(`/pedidos/${pedido.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAssumindo(null);
    }
  }

  function exportarCsv() {
    const cabecalho = [
      "Número",
      "Título",
      "Tipo",
      "Situação",
      "Tarefa",
      "Setor",
      "Responsável",
      "Prazo",
      "Atraso (dias)",
      "Valor previsto",
    ];
    const corpo = linhas.map((p) => [
      p.numero,
      p.titulo,
      ROTULO_TIPO[p.tipo] ?? p.tipo,
      ROTULO_SITUACAO[p.situacao] ?? p.situacao,
      p.tarefa_atual,
      p.setor_atual ? nomeSetor(p.setor_atual) : "",
      p.responsavel_atual?.name ?? "",
      p.prazo_atual ?? "",
      String(p.dias_de_atraso),
      p.valor_previsto ?? "",
    ]);
    const csv = [cabecalho, ...corpo]
      .map((linha) =>
        linha.map((celula) => `"${String(celula).replace(/"/g, '""')}"`).join(";")
      )
      .join("\r\n");
    // BOM para o Excel abrir os acentos corretamente.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "govtask-pedidos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (pedidos.length === 0) {
    return (
      <div className="cartao flex flex-col items-center gap-2 px-4 py-14 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-faint">
          <Inbox size={20} aria-hidden />
        </span>
        <p className="text-sm text-ink-muted">Nenhum pedido com esses filtros.</p>
      </div>
    );
  }

  const cabecalhos: { chave: Coluna; rotulo: string }[] = [
    { chave: "numero", rotulo: "Número" },
    { chave: "titulo", rotulo: "Título" },
    { chave: "prioridade", rotulo: "Prioridade" },
    { chave: "prazo_atual", rotulo: "Prazo" },
    { chave: "valor_previsto", rotulo: "Valor" },
  ];

  return (
    <section className="cartao flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-canvas/40 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span>
            Exibindo <strong className="text-ink">{linhas.length}</strong>{" "}
            {linhas.length === 1 ? "pedido" : "pedidos"}
          </span>
          <span className="text-line-strong" aria-hidden>
            •
          </span>
          <span>
            Ordenado por:{" "}
            <strong className="text-ink-soft">{ROTULO_COLUNA[ordem.coluna]}</strong>{" "}
            {ordem.asc ? "crescente" : "decrescente"}
          </span>
        </div>
        <button className="botao-secundario text-xs" onClick={exportarCsv}>
          <Download size={14} aria-hidden />
          Exportar CSV
        </button>
      </div>

      <div className="rolagem-fina overflow-x-auto">
        <table className="w-full min-w-[66rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/50 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              {cabecalhos.map(({ chave, rotulo }) => (
                <th
                  key={chave}
                  scope="col"
                  className={clsx("whitespace-nowrap px-3 py-3", chave === "numero" && "pl-5")}
                >
                  <button
                    className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                    onClick={() => ordenarPor(chave)}
                  >
                    {rotulo}
                    {ordem.coluna === chave &&
                      (ordem.asc ? (
                        <ArrowUp size={12} className="text-brand" aria-hidden />
                      ) : (
                        <ArrowDown size={12} className="text-brand" aria-hidden />
                      ))}
                  </button>
                </th>
              ))}
              <th scope="col" className="whitespace-nowrap px-3 py-3">
                Situação
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3">
                Tarefa
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3">
                Setor
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3">
                Responsável
              </th>
              <th scope="col" className="whitespace-nowrap py-3 pl-3 pr-5 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {linhas.map((pedido) => {
              const valor = Number(pedido.valor_previsto) > 0 ? moeda(pedido.valor_previsto) : null;
              const subtitulo = [
                ROTULO_TIPO[pedido.tipo] ?? pedido.tipo,
                pedido.origem_nome ?? ROTULO_ORIGEM[pedido.origem] ?? null,
              ]
                .filter(Boolean)
                .join(" · ");
              const fechado = FECHADOS.includes(pedido.situacao);
              const podeAssumir =
                !pedido.responsavel_atual && !fechado && eu?.pode_trabalhar;
              return (
                <tr
                  key={pedido.id}
                  className={clsx(
                    "group transition-colors hover:bg-brand-50/40",
                    pedido.dias_de_atraso > 0 && "bg-estado-atrasado/[.03]"
                  )}
                >
                  <td className="whitespace-nowrap py-3.5 pl-5 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "h-2 w-2 shrink-0 rounded-full",
                          PONTO[pedido.situacao] ?? "bg-ink-faint"
                        )}
                        aria-hidden
                      />
                      <Link
                        href={`/pedidos/${pedido.id}`}
                        className="numero rounded border border-line bg-canvas px-2 py-0.5 transition-colors hover:border-line-strong hover:text-ink"
                      >
                        {pedido.numero}
                      </Link>
                    </div>
                  </td>
                  <td className="min-w-[16rem] max-w-[22rem] px-4 py-3.5">
                    <Link href={`/pedidos/${pedido.id}`} className="flex flex-col">
                      <span className="truncate font-semibold text-ink transition-colors group-hover:text-brand">
                        {pedido.titulo}
                      </span>
                      {subtitulo && (
                        <span className="mt-0.5 truncate text-[11px] font-normal text-ink-faint">
                          {subtitulo}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                        TOM_PRIORIDADE[pedido.prioridade] ?? TOM_PRIORIDADE.NORMAL
                      )}
                    >
                      {ROTULO_PRIORIDADE[pedido.prioridade] ?? pedido.prioridade}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs font-semibold text-ink-soft">
                        {data(pedido.prazo_atual)}
                      </span>
                      <EtiquetaPrazo
                        prazo={pedido.prazo_atual}
                        diasDeAtraso={pedido.dias_de_atraso}
                      />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    {valor ? (
                      <div className="flex flex-col items-end">
                        <span className="font-mono font-bold tracking-tight text-ink">
                          {valor}
                        </span>
                        <span className="text-[10px] font-normal text-ink-faint">
                          Valor previsto
                        </span>
                      </div>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    <EtiquetaSituacao situacao={pedido.situacao} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    {pedido.tarefa_atual ? (
                      <span className="inline-flex items-center rounded-lg border border-brand-200/60 bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                        {pedido.tarefa_atual}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    {pedido.setor_atual ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft">
                        <Building2 size={13} className="text-ink-faint" aria-hidden />
                        {nomeSetor(pedido.setor_atual)}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5">
                    {pedido.responsavel_atual ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                        <UserRound size={13} className="text-ink-faint" aria-hidden />
                        {pedido.responsavel_atual.name}
                      </span>
                    ) : (
                      <span className="text-xs font-normal text-ink-faint">
                        — Sem responsável
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                    {podeAssumir ? (
                      <button
                        onClick={() => assumir(pedido)}
                        disabled={assumindo === pedido.id}
                        className="botao-primario px-3 py-1.5 text-xs"
                      >
                        {assumindo === pedido.id && (
                          <Clock size={13} className="animate-spin" aria-hidden />
                        )}
                        Assumir e abrir
                      </button>
                    ) : (
                      <Link
                        href={`/pedidos/${pedido.id}`}
                        className="inline-flex items-center rounded-btn border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
                      >
                        Abrir
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 border-t border-line bg-canvas/40 px-6 py-3 text-xs text-ink-muted sm:flex-row">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-estado-concluido" aria-hidden />
          Sincronizado com o protocolo integrado do gabinete
        </span>
        <span className="text-[11px] text-ink-faint">
          {linhas.length} {linhas.length === 1 ? "registro" : "registros"} nesta visão
        </span>
      </div>
    </section>
  );
}

function valorDe(pedido: PedidoLinha, coluna: Coluna): string | number {
  switch (coluna) {
    case "numero":
      return pedido.numero;
    case "titulo":
      return pedido.titulo.toLowerCase();
    case "prazo_atual":
      return pedido.prazo_atual ?? "9999-12-31";
    case "prioridade":
      return ORDEM_PRIORIDADE[pedido.prioridade] ?? 0;
    case "valor_previsto":
      return pedido.valor_previsto ? Number(pedido.valor_previsto) : -1;
  }
}
