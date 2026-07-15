import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { servicoProntuario } from "@/nucleo/api/prontuario";
import type { CaseFileListItem, MotivoDesligamento } from "@/tipos/prontuario";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { Modal } from "@/ui/Modal";
import { Botao } from "@/ui/Botao";
import { Select } from "@/ui/Select";
import { avisar } from "@/ui/Toast";

/**
 * Encerramento do acompanhamento (desligamento) — arquiva o prontuário e
 * encerra os acompanhamentos PAIF/PAEFI/MSE ativos vinculados. O motivo de
 * desligamento é obrigatório (alimenta o RMA — desligamentos do mês).
 */

const MOTIVOS_DESLIGAMENTO: { valor: MotivoDesligamento; rotulo: string }[] = [
  { valor: "OBJETIVOS_ALCANCADOS", rotulo: "Objetivos alcançados (superação)" },
  { valor: "MUDANCA_TERRITORIO", rotulo: "Mudança de território/município" },
  { valor: "NAO_ADESAO", rotulo: "Não adesão da família" },
  { valor: "OBITO", rotulo: "Óbito" },
  { valor: "ENCAMINHAMENTO_REDE", rotulo: "Encaminhamento à rede" },
  { valor: "MEDIDA_ENCERRADA", rotulo: "Medida encerrada (MSE)" },
  { valor: "TRANSFERENCIA_UNIDADE", rotulo: "Transferência de unidade" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export function EncerrarAcompanhamentoModal({
  prontuario,
  nomeServico,
  aoFechar,
}: {
  prontuario: CaseFileListItem;
  nomeServico: string;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const [motivo, setMotivo] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>(hoje);
  const [observacoes, setObservacoes] = useState("");

  const encerrar = useMutation({
    mutationFn: () =>
      servicoProntuario.encerrar(prontuario.id, {
        motivo_desligamento: motivo as MotivoDesligamento,
        data_fim: dataFim || undefined,
        observacoes: observacoes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["case-files"] });
      void queryClient.invalidateQueries({ queryKey: ["prontuarios", prontuario.family_id] });
      avisar.sucesso("Acompanhamento encerrado.");
      aoFechar();
    },
    onError: (e) => {
      avisar.erro(
        e instanceof ErroApi ? e.message : "Não foi possível encerrar o acompanhamento.",
      );
    },
  });

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Encerrar acompanhamento"
      descricao={`${nomeServico} — o prontuário será arquivado e os acompanhamentos ativos serão desligados.`}
      tamanho="sm"
      rodape={
        <>
          <Botao variante="secundario" type="button" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            type="button"
            carregando={encerrar.isPending}
            disabled={!motivo}
            onClick={() => encerrar.mutate()}
          >
            Encerrar acompanhamento
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Motivo do desligamento"
          obrigatorio
          opcoes={[{ valor: "", rotulo: "Selecione…" }, ...MOTIVOS_DESLIGAMENTO]}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="encerrar-data-fim" className="text-sm font-semibold text-ink">
            Data do encerramento
          </label>
          <input
            id="encerrar-data-fim"
            type="date"
            value={dataFim}
            max={hoje}
            onChange={(e) => setDataFim(e.target.value)}
            className="min-h-[44px] rounded-input border border-ink-soft/30 bg-surface px-3 focus-visible:outline-focus"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="encerrar-observacoes" className="text-sm font-semibold text-ink">
            Observações <span className="font-normal text-ink-soft">(opcional)</span>
          </label>
          <textarea
            id="encerrar-observacoes"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Síntese do desligamento…"
            className="rounded-input border border-ink-soft/30 bg-surface px-3 py-2 focus-visible:outline-focus"
          />
        </div>

        <p className="text-xs text-ink-soft">
          O histórico da família permanece disponível na Trilha. Um novo
          acompanhamento pode ser aberto futuramente registrando um novo
          atendimento.
        </p>
      </div>
    </Modal>
  );
}
