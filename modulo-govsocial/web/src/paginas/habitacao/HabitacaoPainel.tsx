/** Módulo Habitacional — Programas e Demandas */
import { useState } from "react";
import { Building2 } from "lucide-react";
import { useProgramasHabitacionais, useDemandas, servicoHabitacional } from "@/nucleo/api/servicosFase2";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoVazio } from "@/ui/EstadoVazio";

export default function HabitacaoPainel() {
  const [aba, setAba] = useState<"programas" | "demandas" | "classificacao">("programas");
  const { data: programas, isLoading: carregandoProg } = useProgramasHabitacionais();
  const { data: demandas, isLoading: carregandoDem } = useDemandas();
  const [classificacao, setClassificacao] = useState<any[]>([]);
  const [carregandoClass, setCarregandoClass] = useState(false);

  const carregarClassificacao = async () => {
    setCarregandoClass(true);
    const data = await servicoHabitacional.classificar();
    setClassificacao(data);
    setCarregandoClass(false);
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><Building2 className="w-5 h-5" /> Módulo Habitacional</h2>
      <div className="flex gap-2 border-b pb-2">
        {(["programas", "demandas", "classificacao"] as const).map(a => (
          <button key={a} onClick={() => { setAba(a); if (a === "classificacao") carregarClassificacao(); }}
            className={`px-3 py-1 rounded-t text-sm ${aba === a ? "bg-blue-100 font-medium" : "hover:bg-gray-100"}`}>
            {a === "programas" ? "Programas" : a === "demandas" ? "Demandas" : "Classificação"}
          </button>
        ))}
      </div>

      {aba === "programas" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {carregandoProg ? <Skeleton variante="cartao" /> :
            programas?.map(p => (
              <div key={p.id} className="border rounded-lg p-4">
                <div className="font-medium">{p.nome}</div>
                <div className="text-xs text-gray-500">{p.esfera}</div>
                {p.criterios && <pre className="text-xs mt-2 bg-gray-50 p-2 rounded">{JSON.stringify(p.criterios, null, 2)}</pre>}
              </div>
            ))}
          {!programas?.length && <EstadoVazio titulo="Nenhum programa" descricao="Cadastre programas habitacionais" />}
        </div>
      )}

      {aba === "demandas" && (
        <div>
          {carregandoDem ? <Skeleton variante="cartao" /> : (
            <table className="w-full text-sm border">
              <thead><tr className="bg-gray-100"><th className="p-2 text-left">Família</th><th>Tipo</th><th>Programa</th><th>Status</th></tr></thead>
              <tbody>
                {demandas?.map(d => (
                  <tr key={d.id} className="border-t"><td className="p-2">{d.family_id?.slice(0,8)}</td><td className="p-2">{d.tipo_demanda}</td><td className="p-2">{d.programa?.nome || "-"}</td><td className="p-2">{d.status}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === "classificacao" && (
        <div>
          {carregandoClass ? <Skeleton variante="cartao" /> : (
            <table className="w-full text-sm border">
              <thead><tr className="bg-gray-100"><th className="p-2">#</th><th>Família</th><th>Responsável</th><th>Tipo</th><th>Membros</th><th>Pontuação</th></tr></thead>
              <tbody>
                {classificacao.map((c: any) => (
                  <tr key={c.demanda_id} className="border-t">
                    <td className="p-2 font-bold">{c.posicao}</td><td className="p-2">{c.familia_codigo}</td>
                    <td className="p-2">{c.responsavel}</td><td className="p-2">{c.tipo_demanda}</td>
                    <td className="p-2">{c.total_membros}</td><td className="p-2 font-bold text-blue-600">{c.pontuacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
