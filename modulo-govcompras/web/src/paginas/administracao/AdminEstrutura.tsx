import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import type { Secretaria, Setor } from "@/nucleo/tipos";
import { Cartao, CartaoCabecalho, CartaoCorpo, Chip } from "@/ui";

export function AdminEstrutura() {
  const { data: secretarias } = useQuery({
    queryKey: ["secretarias"],
    queryFn: () => api.get<Secretaria[]>("/secretarias"),
  });
  const { data: setores } = useQuery({
    queryKey: ["setores-todos"],
    queryFn: () => api.get<Setor[]>("/setores"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Secretarias e Setores</h1>
        <p className="text-sm text-slate-500">Estrutura organizacional (seção 81): Prefeitura → Secretaria → Setor</p>
      </div>

      {secretarias?.map((secretaria) => (
        <Cartao key={secretaria.id}>
          <CartaoCabecalho titulo={secretaria.nome} descricao={`Sigla: ${secretaria.sigla}`} />
          <CartaoCorpo>
            <div className="flex flex-wrap gap-1.5">
              {setores
                ?.filter((s) => s.secretaria_id === secretaria.id)
                .map((setor) => (
                  <Chip key={setor.id} cor="neutro">
                    {setor.nome}
                    {setor.papel_funcional && <span className="ml-1 text-slate-400">· {setor.papel_funcional}</span>}
                  </Chip>
                ))}
              {!setores?.some((s) => s.secretaria_id === secretaria.id) && (
                <p className="text-xs text-slate-400">Nenhum setor cadastrado.</p>
              )}
            </div>
          </CartaoCorpo>
        </Cartao>
      ))}
    </div>
  );
}
