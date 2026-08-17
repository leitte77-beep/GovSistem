import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio, Select, Textarea } from "@/ui";

interface Dotacao {
  id: string;
  orgao: string;
  unidade: string;
  elemento_despesa: string;
  saldo: number;
}
interface VinculoDotacao {
  id: string;
  dotacao_id: string;
  valor_reservado: number;
  status: string;
  justificativa_devolucao: string | null;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_COR: Record<string, "neutro" | "verde" | "amarelo" | "vermelho"> = {
  solicitada: "amarelo",
  confirmada: "verde",
  devolvida: "vermelho",
  indisponivel: "vermelho",
};

export function AbaDotacao({ processoId }: { processoId: string }) {
  const queryClient = useQueryClient();
  const podeConfirmar = usePermissao("govcompras.dotacao.confirmar");
  const podeDecidirAutorizacao = usePermissao("govcompras.autorizacao.decidir");

  const { data: vinculos } = useQuery({
    queryKey: ["processo", processoId, "dotacoes"],
    queryFn: () => api.get<VinculoDotacao[]>(`/processos/${processoId}/dotacoes`),
  });
  const { data: dotacoesDisponiveis } = useQuery({
    queryKey: ["dotacoes"],
    queryFn: () => api.get<Dotacao[]>("/dotacoes"),
  });

  const [dotacaoEscolhida, setDotacaoEscolhida] = useState("");
  const [valor, setValor] = useState("");
  const [justificativaAutorizacao, setJustificativaAutorizacao] = useState("");

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["processo", processoId, "dotacoes"] });
    queryClient.invalidateQueries({ queryKey: ["processo", processoId] });
  };

  const vincular = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/dotacoes`, { dotacao_id: dotacaoEscolhida, valor_reservado: Number(valor) }),
    onSuccess: () => {
      toast.success("Dotação vinculada ao processo, aguardando confirmação da Contabilidade.");
      setDotacaoEscolhida("");
      setValor("");
      invalidar();
    },
  });

  const decidir = useMutation({
    mutationFn: (vars: { vinculoId: string; status: string; justificativa?: string }) =>
      api.post(`/processos/${processoId}/dotacoes/${vars.vinculoId}/decidir`, {
        status: vars.status,
        justificativa_devolucao: vars.justificativa,
      }),
    onSuccess: () => {
      toast.success("Decisão registrada.");
      invalidar();
    },
  });

  const autorizar = useMutation({
    mutationFn: (decisao: "autorizado" | "nao_autorizado") =>
      api.post(`/processos/${processoId}/autorizacao`, { decisao, justificativa: justificativaAutorizacao || undefined }),
    onSuccess: () => {
      toast.success("Decisão de autorização registrada.");
      setJustificativaAutorizacao("");
      invalidar();
    },
  });

  return (
    <div className="space-y-4">
      <Cartao>
        <CartaoCabecalho titulo="Dotação Orçamentária" descricao="Encaminhamento e confirmação pela Contabilidade" />
        <CartaoCorpo className="space-y-3">
          {!vinculos?.length ? (
            <EstadoVazio titulo="Ainda não encaminhado à Contabilidade" />
          ) : (
            <ul className="space-y-2">
              {vinculos.map((v) => {
                const dotacao = dotacoesDisponiveis?.find((d) => d.id === v.dotacao_id);
                return (
                  <li key={v.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-slate-800">{dotacao?.elemento_despesa ?? v.dotacao_id}</p>
                      <Chip cor={STATUS_COR[v.status] ?? "neutro"}>{v.status}</Chip>
                    </div>
                    <p className="text-xs text-slate-500">Valor reservado: {formatarMoeda(v.valor_reservado)}</p>
                    {v.justificativa_devolucao && <p className="mt-1 text-xs text-red-600">{v.justificativa_devolucao}</p>}
                    {podeConfirmar && v.status === "solicitada" && (
                      <div className="mt-2 flex gap-2">
                        <Botao tamanho="sm" onClick={() => decidir.mutate({ vinculoId: v.id, status: "confirmada" })} carregando={decidir.isPending}>
                          Confirmar
                        </Botao>
                        <Botao tamanho="sm" variante="secundario" onClick={() => decidir.mutate({ vinculoId: v.id, status: "indisponivel" })}>
                          Indisponível
                        </Botao>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {(
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="col-span-2">
                <Campo rotulo="Dotação">
                  <Select value={dotacaoEscolhida} onChange={(e) => setDotacaoEscolhida(e.target.value)}>
                    <option value="">Selecione…</option>
                    {dotacoesDisponiveis?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.elemento_despesa} — saldo {formatarMoeda(d.saldo)}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
              <Campo rotulo="Valor a reservar">
                <input
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </Campo>
              <div className="flex items-end">
                <Botao tamanho="sm" onClick={() => vincular.mutate()} carregando={vincular.isPending} disabled={!dotacaoEscolhida || !valor}>
                  Encaminhar à Contabilidade
                </Botao>
              </div>
            </div>
          )}
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Autorização" descricao="Decisão da autoridade competente" />
        <CartaoCorpo className="space-y-2">
          {podeDecidirAutorizacao && (
            <>
              <Campo rotulo="Justificativa (opcional)">
                <Textarea value={justificativaAutorizacao} onChange={(e) => setJustificativaAutorizacao(e.target.value)} className="min-h-16" />
              </Campo>
              <div className="flex gap-2">
                <Botao tamanho="sm" onClick={() => autorizar.mutate("autorizado")} carregando={autorizar.isPending}>
                  Autorizar
                </Botao>
                <Botao tamanho="sm" variante="perigo" onClick={() => autorizar.mutate("nao_autorizado")}>
                  Rejeitar
                </Botao>
              </div>
            </>
          )}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
