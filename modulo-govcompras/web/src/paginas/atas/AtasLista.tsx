import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, Chip, EstadoVazio, Tabela, type ColunaTabela } from "@/ui";

interface Ata {
  id: string;
  numero: string;
  objeto: string;
  vigencia_fim: string;
  dias_para_vencer: number;
  status: string;
}

export function AtasLista() {
  const navegar = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["atas"],
    queryFn: () => api.get<Ata[]>("/atas"),
  });

  const colunas: ColunaTabela<Ata>[] = [
    { chave: "numero", cabecalho: "Ata", renderizar: (a) => <span className="font-medium text-slate-800">{a.numero}</span> },
    { chave: "objeto", cabecalho: "Objeto", renderizar: (a) => <span className="max-w-md truncate">{a.objeto}</span> },
    { chave: "vigencia", cabecalho: "Vigência até", renderizar: (a) => new Date(a.vigencia_fim).toLocaleDateString("pt-BR") },
    {
      chave: "status",
      cabecalho: "Status",
      renderizar: (a) => <Chip cor={a.status === "vigente" ? "verde" : "neutro"}>{a.status === "vigente" ? "Vigente" : "Encerrada"}</Chip>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Atas de Registro de Preços</h1>
        <p className="text-sm text-slate-500">Saldo por item, consumo e vigência (seções 57-59)</p>
      </div>

      <Cartao>
        <CartaoCabecalho titulo={`${data?.length ?? 0} ata(s)`} />
        <Tabela
          colunas={colunas}
          itens={data ?? []}
          chavePorItem={(a) => a.id}
          carregando={isLoading}
          aoClicarLinha={(a) => navegar(`/atas/${a.id}`)}
          vazio={<EstadoVazio titulo="Nenhuma ata cadastrada" />}
        />
      </Cartao>
    </div>
  );
}
