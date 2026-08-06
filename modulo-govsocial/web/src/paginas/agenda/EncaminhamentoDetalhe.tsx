import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { Chip } from "@/ui/Chip";
import { CartaoSigiloso } from "@/ui/CartaoSigiloso";
import { FluxoStatus } from "@/ui/FluxoStatus";
import { useEncaminhamento } from "@/nucleo/api/hooks";
import { servicoEncaminhamentos } from "@/nucleo/api/encaminhamentos";
import { formatarData, formatarDataHora } from "@/nucleo/datas";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { EncaminhamentoOut } from "@/tipos/encaminhamentos";
import { rotuloStatusEncaminhamento } from "./rotulos";

/**
 * Detalhe do encaminhamento (§4.7). Mostra o fluxo de status
 * (Enviado → Aceite → Devolutiva), os dados de origem/destino e a
 * contrarreferência (devolutiva) — que é conteúdo SENSÍVEL, revelada sob
 * demanda pelo <CartaoSigiloso> (auditada no backend). O detalhe usa `semCache`.
 */
export default function EncaminhamentoDetalhe() {
  const { encaminhamentoId } = useParams<{ encaminhamentoId: string }>();
  const { data: e, isLoading, isError, error, refetch } = useEncaminhamento(encaminhamentoId);
  const { unidades } = useUnidadeAtual();

  function nomeUnidade(id: string | null): string {
    if (!id) return "—";
    return unidades.find((u) => u.id === id)?.nome ?? "Rede";
  }

  const etapas = useMemo(() => {
    return e?.tipo === "EXTERNO"
      ? [
          { id: "solicitado", rotulo: "Solicitado" },
          { id: "oficio", rotulo: "Ofício gerado" },
        ]
      : [
          { id: "solicitado", rotulo: "Solicitado" },
          { id: "aceite", rotulo: "Aceite" },
          { id: "devolutiva", rotulo: "Devolutiva" },
        ];
  }, [e?.tipo]);

  const indice = useMemo(() => indiceStatus(e), [e]);

  if (isLoading) return <Skeleton variante="cartao" />;
  if (isError) {
    return <EstadoErro problema={(error as ErroApi).problema} aoTentarNovamente={() => refetch()} />;
  }
  if (!e) return null;

  const recusadoOuCancelado = e.status === "RECUSADO" || e.status === "CANCELADO";
  const origem = nomeUnidade(e.unit_id);
  const destino =
    e.tipo === "EXTERNO"
      ? e.instituicao_destino ?? e.referral_code ?? "Rede externa"
      : nomeUnidade(e.unidade_destino_id);

  return (
    <section aria-labelledby="titulo-detalhe" className="space-y-5">
      <div>
        <Link
          to="/encaminhamentos"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-focus"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> Voltar aos encaminhamentos
        </Link>
      </div>

      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 id="titulo-detalhe" className="text-xl">
            Encaminhamento {e.tipo === "EXTERNO" ? "externo" : "interno"}
          </h1>
          <Chip cor={recusadoOuCancelado ? "danger" : "primario"}>
            {rotuloStatusEncaminhamento(e.status)}
          </Chip>
        </div>

        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="font-semibold">Origem</dt>
          <dd>{origem}</dd>
          <dt className="font-semibold">Destino</dt>
          <dd>{destino}</dd>
          {e.numero_oficio && (
            <>
              <dt className="font-semibold">Ofício</dt>
              <dd>nº {e.numero_oficio}</dd>
            </>
          )}
          <dt className="font-semibold">Enviado em</dt>
          <dd>{formatarData(e.data_encaminhamento)}</dd>
          {e.data_aceite && (
            <>
              <dt className="font-semibold">Aceito em</dt>
              <dd>{formatarDataHora(e.data_aceite)}</dd>
            </>
          )}
          {e.data_devolutiva && (
            <>
              <dt className="font-semibold">Devolvido em</dt>
              <dd>{formatarDataHora(e.data_devolutiva)}</dd>
            </>
          )}
          {e.motivo && (
            <>
              <dt className="font-semibold">Motivo</dt>
              <dd>{e.motivo}</dd>
            </>
          )}
          {e.descricao && (
            <>
              <dt className="font-semibold">Descrição</dt>
              <dd className="whitespace-pre-wrap">{e.descricao}</dd>
            </>
          )}
        </dl>
      </div>

      <div>
        <h2 className="mb-2 text-base">Andamento</h2>
        <FluxoStatus etapas={etapas} atual={indice} cancelado={recusadoOuCancelado} />
        {e.status === "RECUSADO" && e.motivo_recusa && (
          <p className="mt-2 text-sm text-danger">Motivo da recusa: {e.motivo_recusa}</p>
        )}
      </div>

      {/* Contrarreferência (devolutiva) — conteúdo sensível, revelação consciente */}
      {e.status === "DEVOLVIDO" && (
        <div>
          <h2 className="mb-2 text-base">Contrarreferência (devolutiva)</h2>
          <CartaoSigiloso
            titulo="Devolutiva restrita"
            buscar={() => servicoEncaminhamentos.obter(e.id)}
            extrairTexto={(d) => d.devolutiva}
            estaRestrito={(d) => d.devolutiva == null}
          />
        </div>
      )}
    </section>
  );
}

function indiceStatus(e: EncaminhamentoOut | undefined): number {
  if (!e) return 0;
  if (e.tipo === "EXTERNO") {
    return e.status === "OFICIO_GERADO" ? 1 : 0;
  }
  switch (e.status) {
    case "ACEITO":
      return 1;
    case "DEVOLVIDO":
      return 2;
    case "RECUSADO":
      return 1;
    default:
      return 0;
  }
}
