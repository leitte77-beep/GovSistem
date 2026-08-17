import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, RotateCcw, XCircle } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import type { HistoricoEtapa } from "@/nucleo/tipos";
import { EstadoVazio, SkeletonLinhas } from "@/ui";

const ICONE_RESULTADO: Record<string, React.ReactNode> = {
  avancou: <CheckCircle2 className="size-4 text-emerald-500" />,
  devolvida: <RotateCcw className="size-4 text-amber-500" />,
  cancelada: <XCircle className="size-4 text-red-500" />,
  em_andamento: <CircleDot className="size-4 text-brand-500" />,
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AbaHistorico({ processoId }: { processoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["processo", processoId, "historico"],
    queryFn: () => api.get<{ itens: HistoricoEtapa[] }>(`/processos/${processoId}/historico`),
  });

  if (isLoading) return <SkeletonLinhas quantidade={5} />;
  if (!data?.itens.length) return <EstadoVazio titulo="Sem histórico ainda" />;

  return (
    <ol className="space-y-0">
      {data.itens.map((item, indice) => (
        <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
          {indice < data.itens.length - 1 && (
            <span className="absolute left-[7px] top-5 h-full w-px bg-slate-200" aria-hidden />
          )}
          <span className="z-10 mt-0.5 shrink-0 rounded-full bg-white">{ICONE_RESULTADO[item.resultado] ?? <CircleDot className="size-4 text-slate-300" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">{item.etapa_nome}</p>
            <p className="text-xs text-slate-500">
              {item.responsavel_setor ?? "sem setor definido"}
              {item.responsavel_usuario ? ` · ${item.responsavel_usuario}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Iniciada em {formatarData(item.iniciada_em)}
              {item.encerrada_em ? ` · encerrada em ${formatarData(item.encerrada_em)}` : " · em andamento"}
              {item.dias_na_etapa !== null && !item.encerrada_em ? ` (${item.dias_na_etapa} dia(s))` : ""}
            </p>
            {item.justificativa && (
              <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">"{item.justificativa}"</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
