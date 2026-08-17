import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio } from "@/ui";

interface AtaItem {
  id: string;
  descricao: string;
  valor_unitario_registrado: number;
  quantidade_registrada: number;
  quantidade_reservada: number;
  quantidade_utilizada: number;
  quantidade_disponivel: number;
  percentual_consumido: number;
}
interface Ata {
  id: string;
  numero: string;
  objeto: string;
  vigencia_inicio: string;
  vigencia_fim: string;
  status: string;
  itens: AtaItem[];
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AtaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data: ata, isLoading } = useQuery({
    queryKey: ["ata", id],
    queryFn: () => api.get<Ata>(`/atas/${id}`),
    enabled: !!id,
  });

  if (isLoading || !ata) return <p className="text-sm text-slate-400">Carregando…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Ata {ata.numero}</h1>
          <Chip cor={ata.status === "vigente" ? "verde" : "neutro"}>{ata.status}</Chip>
        </div>
        <p className="text-sm text-slate-600">{ata.objeto}</p>
        <p className="text-xs text-slate-400">
          Vigência: {new Date(ata.vigencia_inicio).toLocaleDateString("pt-BR")} a {new Date(ata.vigencia_fim).toLocaleDateString("pt-BR")}
        </p>
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Saldo por item" descricao="Registrado, reservado, utilizado e disponível" />
        <CartaoCorpo>
          {ata.itens.length === 0 ? (
            <EstadoVazio titulo="Nenhum item registrado" />
          ) : (
            <ul className="space-y-3">
              {ata.itens.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">{item.descricao}</p>
                    <span className="text-xs text-slate-500">{formatarMoeda(item.valor_unitario_registrado)} / un.</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${item.percentual_consumido >= 90 ? "bg-red-500" : item.percentual_consumido >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, item.percentual_consumido)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.percentual_consumido}% consumido · disponível: {item.quantidade_disponivel} de {item.quantidade_registrada}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
