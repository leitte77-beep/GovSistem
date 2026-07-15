import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/ui/Skeleton";
import { Botao } from "@/ui/Botao";
import { servicoEncaminhamentos } from "@/nucleo/api/encaminhamentos";
import { formatarData } from "@/nucleo/datas";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";

/**
 * Guia A4 de encaminhamento externo (§4.7) — renderiza dentro do LayoutImpressao
 * (com brasão do tenant). Em produção, a guia numerada e auditada é gerada pelo
 * backend; aqui é a via de visualização/reimpressão. Não imprime conteúdo
 * sensível (a devolutiva/contrarreferência nunca entra na guia).
 */
export default function GuiaImpressao() {
  const { encaminhamentoId } = useParams<{ encaminhamentoId: string }>();
  const { data: e, isLoading } = useQuery({
    queryKey: ["encaminhamento", encaminhamentoId],
    queryFn: () => servicoEncaminhamentos.obter(encaminhamentoId as string),
    enabled: Boolean(encaminhamentoId),
  });
  const { unidades } = useUnidadeAtual();

  useEffect(() => {
    if (e) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [e]);

  if (isLoading || !e) return <Skeleton variante="cartao" />;

  const origem = unidades.find((u) => u.id === e.unit_id)?.nome ?? "Unidade de origem";
  const destino =
    e.instituicao_destino ?? e.referral_code ?? "Instituição da rede";

  return (
    <article>
      <div className="nao-imprimir mb-4 flex justify-end">
        <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}>
          Imprimir
        </Botao>
      </div>

      <h1 className="text-lg">Guia de encaminhamento à rede</h1>
      <p className="text-sm text-ink-soft">
        {e.numero_oficio ? `Ofício nº ${e.numero_oficio} · ` : ""}
        Emitida em {formatarData(new Date().toISOString())}
      </p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="font-semibold">Unidade de origem</dt>
        <dd>{origem}</dd>
        <dt className="font-semibold">Destino</dt>
        <dd>{destino}</dd>
        <dt className="font-semibold">Data do encaminhamento</dt>
        <dd>{formatarData(e.data_encaminhamento)}</dd>
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

      <div className="mt-16 border-t border-ink pt-2 text-center text-sm">
        Assinatura e carimbo do profissional responsável
      </div>

      <p className="mt-8 text-xs text-ink-soft">
        Documento de visualização. A guia oficial numerada é emitida pelo sistema
        com registro de auditoria. A contrarreferência (devolutiva) é sigilosa e
        não consta nesta guia.
      </p>
    </article>
  );
}
