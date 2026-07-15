import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Botao } from "@/ui/Botao";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { avisar } from "@/ui/Toast";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useConcessoesDaFamilia, useTiposBeneficio } from "@/nucleo/api/hooks";
import { servicoBeneficios } from "@/nucleo/api/beneficios";
import { novaChaveIdempotencia } from "@/nucleo/http/idempotencia";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { queryClient } from "@/nucleo/query/queryClient";
import { registrarTiposBeneficio } from "./rotulos";
import { avaliarDuplicidade } from "./duplicidade";
import { AlertaDuplicidade } from "./AlertaDuplicidade";
import { HistoricoBeneficios } from "./HistoricoBeneficios";
import { PainelConcessao } from "./PainelConcessao";

/**
 * Concessão de benefício eventual (§4.4) — layout em duas colunas:
 * esquerda = formulário de concessão (com alerta de duplicidade em primeiro
 * plano); direita = histórico da família na rede. Requer `?familia=<uuid>`.
 */
export default function BeneficiosConcessao() {
  const [params] = useSearchParams();
  const familyId = params.get("familia") ?? "";
  const podeConceder = usePermissao("beneficio.conceder");
  const { unidadeAtual } = useUnidadeAtual();

  const tiposQ = useTiposBeneficio();
  const concessoesQ = useConcessoesDaFamilia(familyId || undefined);
  const [concessaoSelecionada, setConcessaoSelecionada] = useState<string | null>(null);

  const [benefitCode, setBenefitCode] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (tiposQ.data) registrarTiposBeneficio(tiposQ.data);
  }, [tiposQ.data]);

  useEffect(() => {
    if (!benefitCode && tiposQ.data && tiposQ.data.length > 0) {
      setBenefitCode(tiposQ.data[0].code);
    }
  }, [tiposQ.data, benefitCode]);

  const tipoSelecionado = useMemo(
    () => tiposQ.data?.find((t) => t.code === benefitCode) ?? null,
    [tiposQ.data, benefitCode],
  );

  const aviso = useMemo(
    () =>
      avaliarDuplicidade(
        concessoesQ.data ?? [],
        benefitCode,
        tipoSelecionado?.periodicidade_max_dias ?? null,
      ),
    [concessoesQ.data, benefitCode, tipoSelecionado],
  );

  const criar = useMutation({
    mutationFn: async () => {
      if (!unidadeAtual) throw new ErroApi({ type: "", title: "", status: 400, detail: "Selecione uma unidade." });
      return servicoBeneficios.criar(
        {
          family_id: familyId,
          unit_id: unidadeAtual.id,
          benefit_type_code: benefitCode,
          quantidade: Number(quantidade) || 1,
        },
        novaChaveIdempotencia(),
      );
    },
    onSuccess: (c) => {
      avisar.sucesso("Benefício solicitado.");
      setConcessaoSelecionada(c.id);
      void queryClient.invalidateQueries({ queryKey: ["concessoes", familyId] });
    },
    onError: (e) => {
      avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível solicitar.");
    },
  });

  if (!podeConceder) return <EstadoSemPermissao />;

  if (!familyId) {
    return (
      <EstadoVazio
        titulo="Selecione uma família"
        descricao="Abra a ficha de uma família e use 'Conceder benefício' para iniciar a concessão."
      />
    );
  }

  const exigeJustificativa = aviso.duplicado;
  const justificativaOk = !exigeJustificativa || justificativa.trim().length >= 5;

  return (
    <section aria-labelledby="titulo-beneficio" className="space-y-4">
      <h1 id="titulo-beneficio" className="text-xl">
        Conceder benefício eventual
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna esquerda: formulário ou painel de acompanhamento */}
        <div className="space-y-4">
          {concessaoSelecionada ? (
            <PainelConcessao
              concessaoId={concessaoSelecionada}
              aoVoltar={() => setConcessaoSelecionada(null)}
              aoMudar={() =>
                queryClient.invalidateQueries({ queryKey: ["concessoes", familyId] })
              }
            />
          ) : (
            <form
              className="space-y-4 rounded-cartao border border-ink-soft/15 bg-surface p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!justificativaOk) {
                  avisar.erro("Informe a justificativa para conceder apesar da duplicidade.");
                  return;
                }
                criar.mutate();
              }}
            >
              <Select
                label="Tipo de benefício"
                opcoes={(tiposQ.data ?? []).map((t) => ({ valor: t.code, rotulo: t.nome }))}
                value={benefitCode}
                onChange={(e) => setBenefitCode(e.target.value)}
                placeholder={tiposQ.isLoading ? "Carregando…" : "Selecione"}
                obrigatorio
              />

              {tipoSelecionado?.periodicidade_max_dias && (
                <p className="text-xs text-ink-soft">
                  Janela mínima entre concessões: {tipoSelecionado.periodicidade_max_dias} dias.
                </p>
              )}

              <AlertaDuplicidade aviso={aviso} benefitCode={benefitCode} />

              <Input
                label="Quantidade"
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />

              {exigeJustificativa && (
                <Input
                  label="Justificativa da nova concessão"
                  dica="Obrigatória por haver concessão recente (mínimo 5 caracteres)."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  erro={
                    !justificativaOk && justificativa.length > 0
                      ? "Mínimo de 5 caracteres."
                      : undefined
                  }
                />
              )}

              <div className="flex justify-end">
                <Botao
                  variante="primario"
                  type="submit"
                  carregando={criar.isPending}
                  bloqueiaDuploSubmit
                >
                  Solicitar benefício
                </Botao>
              </div>
            </form>
          )}
        </div>

        {/* Coluna direita: histórico da família na rede */}
        <div className="space-y-2">
          <h2 className="text-base">Histórico da família na rede</h2>
          <HistoricoBeneficios
            concessoes={concessoesQ.data ?? []}
            carregando={concessoesQ.isLoading}
          />
        </div>
      </div>
    </section>
  );
}
