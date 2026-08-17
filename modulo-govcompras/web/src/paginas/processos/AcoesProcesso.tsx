import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowRight, Ban, RotateCcw, Star, Undo2 } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { ErroApi } from "@/nucleo/http/erroApi";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import type { ProcessoDetalhe } from "@/nucleo/tipos";
import { Botao, Modal, Campo, Textarea, Select } from "@/ui";
import { useInvalidarProcesso } from "./hooks";

interface TransicaoDisponivel {
  id: string;
  tipo: string;
  rotulo: string | null;
  etapa_destino_nome: string | null;
  exige_justificativa: boolean;
}

export function AcoesProcesso({ processo }: { processo: ProcessoDetalhe }) {
  const invalidar = useInvalidarProcesso(processo.id);
  const [modalDevolver, setModalDevolver] = useState(false);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [transicaoEscolhida, setTransicaoEscolhida] = useState("");

  const podeAvancar = usePermissao("govcompras.processos.avancar");
  const podeDevolver = usePermissao("govcompras.processos.devolver");
  const podeCancelar = usePermissao("govcompras.processos.cancelar");
  const podeReabrir = usePermissao("govcompras.processos.reabrir");

  const { data: transicoes } = useQuery({
    queryKey: ["processo", processo.id, "transicoes"],
    queryFn: () => api.get<TransicaoDisponivel[]>(`/processos/${processo.id}/transicoes-disponiveis`),
    enabled: modalDevolver,
  });

  const avancar = useMutation({
    mutationFn: () => api.post(`/processos/${processo.id}/avancar`),
    onSuccess: () => {
      toast.success("Processo avançou de etapa.");
      invalidar();
    },
    onError: (erro: unknown) => {
      if (erro instanceof ErroApi && erro.codigo === "pendencias_etapa") {
        toast.error("Não é possível avançar: há pendências nesta etapa.");
      } else {
        toast.error(erro instanceof Error ? erro.message : "Não foi possível avançar.");
      }
    },
  });

  const devolver = useMutation({
    mutationFn: () =>
      api.post(`/processos/${processo.id}/devolver`, {
        justificativa,
        transicao_id: transicaoEscolhida || undefined,
      }),
    onSuccess: () => {
      toast.success("Processo devolvido.");
      setModalDevolver(false);
      setJustificativa("");
      invalidar();
    },
    onError: (erro: unknown) => toast.error(erro instanceof Error ? erro.message : "Não foi possível devolver."),
  });

  const cancelar = useMutation({
    mutationFn: () => api.post(`/processos/${processo.id}/cancelar`, { justificativa }),
    onSuccess: () => {
      toast.success("Processo cancelado.");
      setModalCancelar(false);
      setJustificativa("");
      invalidar();
    },
    onError: (erro: unknown) => toast.error(erro instanceof Error ? erro.message : "Não foi possível cancelar."),
  });

  const reabrir = useMutation({
    mutationFn: () => api.post(`/processos/${processo.id}/reabrir`),
    onSuccess: () => {
      toast.success("Processo reaberto.");
      invalidar();
    },
    onError: (erro: unknown) => toast.error(erro instanceof Error ? erro.message : "Não foi possível reabrir."),
  });

  const favoritar = useMutation({
    mutationFn: () => api.post(`/processos/${processo.id}/favoritar`),
    onSuccess: () => invalidar(),
  });

  const emAndamento = processo.status_geral === "em_andamento";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => favoritar.mutate()}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-amber-500"
        aria-label={processo.favorito ? "Remover dos favoritos" : "Favoritar"}
      >
        <Star className={`size-4 ${processo.favorito ? "fill-amber-400 text-amber-400" : ""}`} />
      </button>

      {emAndamento && podeDevolver && (
        <Botao variante="secundario" tamanho="sm" icone={<Undo2 className="size-3.5" />} onClick={() => setModalDevolver(true)}>
          Devolver
        </Botao>
      )}
      {emAndamento && podeCancelar && (
        <Botao variante="secundario" tamanho="sm" icone={<Ban className="size-3.5" />} onClick={() => setModalCancelar(true)}>
          Cancelar
        </Botao>
      )}
      {!emAndamento && processo.status_geral !== "concluido" && podeReabrir && (
        <Botao variante="secundario" tamanho="sm" icone={<RotateCcw className="size-3.5" />} onClick={() => reabrir.mutate()} carregando={reabrir.isPending}>
          Reabrir
        </Botao>
      )}
      {emAndamento && podeAvancar && (
        <Botao
          tamanho="sm"
          icone={<ArrowRight className="size-3.5" />}
          onClick={() => avancar.mutate()}
          carregando={avancar.isPending}
        >
          Avançar etapa
        </Botao>
      )}

      <Modal
        aberto={modalDevolver}
        aoFechar={() => setModalDevolver(false)}
        titulo="Devolver etapa"
        descricao="Explique o que precisa ser corrigido — o responsável pela etapa anterior será notificado."
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setModalDevolver(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              onClick={() => devolver.mutate()}
              carregando={devolver.isPending}
              disabled={justificativa.trim().length < 5}
            >
              Confirmar devolução
            </Botao>
          </>
        }
      >
        <div className="space-y-3">
          {transicoes && transicoes.length > 1 && (
            <Campo rotulo="Devolver para">
              <Select value={transicaoEscolhida} onChange={(e) => setTransicaoEscolhida(e.target.value)}>
                <option value="">Etapa padrão de devolução</option>
                {transicoes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etapa_destino_nome}
                  </option>
                ))}
              </Select>
            </Campo>
          )}
          <Campo rotulo="Justificativa" obrigatorio>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: Corrigir a quantidade do item 4 e reenviar."
              autoFocus
            />
          </Campo>
        </div>
      </Modal>

      <Modal
        aberto={modalCancelar}
        aoFechar={() => setModalCancelar(false)}
        titulo="Cancelar processo"
        descricao="Esta ação registra o cancelamento na auditoria e não pode ser desfeita por um usuário comum."
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setModalCancelar(false)}>
              Voltar
            </Botao>
            <Botao
              variante="perigo"
              onClick={() => cancelar.mutate()}
              carregando={cancelar.isPending}
              disabled={justificativa.trim().length < 5}
            >
              Confirmar cancelamento
            </Botao>
          </>
        }
      >
        <Campo rotulo="Motivo do cancelamento" obrigatorio>
          <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} autoFocus />
        </Campo>
      </Modal>
    </div>
  );
}
