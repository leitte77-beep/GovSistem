import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronLeft, PackageOpen, Send } from "lucide-react";
import clsx from "clsx";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { Botao } from "@/ui/Botao";
import { Chip } from "@/ui/Chip";
import { avisar } from "@/ui/Toast";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { useOnboardingStatus } from "@/nucleo/api/hooks";
import { servicoAdmin } from "@/nucleo/api/admin";
import { queryClient } from "@/nucleo/query/queryClient";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import { PassoUnidades } from "./PassoUnidades";
import { PassoTerritorios } from "./PassoTerritorios";
import { PassoEquipes } from "./PassoEquipes";
import { PassoBeneficios } from "./PassoBeneficios";
import { PassoSigilo } from "./PassoSigilo";
import { ImportacaoCadunico } from "./ImportacaoCadunico";
import { ETAPAS_WIZARD, etapaConcluida } from "./wizardModelo";

/**
 * Assistente de implantação do tenant (§4.10) — stepper acessível:
 * Unidades → Territórios → Equipes → Tipos de benefício → Sigilo → Importação.
 * Cada etapa (exceto sigilo) executa uma etapa do backend e marca o progresso.
 */
export default function AdministracaoWizard() {
  const podeGerir = usePermissao("administracao.gerir");
  const statusQ = useOnboardingStatus();
  const [etapaAtual, setEtapaAtual] = useState(0);

  const executarMut = useMutation({
    mutationFn: (args: { step: string; data: Record<string, unknown> }) =>
      servicoAdmin.executarEtapa(args.step, args.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding", "status"] });
      avisar.sucesso("Etapa concluída.");
      avancar();
    },
    onError: (e) =>
      avisar.erro((e as ErroApi).problema?.detail ?? "Não foi possível concluir a etapa."),
  });

  function avancar() {
    setEtapaAtual((i) => Math.min(i + 1, ETAPAS_WIZARD.length - 1));
  }
  function voltar() {
    setEtapaAtual((i) => Math.max(i - 1, 0));
  }

  if (!podeGerir) return <EstadoSemPermissao />;
  if (statusQ.isLoading) return <Skeleton variante="cartao" />;
  if (statusQ.isError) {
    return (
      <EstadoErro
        problema={(statusQ.error as ErroApi).problema}
        aoTentarNovamente={() => statusQ.refetch()}
      />
    );
  }

  const status = statusQ.data;
  const etapa = ETAPAS_WIZARD[etapaAtual];

  function aoSalvar(data: Record<string, unknown>) {
    if (!etapa.backend) {
      avancar();
      return;
    }
    executarMut.mutate({ step: etapa.backend, data });
  }

  return (
    <section aria-labelledby="titulo-admin" className="space-y-5">
      <div>
        <h1 id="titulo-admin" className="text-xl">
          Implantação do município
        </h1>
        <p className="text-sm text-ink-soft">
          {status?.tenant_name} · configure o módulo em {ETAPAS_WIZARD.length} etapas.
        </p>
      </div>

      {status?.ready && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-cartao border border-primary/30 bg-primary-soft p-4 text-sm text-ink"
        >
          <Check aria-hidden className="h-4 w-4 text-primary" />
          Implantação concluída — todas as etapas obrigatórias estão prontas.
        </div>
      )}

      {/* Stepper */}
      <nav aria-label="Etapas da implantação">
        <ol className="flex flex-wrap gap-2">
          {ETAPAS_WIZARD.map((e, i) => {
            const concluida = etapaConcluida(status, e.backend);
            const ativa = i === etapaAtual;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setEtapaAtual(i)}
                  aria-current={ativa ? "step" : undefined}
                  className={clsx(
                    "flex items-center gap-2 rounded-input border px-3 py-2 text-sm focus-visible:outline-focus",
                    ativa
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-ink-soft/20 text-ink-soft hover:text-ink",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                      concluida
                        ? "border-primary bg-primary text-white"
                        : ativa
                          ? "border-primary text-primary"
                          : "border-ink-soft/40",
                    )}
                  >
                    {concluida ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="font-semibold">{e.rotulo}</span>
                  {concluida && <span className="apenas-leitor">(concluída)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Conteúdo da etapa */}
      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base">{etapa.rotulo}</h2>
            <p className="text-sm text-ink-soft">{etapa.descricao}</p>
          </div>
          {etapaConcluida(status, etapa.backend) && etapa.backend && (
            <Chip cor="primario">Concluída</Chip>
          )}
        </div>

        {etapa.id === "units" && (
          <PassoUnidades enviando={executarMut.isPending} aoSalvar={aoSalvar} />
        )}
        {etapa.id === "territories" && (
          <PassoTerritorios enviando={executarMut.isPending} aoSalvar={aoSalvar} />
        )}
        {etapa.id === "professionals" && (
          <PassoEquipes enviando={executarMut.isPending} aoSalvar={aoSalvar} />
        )}
        {etapa.id === "benefits" && (
          <PassoBeneficios enviando={executarMut.isPending} aoSalvar={aoSalvar} />
        )}
        {etapa.id === "sigilo" && <PassoSigilo aoConfirmar={avancar} />}
        {etapa.id === "import" && <ImportacaoCadunico aoConcluir={() => statusQ.refetch()} />}
      </div>

      <div className="flex items-center justify-between">
        <Botao
          variante="texto"
          onClick={voltar}
          disabled={etapaAtual === 0}
          iconeInicio={<ChevronLeft aria-hidden className="h-4 w-4" />}
        >
          Voltar
        </Botao>
        <span className="text-sm text-ink-soft">
          Etapa {etapaAtual + 1} de {ETAPAS_WIZARD.length}
        </span>
      </div>

      <div className="border-t border-ink-soft/10 pt-4 mt-2 space-y-2">
        <a
          href="/administracao/tipos-beneficio"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <PackageOpen className="h-4 w-4" />
          Gerenciar tipos de benefício (criar/editar)
        </a>
        <br />
        <a
          href="/administracao/tipos-encaminhamento"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Send className="h-4 w-4" />
          Gerenciar tipos de encaminhamento (criar/editar)
        </a>
      </div>
    </section>
  );
}
