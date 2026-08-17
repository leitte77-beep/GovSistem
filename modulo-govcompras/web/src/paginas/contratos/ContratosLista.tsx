import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, ChipStatus, EstadoVazio, Select, Tabela, type ColunaTabela } from "@/ui";

interface Contrato {
  id: string;
  numero: string;
  objeto: string;
  fornecedor_nome: string | null;
  valor_global: number;
  vigencia_fim: string;
  dias_para_vencer: number;
  percentual_vigencia_transcorrida: number;
  status: string;
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ContratosLista() {
  const navegar = useNavigate();
  const [parametros, definirParametros] = useSearchParams();
  const status = parametros.get("status") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["contratos", status],
    queryFn: () => api.get<Contrato[]>("/contratos", { status_contrato: status || undefined }),
  });

  const colunas: ColunaTabela<Contrato>[] = [
    { chave: "numero", cabecalho: "Contrato", renderizar: (c) => <span className="font-medium text-slate-800">{c.numero}</span> },
    { chave: "objeto", cabecalho: "Objeto", renderizar: (c) => <span className="max-w-xs truncate">{c.objeto}</span> },
    { chave: "fornecedor", cabecalho: "Fornecedor", renderizar: (c) => c.fornecedor_nome ?? "—" },
    { chave: "valor", cabecalho: "Valor global", renderizar: (c) => formatarMoeda(c.valor_global) },
    {
      chave: "vigencia",
      cabecalho: "Vigência",
      renderizar: (c) => (
        <div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${c.dias_para_vencer <= 30 ? "bg-red-500" : c.dias_para_vencer <= 90 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, c.percentual_vigencia_transcorrida)}%` }}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {c.dias_para_vencer >= 0 ? `Vence em ${c.dias_para_vencer} dia(s)` : `Venceu há ${-c.dias_para_vencer} dia(s)`}
          </p>
        </div>
      ),
    },
    { chave: "status", cabecalho: "Status", renderizar: (c) => <ChipStatus status={c.status} /> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Contratos</h1>
        <p className="text-sm text-slate-500">Gestão contratual — o processo continua vivo após a assinatura</p>
      </div>

      <Select value={status} onChange={(e) => definirParametros(e.target.value ? { status: e.target.value } : {})} className="w-auto">
        <option value="">Todos os status</option>
        <option value="vigente">Vigentes</option>
        <option value="encerrado">Encerrados</option>
        <option value="rescindido">Rescindidos</option>
      </Select>

      <Cartao>
        <CartaoCabecalho titulo={`${data?.length ?? 0} contrato(s)`} />
        <Tabela
          colunas={colunas}
          itens={data ?? []}
          chavePorItem={(c) => c.id}
          carregando={isLoading}
          aoClicarLinha={(c) => navegar(`/contratos/${c.id}`)}
          vazio={<EstadoVazio titulo="Nenhum contrato encontrado" />}
        />
      </Cartao>
    </div>
  );
}
