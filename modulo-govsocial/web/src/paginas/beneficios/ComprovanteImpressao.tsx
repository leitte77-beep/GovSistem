import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/ui/Skeleton";
import { Botao } from "@/ui/Botao";
import { servicoBeneficios } from "@/nucleo/api/beneficios";
import { formatarData, formatarDataHora } from "@/nucleo/datas";
import { rotuloBeneficio } from "./rotulos";

/**
 * Comprovante A4 de entrega de benefício (§4.4) — renderiza dentro do
 * LayoutImpressao (com brasão do tenant). Em produção, o comprovante numerado e
 * auditado é gerado pelo backend; aqui é a via de visualização/reimpressão.
 */
export default function ComprovanteImpressao() {
  const { concessaoId } = useParams<{ concessaoId: string }>();
  const { data: c, isLoading } = useQuery({
    queryKey: ["concessao", concessaoId],
    queryFn: () => servicoBeneficios.obter(concessaoId as string),
    enabled: Boolean(concessaoId),
  });

  useEffect(() => {
    if (c) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [c]);

  if (isLoading || !c) return <Skeleton variante="cartao" />;

  return (
    <article>
      <div className="nao-imprimir mb-4 flex justify-end">
        <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}>
          Imprimir
        </Botao>
      </div>

      <h1 className="text-lg">Comprovante de entrega de benefício eventual</h1>
      <p className="text-sm text-ink-soft">Emitido em {formatarData(new Date().toISOString())}</p>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="font-semibold">Benefício</dt>
        <dd>{rotuloBeneficio(c.benefit_type_code)}</dd>
        <dt className="font-semibold">Quantidade</dt>
        <dd>{c.quantidade}</dd>
        {c.valor_total != null && (
          <>
            <dt className="font-semibold">Valor</dt>
            <dd>R$ {c.valor_total.toFixed(2)}</dd>
          </>
        )}
        <dt className="font-semibold">Data da entrega</dt>
        <dd>{formatarDataHora(c.data_entrega)}</dd>
        <dt className="font-semibold">Situação</dt>
        <dd>{c.status}</dd>
      </dl>

      <div className="mt-16 border-t border-ink pt-2 text-center text-sm">
        Assinatura do recebedor
      </div>

      <p className="mt-8 text-xs text-ink-soft">
        Documento de visualização. O comprovante oficial numerado é emitido pelo
        sistema com registro de auditoria. Reimpressões ficam auditadas.
      </p>
    </article>
  );
}
