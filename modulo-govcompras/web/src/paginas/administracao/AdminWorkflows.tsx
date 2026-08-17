import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio } from "@/ui";
import { ROTULOS_TIPO_PROCESSO } from "@/nucleo/tipos";

interface Requisito {
  id: string;
  tipo: string;
  descricao: string;
  obrigatorio: boolean;
}
interface Transicao {
  id: string;
  tipo: string;
  rotulo: string | null;
}
interface Etapa {
  id: string;
  ordem: number;
  codigo: string;
  nome: string;
  setor_papel_funcional: string | null;
  sla_dias: number;
  etapa_final: boolean;
  requisitos: Requisito[];
  transicoes_saida: Transicao[];
}
interface Template {
  id: string;
  tipo_processo: string;
  nome: string;
  versao: number;
  ativo: boolean;
  etapas: Etapa[];
}

export function AdminWorkflows() {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-workflows"],
    queryFn: () => api.get<Template[]>("/workflow/templates"),
  });

  const ativos = data?.filter((t) => t.ativo) ?? [];
  const template = data?.find((t) => t.id === selecionado) ?? ativos[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Workflows</h1>
        <p className="text-sm text-slate-500">
          Etapas, SLA e requisitos de avanço de cada modalidade (seções 14-19). Edição pela interface prevista para
          próxima fase — hoje configurável via API.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ativos.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelecionado(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              template?.id === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {ROTULOS_TIPO_PROCESSO[t.tipo_processo] ?? t.tipo_processo}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : !template ? (
        <EstadoVazio titulo="Nenhum workflow configurado" />
      ) : (
        <Cartao>
          <CartaoCabecalho titulo={template.nome} descricao={`Versão ${template.versao} — ${template.etapas.length} etapa(s)`} />
          <CartaoCorpo>
            <ol className="space-y-3">
              {[...template.etapas]
                .sort((a, b) => a.ordem - b.ordem)
                .map((etapa) => (
                  <li key={etapa.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {etapa.ordem}. {etapa.nome}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {etapa.etapa_final && <Chip cor="verde">Final</Chip>}
                        <Chip cor="neutro">SLA {etapa.sla_dias}d</Chip>
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Responsável: {etapa.setor_papel_funcional ?? "não definido"}
                    </p>
                    {etapa.requisitos.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {etapa.requisitos.map((r) => (
                          <li key={r.id} className="text-xs text-slate-500">
                            • {r.descricao} {!r.obrigatorio && "(opcional)"}
                          </li>
                        ))}
                      </ul>
                    )}
                    {etapa.transicoes_saida.filter((t) => t.tipo === "devolver").length > 0 && (
                      <p className="mt-1 text-xs text-amber-600">
                        Pode ser devolvida para: {etapa.transicoes_saida.filter((t) => t.tipo === "devolver").map((t) => t.rotulo).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
            </ol>
          </CartaoCorpo>
        </Cartao>
      )}
    </div>
  );
}
