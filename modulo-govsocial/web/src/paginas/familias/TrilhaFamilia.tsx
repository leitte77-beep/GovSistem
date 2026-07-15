import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Lock } from "lucide-react";
import { Chip } from "@/ui/Chip";
import { CartaoSigiloso } from "@/ui/CartaoSigiloso";
import { formatarDataHora } from "@/nucleo/datas";
import { servicoProntuario } from "@/nucleo/api/prontuario";
import { estiloEvento } from "./eventos";
import type { ItemTrilha, MesTrilha } from "./montarTrilha";

/**
 * <TrilhaFamilia> — timeline virtualizada (assinatura visual do produto, §2).
 * Glifo + cor por tipo de serviço, agrupamento por mês, e integração do
 * <CartaoSigiloso> (revelação sob demanda + auditoria). Eventos de outras
 * unidades aparecem como existência, sem conteúdo (visão de rede).
 *
 * A virtualização (react-virtual) mantém a rolagem fluida em máquinas modestas
 * mesmo com centenas de eventos (§12).
 */

// Achata meses+itens numa lista de linhas (cabeçalho de mês ou evento).
type Linha =
  | { kind: "mes"; rotulo: string; chave: string }
  | { kind: "evento"; item: ItemTrilha };

function achatar(meses: MesTrilha[]): Linha[] {
  const linhas: Linha[] = [];
  for (const m of meses) {
    linhas.push({ kind: "mes", rotulo: m.rotulo, chave: m.chave });
    for (const item of m.itens) linhas.push({ kind: "evento", item });
  }
  return linhas;
}

export function TrilhaFamilia({ meses }: { meses: MesTrilha[] }) {
  const linhas = useMemo(() => achatar(meses), [meses]);
  const paiRef = useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => paiRef.current,
    estimateSize: (i) => (linhas[i].kind === "mes" ? 48 : 200),
    overscan: 6,
  });

  return (
    <div
      ref={paiRef}
      className="max-h-[70vh] max-w-5xl overflow-y-auto pr-1"
      role="region"
      aria-label="Trilha da família"
      // Região rolável recebe foco para permitir rolagem por teclado (WAI-ARIA).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((v) => {
          const linha = linhas[v.index];
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={virtual.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
              }}
            >
              {linha.kind === "mes" ? (
                <h3 className="sticky top-0 z-10 bg-paper py-2 font-titulo text-title-md text-on-surface">
                  {linha.rotulo}
                </h3>
              ) : (
                <LinhaEvento item={linha.item} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LinhaEvento({ item }: { item: ItemTrilha }) {
  const estilo = estiloEvento(item.tipo);
  const Glifo = estilo.glifo;

  return (
    <article className="relative pl-16 pb-lg">
      {/* Linha vertical da trilha */}
      <span
        aria-hidden
        className="absolute left-[19px] top-10 bottom-0 w-[2px] bg-surface-container-highest"
      />
      {/* Marcador circular com cor semântica por tipo de serviço (§2) */}
      <span
        className={`absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm z-10 ${estilo.marcador}`}
        aria-hidden
      >
        <Glifo className="h-5 w-5" />
      </span>

      <div className="flex flex-wrap items-center gap-sm mb-2">
        <time className="font-label-md text-label-md text-on-surface" dateTime={item.data}>
          {formatarDataHora(item.data)}
        </time>
        <Chip cor={estilo.cor}>{estilo.rotulo}</Chip>
        {item.sigilosoReforcado && (
          <Chip cor="sensitive" icone={<Lock className="h-3 w-3" aria-hidden />}>
            Sigilo reforçado
          </Chip>
        )}
      </div>

      {item.daPropriaUnidade ? (
        item.attendanceId && item.caseFileId ? (
          <CartaoSigiloso
            reforcado={item.sigilosoReforcado}
            buscar={() =>
              servicoProntuario.obterAtendimento(item.caseFileId!, item.attendanceId!)
            }
            extrairTexto={(a) => a.evolution_text}
            estaRestrito={(a) => a.evolution_restrita}
          />
        ) : (
          <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/20 font-corpo text-body-sm text-on-surface-variant">
            Registro sem evolução vinculada.
          </div>
        )
      ) : (
        <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant/20 font-corpo text-body-sm text-on-surface-variant">
          Atendimento em {item.unitNome ?? "outra unidade"} — conteúdo restrito à
          unidade.
        </div>
      )}
    </article>
  );
}
