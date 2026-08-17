import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Send } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { ErroApi } from "@/nucleo/http/erroApi";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { ROTULOS_TIPO_PROCESSO } from "@/nucleo/tipos";
import { Botao, Campo, Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoErro, Select } from "@/ui";

interface SolicitacaoItem {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario_estimado: number | null;
}
interface Solicitacao {
  id: string;
  numero: string;
  objeto: string;
  justificativa: string;
  prioridade: string;
  status: string;
  valor_estimado_total: number | null;
  itens: SolicitacaoItem[];
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SolicitacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const podeEnviar = usePermissao("govcompras.solicitacoes.enviar");
  const [tipoProcesso, setTipoProcesso] = useState("pregao");
  const [erro, setErro] = useState<string | null>(null);

  const { data: solicitacao, isLoading } = useQuery({
    queryKey: ["solicitacao", id],
    queryFn: () => api.get<Solicitacao>(`/solicitacoes/${id}`),
    enabled: !!id,
  });

  const enviar = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/solicitacoes/${id}/enviar`, { tipo_processo: tipoProcesso }),
    onSuccess: (processo) => {
      toast.success("Solicitação enviada — processo aberto.");
      navegar(`/processos/${processo.id}`);
    },
    onError: (e: unknown) => setErro(e instanceof ErroApi ? e.message : "Não foi possível enviar a solicitação."),
  });

  if (isLoading || !solicitacao) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Solicitação {solicitacao.numero}</h1>
        <p className="text-sm text-slate-600">{solicitacao.objeto}</p>
      </div>

      {erro && <EstadoErro mensagem={erro} />}

      <Cartao>
        <CartaoCabecalho titulo="Detalhes" acoes={<Chip cor="azul">{solicitacao.status.replace("_", " ")}</Chip>} />
        <CartaoCorpo className="space-y-2 text-sm text-slate-700">
          <p>
            <strong>Justificativa:</strong> {solicitacao.justificativa}
          </p>
          <p className="capitalize">
            <strong>Prioridade:</strong> {solicitacao.prioridade}
          </p>
          {solicitacao.valor_estimado_total !== null && (
            <p>
              <strong>Valor estimado:</strong> {formatarMoeda(solicitacao.valor_estimado_total)}
            </p>
          )}
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Itens" />
        <CartaoCorpo>
          {solicitacao.itens.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum item informado.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="pb-1">Descrição</th>
                  <th className="pb-1">Qtd.</th>
                  <th className="pb-1">Valor unit.</th>
                </tr>
              </thead>
              <tbody>
                {solicitacao.itens.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-1.5">{item.descricao}</td>
                    <td className="py-1.5">
                      {item.quantidade} {item.unidade}
                    </td>
                    <td className="py-1.5">{item.valor_unitario_estimado ? formatarMoeda(item.valor_unitario_estimado) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CartaoCorpo>
      </Cartao>

      {solicitacao.status === "rascunho" && podeEnviar && (
        <Cartao>
          <CartaoCabecalho titulo="Enviar para Compras" descricao="Escolha a modalidade de contratação para abrir o processo" />
          <CartaoCorpo className="space-y-3">
            <Campo rotulo="Modalidade">
              <Select value={tipoProcesso} onChange={(e) => setTipoProcesso(e.target.value)}>
                {Object.entries(ROTULOS_TIPO_PROCESSO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Botao icone={<Send className="size-4" />} onClick={() => enviar.mutate()} carregando={enviar.isPending}>
              Enviar solicitação
            </Botao>
          </CartaoCorpo>
        </Cartao>
      )}
    </div>
  );
}
