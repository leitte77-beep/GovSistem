/** Exportador de Dados — execução de consultas SQL parametrizadas */
import { useState } from "react";
import { Download, Database } from "lucide-react";
import { servicoExportador } from "@/nucleo/api/servicosFase2";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoVazio } from "@/ui/EstadoVazio";

export default function ExportadorDados() {
  const { data, isLoading } = useQuery({ queryKey: ["exportadores"], queryFn: () => servicoExportador.listar() });
  const [executando, setExecutando] = useState<string | null>(null);
  const [params] = useState<Record<string, string>>({});

  const executar = async (id: string) => {
    setExecutando(id);
    try {
      const blob = await servicoExportador.executar(id, params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exportacao-${id.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro na exportação");
    }
    setExecutando(null);
  };

  if (isLoading) return <Skeleton variante="cartao" />;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Database className="w-5 h-5" /> Exportador de Dados</h2>
      {!data || data.length === 0 ? (
        <EstadoVazio titulo="Nenhum exportador configurado" descricao="O administrador deve cadastrar exportadores de dados." />
      ) : (
        <div className="space-y-2">
          {data.map((exp: any) => (
            <div key={exp.id} className="border rounded-lg p-4 flex justify-between items-center">
              <div>
                <div className="font-medium">{exp.nome}</div>
                {exp.descricao && <div className="text-xs text-gray-500">{exp.descricao}</div>}
              </div>
              <button onClick={() => executar(exp.id)} disabled={executando === exp.id}
                className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50">
                <Download className="w-4 h-4" /> {executando === exp.id ? "..." : "Exportar CSV"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
