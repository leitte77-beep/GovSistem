import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock, Printer } from "lucide-react";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { Chip } from "@/ui/Chip";
import { avisar } from "@/ui/Toast";
import {
  AssinaturaCanvas,
  type AssinaturaCanvasRef,
} from "@/ui/AssinaturaCanvas";
import { FluxoStatus } from "@/ui/FluxoStatus";
import { ETAPAS_CONCESSAO, indiceStatusConcessao } from "@/ui/fluxoConcessao";
import { servicoBeneficios } from "@/nucleo/api/beneficios";
import { novaChaveIdempotencia } from "@/nucleo/http/idempotencia";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { formatarDataHora } from "@/nucleo/datas";
import { downloadPdf } from "@/nucleo/impressao/downloadPdf";
import { rotuloBeneficio } from "./rotulos";

/**
 * Painel de acompanhamento de uma concessão (§4.4): FluxoStatus + ações de
 * progressão (parecer sensível → aprovar → entregar com assinatura + comprovante).
 * A entrega envia chave de idempotência e desabilita duplo submit (§14).
 * Reimpressão do comprovante é sinalizada como auditada.
 */
export function PainelConcessao({
  concessaoId,
  aoVoltar,
  aoMudar,
}: {
  concessaoId: string;
  aoVoltar: () => void;
  aoMudar: () => void;
}) {
  const [parecer, setParecer] = useState("");
  const [processando, setProcessando] = useState(false);
  const assinaturaRef = useRef<AssinaturaCanvasRef>(null);

  const q = useQuery({
    queryKey: ["concessao", concessaoId],
    queryFn: () => servicoBeneficios.obter(concessaoId),
  });

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setProcessando(true);
    try {
      await fn();
      avisar.sucesso(msg);
      await q.refetch();
      aoMudar();
    } catch (e) {
      avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível concluir.");
    } finally {
      setProcessando(false);
    }
  }

  if (q.isLoading) return <Skeleton variante="cartao" />;
  if (q.isError) {
    return (
      <EstadoErro
        problema={(q.error as ErroApi).problema}
        aoTentarNovamente={() => q.refetch()}
      />
    );
  }
  if (!q.data) return null;

  const c = q.data;
  const { indice, cancelado } = indiceStatusConcessao(c.status);

  return (
    <div className="space-y-4 rounded-cartao border border-ink-soft/15 bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base">{rotuloBeneficio(c.benefit_type_code)}</h2>
          <p className="text-xs text-ink-soft">Quantidade: {c.quantidade}</p>
        </div>
        <Botao
          variante="texto"
          tamanho="sm"
          onClick={aoVoltar}
          iconeInicio={<ArrowLeft className="h-4 w-4" aria-hidden />}
        >
          Nova concessão
        </Botao>
      </div>

      <FluxoStatus etapas={ETAPAS_CONCESSAO} atual={indice} cancelado={cancelado} />

      {c.status === "NEGADO" && c.motivo_negacao && (
        <p className="rounded-input border border-danger/30 bg-danger/5 p-2 text-sm text-danger">
          Negado: {c.motivo_negacao}
        </p>
      )}

      {/* Etapa: parecer (sensível) — visível na solicitação */}
      {c.status === "SOLICITADO" && (
        <div className="space-y-2">
          <label htmlFor="parecer" className="flex items-center gap-1 text-sm font-semibold text-ink">
            <Lock aria-hidden className="h-3.5 w-3.5 text-sensitive" /> Parecer técnico
            (restrito)
          </label>
          <textarea
            id="parecer"
            value={parecer}
            onChange={(e) => setParecer(e.target.value)}
            rows={4}
            className="w-full rounded-input border border-ink-soft/30 bg-surface p-2 text-sm focus-visible:outline-focus"
            placeholder="Descreva a avaliação técnica da concessão…"
          />
          <div className="flex justify-end">
            <Botao
              variante="primario"
              onClick={() =>
                acao(
                  () => servicoBeneficios.emitirParecer(c.id, parecer || null),
                  "Parecer registrado.",
                )
              }
              carregando={processando}
            >
              Registrar parecer
            </Botao>
          </div>
        </div>
      )}

      {/* Etapa: aprovação */}
      {c.status === "EM_ANALISE" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Botao
            variante="perigo"
            onClick={() =>
              acao(
                () => servicoBeneficios.negar(c.id, "Critérios não atendidos"),
                "Concessão negada.",
              )
            }
            disabled={processando}
          >
            Negar
          </Botao>
          <Botao
            variante="primario"
            onClick={() => acao(() => servicoBeneficios.aprovar(c.id), "Concessão aprovada.")}
            carregando={processando}
          >
            Aprovar concessão
          </Botao>
        </div>
      )}

      {/* Etapa: entrega (com assinatura opcional + idempotência) */}
      {c.status === "APROVADO" && (
        <div className="space-y-3">
          <AssinaturaCanvas ref={assinaturaRef} />
          <div className="flex justify-end">
            <Botao
              variante="primario"
              bloqueiaDuploSubmit
              carregando={processando}
              onClick={() =>
                acao(
                  () => servicoBeneficios.entregar(c.id, novaChaveIdempotencia()),
                  "Entrega registrada.",
                )
              }
            >
              Registrar entrega
            </Botao>
          </div>
        </div>
      )}

      {/* Etapa: entregue — comprovante */}
      {c.status === "ENTREGUE" && (
        <div className="space-y-2">
          <Chip cor="beneficio">Entregue em {formatarDataHora(c.data_entrega)}</Chip>
          <div>
            <Botao
              variante="secundario"
              tamanho="sm"
              iconeInicio={<Printer className="h-4 w-4" aria-hidden />}
              onClick={() => {
                downloadPdf(
                  `/documentos/comprovante-beneficio/${c.id}`,
                  `comprovante_${c.benefit_type_code}.pdf`,
                ).then(() => avisar.sucesso("Comprovante baixado com sucesso"))
                  .catch((e: unknown) => avisar.erro(e instanceof Error ? e.message : "Erro ao baixar comprovante"));
              }}
            >
              Imprimir comprovante
            </Botao>
            <p className="mt-1 text-xs text-ink-soft">
              Reimpressões do comprovante são registradas para auditoria.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
