/** Questionários — Instrumentos Técnico-Operativos */
import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { useQuestionarios, servicoQuestionarios } from "@/nucleo/api/servicosFase2";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function QuestionarioLista() {
  const { data, isLoading } = useQuestionarios();
  const qc = useQueryClient();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");

  const criarMut = useMutation({
    mutationFn: (corpo: any) => servicoQuestionarios.criar(corpo),
    onSuccess: () => { setMostrarForm(false); setNome(""); setDescricao(""); qc.invalidateQueries({ queryKey: ["questionarios"] }); },
  });

  if (isLoading) return <Skeleton variante="cartao" />;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Instrumentos Técnico-Operativos</h2>
        <button onClick={() => setMostrarForm(!mostrarForm)} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm"><Plus className="w-4 h-4" /> Novo</button>
      </div>

      {mostrarForm && (
        <div className="border rounded-lg p-4 space-y-2 bg-gray-50">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do questionário" className="w-full border p-2 rounded text-sm" />
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (opcional)" className="w-full border p-2 rounded text-sm" rows={2} />
          <button onClick={() => criarMut.mutate({ nome, descricao, questoes: [] })} disabled={!nome} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">Salvar</button>
        </div>
      )}

      {!data || data.length === 0 ? (
        <EstadoVazio titulo="Nenhum questionário" descricao="Crie instrumentos técnico-operativos personalizados" />
      ) : (
        <div className="space-y-2">
          {data.map(q => (
            <div key={q.id} className="border rounded-lg p-3">
              <div className="font-medium">{q.nome}</div>
              {q.descricao && <div className="text-sm text-gray-500">{q.descricao}</div>}
              <div className="text-xs text-gray-400 mt-1">{q.questoes.length} questões</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
