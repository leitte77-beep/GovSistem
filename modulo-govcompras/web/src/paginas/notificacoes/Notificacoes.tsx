import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import type { Notificacao } from "@/nucleo/tipos";
import { Cartao, CartaoCorpo, EstadoVazio, Chip } from "@/ui";

function linkDaEntidade(n: Notificacao): string | null {
  if (n.entidade_tipo === "processo" && n.entidade_id) return `/processos/${n.entidade_id}`;
  return n.link;
}

export function Notificacoes() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notificacoes", "todas"],
    queryFn: () => api.get<Notificacao[]>("/notificacoes"),
  });

  const marcarLida = useMutation({
    mutationFn: (id: string) => api.post(`/notificacoes/${id}/marcar-lida`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
    },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Notificações</h1>
        <p className="text-sm text-slate-500">Etapas atribuídas, devoluções, menções e alertas de vencimento</p>
      </div>

      <Cartao>
        <CartaoCorpo>
          {!data?.length ? (
            <EstadoVazio titulo="Nenhuma notificação" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.map((n) => {
                const destino = linkDaEntidade(n);
                const conteudo = (
                  <div
                    className={`flex items-start justify-between gap-3 px-1 py-3 ${n.situacao === "nao_lida" ? "" : "opacity-60"}`}
                    onClick={() => n.situacao === "nao_lida" && marcarLida.mutate(n.id)}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{n.titulo}</p>
                      <p className="text-xs text-slate-500">{n.mensagem}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                    {n.situacao === "nao_lida" && <Chip cor="azul">Nova</Chip>}
                  </div>
                );
                return <li key={n.id}>{destino ? <Link to={destino}>{conteudo}</Link> : conteudo}</li>;
              })}
            </ul>
          )}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
