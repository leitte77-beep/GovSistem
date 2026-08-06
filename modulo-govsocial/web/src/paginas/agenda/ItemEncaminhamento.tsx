import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, FileText, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Botao } from "@/ui/Botao";
import { Chip } from "@/ui/Chip";
import { Modal } from "@/ui/Modal";
import { Input } from "@/ui/Input";
import { avisar } from "@/ui/Toast";
import { servicoEncaminhamentos } from "@/nucleo/api/encaminhamentos";
import { formatarData } from "@/nucleo/datas";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { downloadPdf } from "@/nucleo/impressao/downloadPdf";
import type { EncaminhamentoListItem } from "@/tipos/encaminhamentos";
import {
  encaminhamentoAtrasado,
  idadeEmDias,
} from "./tempo";
import { rotuloStatusEncaminhamento } from "./rotulos";

/**
 * <ItemEncaminhamento> — cartão de um encaminhamento no painel (§4.7).
 * Em "Recebidos" mostra ações de aceite/recusa (quando PENDENTE) e devolutiva
 * (quando ACEITO). Em "Enviados" mostra a idade em dias (âmbar após o prazo) e a
 * geração de guia para externos. A contrarreferência é sensível — não aparece
 * aqui; fica no detalhe.
 */
export function ItemEncaminhamento({
  item,
  lado,
  nomeUnidade,
  aoMudar,
}: {
  item: EncaminhamentoListItem;
  lado: "recebidos" | "enviados";
  nomeUnidade: (id: string | null) => string;
  aoMudar: () => void;
}) {
  const [modalRecusa, setModalRecusa] = useState(false);
  const [modalDevolutiva, setModalDevolutiva] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [devolutiva, setDevolutiva] = useState("");

  const dias = idadeEmDias(item.data_encaminhamento);
  const atrasado = lado === "enviados" && encaminhamentoAtrasado(item.status, item.data_encaminhamento);

  const aceitar = useMutation({
    mutationFn: () => servicoEncaminhamentos.aceitar(item.id),
    onSuccess: () => {
      avisar.sucesso("Encaminhamento aceito.");
      aoMudar();
    },
    onError: (e) => avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível aceitar."),
  });

  const recusar = useMutation({
    mutationFn: () => servicoEncaminhamentos.recusar(item.id, motivoRecusa.trim()),
    onSuccess: () => {
      avisar.sucesso("Encaminhamento recusado.");
      setModalRecusa(false);
      aoMudar();
    },
    onError: (e) => avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível recusar."),
  });

  const devolver = useMutation({
    mutationFn: () => servicoEncaminhamentos.devolver(item.id, devolutiva.trim() || null),
    onSuccess: () => {
      avisar.sucesso("Devolutiva registrada.");
      setModalDevolutiva(false);
      aoMudar();
    },
    onError: (e) => avisar.erro(e instanceof ErroApi ? e.message : "Não foi possível registrar a devolutiva."),
  });

  const gerarOficio = useMutation({
    mutationFn: async () => {
      await downloadPdf(
        `/documentos/oficio/${item.id}`,
        `oficio_${item.numero_oficio || "sn"}.pdf`,
      );
    },
    onSuccess: () => {
      avisar.sucesso("Ofício gerado e baixado com sucesso.");
      aoMudar();
    },
    onError: (e) => avisar.erro(e instanceof Error ? e.message : "Não foi possível gerar o ofício."),
  });

  const destino =
    item.tipo === "EXTERNO"
      ? item.instituicao_destino ?? item.referral_code ?? "Rede externa"
      : nomeUnidade(item.unidade_destino_id);
  const origem = nomeUnidade(item.unit_id);

  return (
    <article className="rounded-cartao border border-ink-soft/15 bg-surface p-3 shadow-um">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">
            {lado === "recebidos" ? `De: ${origem}` : `Para: ${destino}`}
          </p>
          {item.tipo === "EXTERNO" && item.numero_oficio && (
            <p className="text-xs text-ink-soft">Ofício nº {item.numero_oficio}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip cor={item.tipo === "EXTERNO" ? "encaminhamento" : "primario"}>
            {item.tipo === "EXTERNO" ? "Externo" : "Interno"}
          </Chip>
          <Chip cor={atrasado ? "amber" : "neutro"}>
            {rotuloStatusEncaminhamento(item.status)}
          </Chip>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
        <span>Enviado em {formatarData(item.data_encaminhamento)}</span>
        <span
          className={
            atrasado
              ? "inline-flex items-center gap-1 font-semibold text-amber"
              : "inline-flex items-center gap-1"
          }
        >
          <Clock aria-hidden className="h-4 w-4" />
          {dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`}
          {atrasado && " · fora do prazo"}
        </span>
        <Link
          to={`/encaminhamentos/${item.id}`}
          className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-focus"
        >
          Ver detalhes
        </Link>
      </div>

      {/* Ações por lado/estado */}
      <div className="mt-3 flex flex-wrap gap-2">
        {lado === "recebidos" && item.status === "PENDENTE" && (
          <>
            <Botao
              variante="primario"
              tamanho="sm"
              carregando={aceitar.isPending}
              onClick={() => aceitar.mutate()}
            >
              Aceitar
            </Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => setModalRecusa(true)}>
              Recusar
            </Botao>
          </>
        )}
        {lado === "recebidos" && item.status === "ACEITO" && (
          <Botao
            variante="primario"
            tamanho="sm"
            iconeInicio={<FileText aria-hidden className="h-4 w-4" />}
            onClick={() => setModalDevolutiva(true)}
          >
            Registrar devolutiva
          </Botao>
        )}
        {lado === "enviados" && item.tipo === "EXTERNO" && (
          <>
            <Botao
              variante="secundario"
              tamanho="sm"
              carregando={gerarOficio.isPending}
              bloqueiaDuploSubmit
              onClick={() => gerarOficio.mutate()}
            >
              Gerar ofício
            </Botao>
            <Botao
              variante="texto"
              tamanho="sm"
              iconeInicio={<ExternalLink aria-hidden className="h-4 w-4" />}
              onClick={() => {
                downloadPdf(
                  `/documentos/guia/${item.id}`,
                  `guia_encaminhamento.pdf`,
                ).then(() => avisar.sucesso("Guia baixada com sucesso"))
                  .catch((e: unknown) => avisar.erro(e instanceof Error ? e.message : "Erro ao baixar guia"));
              }}
            >
              Imprimir guia
            </Botao>
          </>
        )}
      </div>

      {/* Modal de recusa */}
      <Modal
        aberto={modalRecusa}
        aoFechar={() => setModalRecusa(false)}
        titulo="Recusar encaminhamento"
        descricao="Informe o motivo da recusa. A unidade de origem será notificada."
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setModalRecusa(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              carregando={recusar.isPending}
              onClick={() => recusar.mutate()}
              disabled={motivoRecusa.trim().length < 5}
            >
              Recusar encaminhamento
            </Botao>
          </div>
        }
      >
        <Input
          label="Motivo da recusa"
          dica="Mínimo de 5 caracteres."
          value={motivoRecusa}
          onChange={(e) => setMotivoRecusa(e.target.value)}
        />
      </Modal>

      {/* Modal de devolutiva (contrarreferência) */}
      <Modal
        aberto={modalDevolutiva}
        aoFechar={() => setModalDevolutiva(false)}
        titulo="Registrar devolutiva"
        descricao="Contrarreferência para a unidade de origem. O conteúdo é tratado como restrito."
        rodape={
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setModalDevolutiva(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={devolver.isPending}
              onClick={() => devolver.mutate()}
            >
              Enviar devolutiva
            </Botao>
          </div>
        }
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink">Devolutiva</span>
          <textarea
            className="min-h-[120px] rounded-input border border-ink-soft/30 bg-surface p-2 text-sm focus-visible:outline-focus"
            value={devolutiva}
            onChange={(e) => setDevolutiva(e.target.value)}
            placeholder="Descreva o retorno do atendimento à unidade de origem."
          />
        </label>
      </Modal>
    </article>
  );
}
