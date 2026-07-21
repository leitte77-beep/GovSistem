import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, Pencil, Eye } from "lucide-react";
import { useQuestionarios } from "@/nucleo/api/servicosFase2";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Botao } from "@/ui/Botao";

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export default function QuestionarioLista() {
  const { data, isLoading } = useQuestionarios();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton variante="cartao" />;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          Instrumentos Técnico-Operativos
        </h2>
        <Botao
          variante="primario"
          tamanho="sm"
          iconeInicio={<Plus className="w-4 h-4" />}
          onClick={() => navigate("/questionarios/novo/editar")}
        >
          Novo
        </Botao>
      </div>

      {!data || data.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum questionário"
          descricao="Crie instrumentos técnico-operativos personalizados para aplicar durante atendimentos"
          acao={{ rotulo: "Criar questionário", aoClicar: () => navigate("/questionarios/novo/editar") }}
        />
      ) : (
        <div className="rounded-cartao border border-outline-variant bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="text-left px-4 py-3 font-semibold text-ink-soft">Nome</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft hidden sm:table-cell">Descrição</th>
                <th className="text-center px-4 py-3 font-semibold text-ink-soft">Questões</th>
                <th className="text-left px-4 py-3 font-semibold text-ink-soft hidden md:table-cell">Criado em</th>
                <th className="text-right px-4 py-3 font-semibold text-ink-soft">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map((q) => (
                <tr
                  key={q.id}
                  className="border-b border-outline-variant/50 last:border-0 hover:bg-surface-container-low/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-ink">{q.nome}</td>
                  <td className="px-4 py-3 text-ink-soft hidden sm:table-cell max-w-[200px] truncate">
                    {q.descricao || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-ink">{q.questoes.length}</td>
                  <td className="px-4 py-3 text-ink-soft hidden md:table-cell">
                    {formatarData(q.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/questionarios/${q.id}/editar`)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => navigate(`/questionarios/${q.id}/respostas`)}
                        className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink px-2 py-1 transition-colors"
                        title="Visualizar respostas"
                      >
                        <Eye className="w-3.5 h-3.5" /> Respostas
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
