import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio } from "@/ui";

interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  representante: string | null;
  situacao: string;
}

export function FornecedorDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data: fornecedor, isLoading } = useQuery({
    queryKey: ["fornecedor", id],
    queryFn: () => api.get<Fornecedor>(`/fornecedores/${id}`),
    enabled: !!id,
  });

  if (isLoading || !fornecedor) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{fornecedor.razao_social}</h1>
        <p className="text-sm text-slate-500">{fornecedor.cnpj}</p>
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Dados cadastrais" acoes={<Chip cor={fornecedor.situacao === "ativo" ? "verde" : "neutro"}>{fornecedor.situacao}</Chip>} />
        <CartaoCorpo className="grid grid-cols-2 gap-3 text-sm text-slate-700">
          <p>
            <strong>Nome fantasia:</strong> {fornecedor.nome_fantasia ?? "—"}
          </p>
          <p>
            <strong>Representante:</strong> {fornecedor.representante ?? "—"}
          </p>
          <p>
            <strong>Município/UF:</strong> {fornecedor.municipio ? `${fornecedor.municipio}/${fornecedor.uf}` : "—"}
          </p>
          <p>
            <strong>Telefone:</strong> {fornecedor.telefone ?? "—"}
          </p>
          <p className="col-span-2">
            <strong>E-mail:</strong> {fornecedor.email ?? "—"}
          </p>
          <p className="col-span-2">
            <strong>Endereço:</strong> {fornecedor.endereco ?? "—"}
          </p>
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Documentos e certidões" />
        <CartaoCorpo>
          <EstadoVazio
            titulo="Nenhum documento anexado"
            descricao="Upload de certidões com alerta de vencimento previsto para próxima fase."
          />
        </CartaoCorpo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho titulo="Histórico" descricao="Cotações, licitações, contratos e atas (seção 29)" />
        <CartaoCorpo>
          <EstadoVazio titulo="Consolidação do histórico prevista para próxima fase" descricao="Hoje o histórico pode ser conferido processo a processo, na aba Licitação e em Contratos." />
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
