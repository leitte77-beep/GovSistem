import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, CartaoCorpo, Tabela, EstadoVazio, EmDesenvolvimento, type ColunaTabela } from "@/ui";

interface LinhaGargalo {
  etapa: string;
  quantidade_processos: number;
  tempo_medio_dias: number;
  maior_tempo_dias: number;
}

export function Relatorios() {
  const { data, isLoading } = useQuery({
    queryKey: ["relatorios", "gargalos"],
    queryFn: () => api.get<LinhaGargalo[]>("/dashboard/gargalos"),
  });

  const colunas: ColunaTabela<LinhaGargalo>[] = [
    { chave: "etapa", cabecalho: "Etapa", renderizar: (l) => <span className="font-medium text-slate-800">{l.etapa}</span> },
    { chave: "quantidade", cabecalho: "Processos concluídos", renderizar: (l) => l.quantidade_processos },
    { chave: "medio", cabecalho: "Tempo médio", renderizar: (l) => `${l.tempo_medio_dias} dia(s)` },
    { chave: "maior", cabecalho: "Maior atraso já registrado", renderizar: (l) => `${l.maior_tempo_dias} dia(s)` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Relatórios</h1>
        <p className="text-sm text-slate-500">Onde o processo mais trava — e por quanto tempo, em média.</p>
      </div>

      <Cartao>
        <CartaoCabecalho
          titulo="Relatório de gargalos"
          descricao="Tempo médio e maior atraso por etapa, considerando etapas já concluídas ou devolvidas"
        />
        <Tabela
          colunas={colunas}
          itens={data ?? []}
          chavePorItem={(l) => l.etapa}
          carregando={isLoading}
          vazio={
            <EstadoVazio
              titulo="Ainda não há etapas concluídas suficientes"
              descricao="O relatório de gargalos aparece assim que processos avançarem ou forem devolvidos de etapa."
            />
          }
        />
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Outros relatórios" />
        <CartaoCorpo>
          <EmDesenvolvimento titulo="Processos por secretaria, economia, itens mais comprados e exportação em XLSX/PDF" />
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
