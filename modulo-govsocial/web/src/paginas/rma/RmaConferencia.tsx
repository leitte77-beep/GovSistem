import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Download, FileText, Lock, RotateCcw } from "lucide-react";
import { Botao } from "@/ui/Botao";
import { Select } from "@/ui/Select";
import { Chip } from "@/ui/Chip";
import { Modal } from "@/ui/Modal";
import { FluxoStatus } from "@/ui/FluxoStatus";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { EstadoSemPermissao } from "@/ui/EstadoSemPermissao";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { avisar } from "@/ui/Toast";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useRmaCalculo, useRmaDetalhe } from "@/nucleo/api/hooks";
import { servicoRma } from "@/nucleo/api/rma";
import { queryClient } from "@/nucleo/query/queryClient";
import { novaChaveIdempotencia } from "@/nucleo/http/idempotencia";
import { formatarDataHora } from "@/nucleo/datas";
import { downloadPdf } from "@/nucleo/impressao/downloadPdf";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { RmaDrillDown } from "@/tipos/rma";
import { RmaBloco } from "./RmaBloco";
import { ModalAjuste } from "./ModalAjuste";
import { ModalDrillDown } from "./ModalDrillDown";
import type { BlocoNormalizado, CampoNormalizado } from "./rmaModelo";
import {
  ETAPAS_RMA,
  normalizarBlocos,
  podeEditarRma,
  rotuloCompetencia,
  rotuloMes,
  statusRmaParaFluxo,
} from "./rmaModelo";

/**
 * Conferência e fechamento do RMA (§4.8) — a tela ⭐ do módulo.
 * Fluxo: escolher competência (contexto = unidade do cabeçalho) → calcular →
 * conferir números com drill-down → ajustar com justificativa → fechar o mês
 * (assinatura de perfil, idempotência) → somente leitura com opção de reabrir.
 */
const ANOS = [2025, 2026];

