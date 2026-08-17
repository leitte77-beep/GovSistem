import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { usePermissao } from "@/nucleo/auth/usePermissao";
import { Botao, Cartao, CartaoCabecalho, Chip, EstadoVazio, Tabela, type ColunaTabela } from "@/ui";

interface Solicitacao {
  id: string;
  numero: string;
  objeto: string;
  status: string;
  prioridade: string;
  valor_estimado_total: number | null;
}

const STATUS_COR: Record<string, "neutro" | "azul" | "verde" | "vermelho"> = {
  rascunho: "neutro",
  enviada: "azul",
  em_processamento: "azul",
  atendida: "verde",
  cancelada: "vermelho",
};

export function SolicitacoesLista() {
  const navegar = useNavigate();
  const podeCriar = usePermissao("govcompras.solicitacoes.criar");

  const { data, isLoading } = useQuery({
    queryKey: ["solicitacoes"],
    queryFn: () => api.get<{ itens: Solicitacao[] }>("/solicitacoes", { por_pagina: 100 }),
  });

  const colunas: ColunaTabela<Solicitacao>[] = [
    { chave: "numero", cabecalho: "Número", renderizar: (s) => s.numero },
    { chave: "objeto", cabecalho: "Objeto", renderizar: (s) => <span className="max-w-sm truncate">{s.objeto}</span> },
    { chave: "prioridade", cabecalho: "Prioridade", renderizar: (s) => <span className="capitalize">{s.prioridade}</span> },
    { chave: "status", cabecalho: "Status", renderizar: (s) => <Chip cor={STATUS_COR[s.status] ?? "neutro"}>{s.status.replace("_", " ")}</Chip> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Solicitações</h1>
          <p className="text-sm text-slate-500">Pedidos de contratação enviados pelas secretarias</p>
        </div>
        {podeCriar && (
          <Botao icone={<Plus className="size-4" />} onClick={() => navegar("/solicitacoes/nova")}>
            Nova solicitação
          </Botao>
        )}
      </div>

      <Cartao>
        <CartaoCabecalho titulo={`${data?.itens.length ?? 0} solicitação(ões)`} />
        <Tabela
          colunas={colunas}
          itens={data?.itens ?? []}
          chavePorItem={(s) => s.id}
          carregando={isLoading}
          aoClicarLinha={(s) => navegar(`/solicitacoes/${s.id}`)}
          vazio={<EstadoVazio titulo="Nenhuma solicitação ainda" descricao="Crie a primeira solicitação de contratação." />}
        />
      </Cartao>
    </div>
  );
}
