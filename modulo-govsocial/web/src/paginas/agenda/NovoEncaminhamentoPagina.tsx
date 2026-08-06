import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Botao } from "@/ui/Botao";
import { Select } from "@/ui/Select";
import { Input } from "@/ui/Input";
import { avisar } from "@/ui/Toast";
import { http } from "@/nucleo/http/clienteHttp";
import { servicoEncaminhamentos } from "@/nucleo/api/encaminhamentos";
import { useUnidadeAtual } from "@/contextos/UnidadeAtualProvider";
import { useProntuariosDaUnidade } from "@/nucleo/api/hooks";
import { ErroApi } from "@/nucleo/http/problemDetails";

type TipoEncaminhamento = {
  id: string;
  code: string;
  nome: string;
};

export default function NovoEncaminhamentoPagina() {
  const navigate = useNavigate();
  const { unidadeAtual, unidades } = useUnidadeAtual();

  const [tipo, setTipo] = useState("INTERNO");
  const [unidadeDestinoId, setUnidadeDestinoId] = useState("");
  const [caseFileId, setCaseFileId] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [instituicaoDestino, setInstituicaoDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [descricao, setDescricao] = useState("");

  const { data: referralCodes = [] } = useQuery<TipoEncaminhamento[]>({
    queryKey: ["referral-codes"],
    queryFn: () => http.get<TipoEncaminhamento[]>("/referral-codes?ativo=true"),
    staleTime: 60_000,
  });

  const { data: prontuarios = [] } = useProntuariosDaUnidade(unidadeAtual?.id);

  const criarMut = useMutation({
    mutationFn: () =>
      servicoEncaminhamentos.criar({
        unit_id: unidadeAtual?.id ?? "",
        tipo,
        unidade_destino_id: tipo === "INTERNO" ? unidadeDestinoId || null : null,
        case_file_id: caseFileId || null,
        referral_code: tipo === "EXTERNO" ? referralCode || null : null,
        instituicao_destino: tipo === "EXTERNO" ? instituicaoDestino || null : null,
        motivo: motivo.trim() || null,
        descricao: descricao.trim() || null,
      }),
    onSuccess: () => {
      avisar.sucesso("Encaminhamento criado com sucesso.");
      navigate("/encaminhamentos");
    },
    onError: (e) =>
      avisar.erro(e instanceof ErroApi ? e.message : "Erro ao criar encaminhamento."),
  });

  function podeEnviar() {
    if (!unidadeAtual) return false;
    if (tipo === "INTERNO" && !unidadeDestinoId) return false;
    if (tipo === "EXTERNO" && !referralCode) return false;
    return true;
  }

  const outrasUnidades = unidades.filter((u) => u.id !== unidadeAtual?.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => navigate("/encaminhamentos")}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para encaminhamentos
      </button>

      <div>
        <h1 className="text-xl font-semibold">Novo Encaminhamento</h1>
        <p className="text-sm text-ink-soft mt-1">
          Encaminhe uma família ou pessoa para outra unidade ou serviço externo.
        </p>
        {unidadeAtual && (
          <p className="text-sm text-ink-soft mt-0.5">
            Unidade de origem: <span className="font-semibold text-ink">{unidadeAtual.nome}</span>
          </p>
        )}
      </div>

      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-6 space-y-5">
        <Select
          label="Tipo de encaminhamento"
          obrigatorio
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          opcoes={[
            { valor: "INTERNO", rotulo: "Interno (entre unidades)" },
            { valor: "EXTERNO", rotulo: "Externo (para outras instituições)" },
          ]}
        />

        {tipo === "INTERNO" && (
          <>
            <Select
              label="Unidade de destino"
              obrigatorio
              placeholder="Selecione a unidade"
              value={unidadeDestinoId}
              onChange={(e) => setUnidadeDestinoId(e.target.value)}
              opcoes={outrasUnidades.map((u) => ({ valor: u.id, rotulo: u.nome }))}
            />
            <Select
              label="Prontuário (opcional)"
              placeholder="Selecione o prontuário da família"
              value={caseFileId}
              onChange={(e) => setCaseFileId(e.target.value)}
              opcoes={prontuarios.map((p) => ({
                valor: p.id,
                rotulo: `Prontuário ${p.service_type_code} — Família ${p.family_id.slice(0, 8)}...`,
              }))}
            />
          </>
        )}

        {tipo === "EXTERNO" && (
          <>
            <Select
              label="Tipo de serviço"
              obrigatorio
              placeholder="Selecione o tipo"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              opcoes={referralCodes.map((rc) => ({
                valor: rc.code,
                rotulo: rc.nome,
              }))}
            />
            <Input
              label="Instituição de destino"
              value={instituicaoDestino}
              onChange={(e) => setInstituicaoDestino(e.target.value)}
              placeholder="Ex: UBS Vila Rica, Escola Estadual..."
            />
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink">Motivo</span>
          <textarea
            className="min-h-[100px] rounded-input border border-ink-soft/30 bg-surface p-3 text-sm focus-visible:outline-focus"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva o motivo do encaminhamento."
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink">Descrição adicional</span>
          <textarea
            className="min-h-[100px] rounded-input border border-ink-soft/30 bg-surface p-3 text-sm focus-visible:outline-focus"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Informações complementares (opcional)."
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Botao variante="secundario" onClick={() => navigate("/encaminhamentos")}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={criarMut.isPending}
            disabled={!podeEnviar()}
            onClick={() => criarMut.mutate()}
          >
            Criar encaminhamento
          </Botao>
        </div>
      </div>
    </div>
  );
}