export default function RmaConferencia() {
  const podeConferir = usePermissao("rma.conferir");
  const podeFechar = usePermissao("rma.fechar");
  const { unidadeAtual } = useUnidadeAtual();

  const [ano, setAno] = useState(2026);
  const [mes, setMes] = useState(6);

  const calculoQ = useRmaCalculo(unidadeAtual?.id, ano, mes);
  const fechamentoId = calculoQ.data?.id;
  const detalheQ = useRmaDetalhe(fechamentoId);

  const fechamento = detalheQ.data ?? calculoQ.data;

  const [ajusteAlvo, setAjusteAlvo] = useState<{
    bloco: BlocoNormalizado;
    campo: CampoNormalizado;
  } | null>(null);
  const [drillAberto, setDrillAberto] = useState(false);
  const [drillTitulo, setDrillTitulo] = useState("");
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");

  const blocos = useMemo(
    () => normalizarBlocos(fechamento?.dados_calculados),
    [fechamento?.dados_calculados],
  );

  function invalidar() {
    if (!unidadeAtual) return;
    void queryClient.invalidateQueries({ queryKey: ["rma", "detalhe", fechamentoId] });
    void queryClient.invalidateQueries({
      queryKey: ["rma", "calculo", unidadeAtual.id, ano, mes],
    });
  }

  const ajusteMut = useMutation({
    mutationFn: (v: { valorAjustado: number; justificativa: string }) => {
      if (!fechamentoId || !ajusteAlvo) throw new Error("sem alvo");
      return servicoRma.ajustar(fechamentoId, {
        bloco: ajusteAlvo.bloco.id,
        campo: ajusteAlvo.campo.campo,
        valor_calculado: ajusteAlvo.campo.valor,
        valor_ajustado: v.valorAjustado,
        justificativa: v.justificativa,
      });
    },
    onSuccess: () => {
      avisar.sucesso("Número ajustado. Ficará marcado no espelho.");
      setAjusteAlvo(null);
      invalidar();
    },
    onError: (e) => avisar.erro((e as ErroApi).problema?.detail ?? "Não foi possível ajustar."),
  });

  const fecharMut = useMutation({
    mutationFn: () => {
      if (!fechamentoId) throw new Error("sem rma");
      return servicoRma.fechar(fechamentoId, novaChaveIdempotencia());
    },
    onSuccess: () => {
      avisar.sucesso(`RMA de ${rotuloCompetencia(ano, mes)} fechado.`);
      setConfirmarFechar(false);
      invalidar();
    },
    onError: (e) => avisar.erro((e as ErroApi).problema?.detail ?? "Não foi possível fechar."),
  });

  const reabrirMut = useMutation({
    mutationFn: () => {
      if (!fechamentoId) throw new Error("sem rma");
      return servicoRma.reabrir(fechamentoId, motivoReabertura.trim());
    },
    onSuccess: () => {
      avisar.sucesso("Reabertura registrada.");
      setReabrirAberto(false);
      setMotivoReabertura("");
      invalidar();
    },
    onError: (e) => avisar.erro((e as ErroApi).problema?.detail ?? "Não foi possível reabrir."),
  });

  const [drillDados, setDrillDados] = useState<RmaDrillDown | null>(null);
  const [drillCarregando, setDrillCarregando] = useState(false);

  async function abrirDrill(bloco: BlocoNormalizado, campo: CampoNormalizado) {
    if (!fechamentoId) return;
    setDrillTitulo(`${campo.codigo} · ${campo.rotulo}`);
    setDrillDados(null);
    setDrillCarregando(true);
    setDrillAberto(true);
    try {
      const d = await servicoRma.drillDown(fechamentoId, bloco.id, campo.campo);
      setDrillDados(d);
    } catch {
      setDrillDados(null);
    } finally {
      setDrillCarregando(false);
    }
  }

  async function exportarCsv() {
    if (!fechamentoId) return;
    try {
      const csv = await servicoRma.exportarCsv(fechamentoId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rma_${ano}_${String(mes).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      avisar.sucesso("CSV exportado.");
    } catch {
      avisar.erro("Não foi possível exportar o CSV.");
    }
  }

  if (!podeConferir) return <EstadoSemPermissao />;

  const status = fechamento?.status ?? "EM_CONFERENCIA";
  const editavel = podeEditarRma(status);
  const fluxo = statusRmaParaFluxo(status);
  const carregando = calculoQ.isLoading || (Boolean(fechamentoId) && detalheQ.isLoading);

  return (
    <section aria-labelledby="titulo-rma" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="titulo-rma" className="text-xl">
            RMA {unidadeAtual ? `· ${unidadeAtual.nome}` : ""}
          </h1>
          <p className="text-sm text-ink-soft">
            Relatório Mensal de Atendimentos — {rotuloCompetencia(ano, mes)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Ano"
            value={String(ano)}
            onChange={(e) => setAno(Number(e.target.value))}
            opcoes={ANOS.map((a) => ({ valor: String(a), rotulo: String(a) }))}
          />
          <Select
            label="Mês"
            value={String(mes)}
            onChange={(e) => setMes(Number(e.target.value))}
            opcoes={Array.from({ length: 12 }).map((_, i) => ({
              valor: String(i + 1),
              rotulo: rotuloMes(i + 1),
            }))}
          />
        </div>
      </div>

      {!unidadeAtual ? (
        <EstadoVazio
          titulo="Selecione uma unidade"
          descricao="Escolha a unidade no topo para conferir o RMA da competência."
        />
      ) : carregando ? (
        <Skeleton variante="cartao" />
      ) : calculoQ.isError ? (
        <EstadoErro
          problema={(calculoQ.error as ErroApi).problema}
          aoTentarNovamente={() => calculoQ.refetch()}
        />
      ) : !fechamento ? (
        <EstadoVazio titulo="RMA não disponível" descricao="Não foi possível calcular o RMA." />
      ) : (
        <>
          {/* Status + fluxo */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-ink-soft/15 bg-surface p-4">
            <FluxoStatus etapas={ETAPAS_RMA} atual={fluxo.indice} rotulo="Andamento do RMA" />
            <Chip cor={status === "FECHADO" ? "primario" : status === "REABERTO" ? "amber" : "neutro"}>
              {status === "FECHADO"
                ? "Fechado"
                : status === "REABERTO"
                  ? "Reaberto"
                  : "Em conferência"}
            </Chip>
          </div>

          {/* Banner de somente leitura quando fechado */}
          {status === "FECHADO" && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-primary/30 bg-primary-soft p-4"
            >
              <p className="flex items-center gap-2 text-sm text-ink">
                <Lock aria-hidden className="h-4 w-4 text-primary" />
                Este RMA está <strong>fechado</strong>
                {fechamento.fechado_em ? ` em ${formatarDataHora(fechamento.fechado_em)}` : ""}. Os
                registros da competência estão travados (somente leitura).
              </p>
              {podeFechar && (
                <Botao
                  variante="secundario"
                  tamanho="sm"
                  iconeInicio={<RotateCcw aria-hidden className="h-4 w-4" />}
                  onClick={() => setReabrirAberto(true)}
                >
                  Solicitar reabertura
                </Botao>
              )}
            </div>
          )}

          {status === "REABERTO" && fechamento.motivo_reabertura && (
            <div role="status" className="rounded-cartao border border-amber/30 bg-amber/10 p-4 text-sm text-ink">
              RMA reaberto para ajuste. Motivo: <strong>{fechamento.motivo_reabertura}</strong>
            </div>
          )}

          {/* Blocos */}
          {blocos.length === 0 ? (
            <EstadoVazio
              titulo="Sem números para esta competência"
              descricao="Não há dados calculados para a unidade neste mês."
            />
          ) : (
            <div className="space-y-4">
              {blocos.map((bloco) => (
                <RmaBloco
                  key={bloco.id}
                  bloco={bloco}
                  ajustes={fechamento.ajustes}
                  podeAjustar={editavel}
                  aoDrillDown={abrirDrill}
                  aoAjustar={(b, c) => setAjusteAlvo({ bloco: b, campo: c })}
                />
              ))}
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-soft/15 pt-4">
            <Botao
              variante="secundario"
              iconeInicio={<Download aria-hidden className="h-4 w-4" />}
              onClick={exportarCsv}
            >
              Exportar CSV
            </Botao>
            <Botao
              variante="secundario"
              iconeInicio={<FileText aria-hidden className="h-4 w-4" />}
              onClick={() => {
                downloadPdf(
                  `/documentos/rma-espelho/${fechamentoId}`,
                  `rma_espelho.pdf`,
                ).then(() => avisar.sucesso("RMA baixado com sucesso"))
                  .catch((e: unknown) => avisar.erro(e instanceof Error ? e.message : "Erro ao baixar RMA"));
              }}
            >
              Exportar PDF espelho
            </Botao>
            <span className="flex-1" />
            {editavel && podeFechar && (
              <Botao
                iconeInicio={<Lock aria-hidden className="h-4 w-4" />}
                onClick={() => setConfirmarFechar(true)}
              >
                Fechar RMA de {rotuloMes(mes)}
              </Botao>
            )}
          </div>
        </>
      )}

      {/* Modais */}
      <ModalAjuste
        aberto={Boolean(ajusteAlvo)}
        blocoRotulo={ajusteAlvo?.bloco.rotulo ?? ""}
        campo={ajusteAlvo?.campo ?? null}
        enviando={ajusteMut.isPending}
        aoFechar={() => setAjusteAlvo(null)}
        aoConfirmar={(valor, justificativa) =>
          ajusteMut.mutate({ valorAjustado: valor, justificativa })
        }
      />

      <ModalDrillDown
        aberto={drillAberto}
        titulo={drillTitulo}
        carregando={drillCarregando}
        dados={drillDados}
        aoFechar={() => setDrillAberto(false)}
      />

      <Modal
        aberto={confirmarFechar}
        aoFechar={() => setConfirmarFechar(false)}
        titulo={`Fechar RMA de ${rotuloCompetencia(ano, mes)}?`}
        descricao="Confira as consequências antes de assinar o fechamento."
        rodape={
          <>
            <Botao variante="texto" onClick={() => setConfirmarFechar(false)}>
              Cancelar
            </Botao>
            <Botao
              onClick={() => fecharMut.mutate()}
              carregando={fecharMut.isPending}
              bloqueiaDuploSubmit
              iconeInicio={<Lock aria-hidden className="h-4 w-4" />}
            >
              Confirmar fechamento
            </Botao>
          </>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
          <li>Os registros de {rotuloCompetencia(ano, mes)} ficam travados (somente leitura).</li>
          <li>O fechamento é assinado com o seu perfil e fica auditado.</li>
          <li>Para ajustar depois, será preciso solicitar reabertura com justificativa.</li>
        </ul>
      </Modal>

      <Modal
        aberto={reabrirAberto}
        aoFechar={() => setReabrirAberto(false)}
        titulo="Solicitar reabertura do RMA"
        descricao="Explique o motivo. A reabertura fica registrada."
        rodape={
          <>
            <Botao variante="texto" onClick={() => setReabrirAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              onClick={() => reabrirMut.mutate()}
              carregando={reabrirMut.isPending}
              bloqueiaDuploSubmit
              disabled={motivoReabertura.trim().length < 5}
            >
              Reabrir mês
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="motivo-reabertura" className="text-sm font-semibold text-ink">
            Motivo da reabertura
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          </label>
          <textarea
            id="motivo-reabertura"
            rows={3}
            value={motivoReabertura}
            onChange={(e) => setMotivoReabertura(e.target.value)}
            aria-required
            className="rounded-input border border-ink-soft/30 bg-surface px-3 py-2 text-ink focus:border-primary focus-visible:outline-focus"
            placeholder="Ex.: correção de contagem no Bloco C após revisão dos registros."
          />
        </div>
      </Modal>

      <p className="text-xs text-ink-soft">
        Os números vêm dos registros do módulo (recepção/triagem não contam como
        atendimento). O PDF espelho e o CSV são vias de visualização;{" "}
        <Link to="/familias" className="text-primary underline focus-visible:outline-focus">
          abra cada família
        </Link>{" "}
        pelo drill-down para conferir a origem.
      </p>
    </section>
  );
}
