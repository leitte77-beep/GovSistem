/** Página de Renda e Despesas Familiares */

import { useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useRenda, servicoRenda } from "@/nucleo/api/servicosFase2";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { Skeleton } from "@/ui/Skeleton";
import { EstadoErro } from "@/ui/EstadoErro";
import { useQueryClient } from "@tanstack/react-query";

export default function RendaFamiliar() {
  const { familiaId } = useParams<{ familiaId: string }>();
  const { data, isLoading, isError, refetch } = useRenda(familiaId!);
  const podeEditar = usePermissao("beneficio.conceder");
  const qc = useQueryClient();

  if (isLoading) return <Skeleton variante="cartao" />;
  if (isError || !data) return <EstadoErro problema={undefined} aoTentarNovamente={refetch} />;

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-xl font-bold">Renda e Despesas</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Cartao label="Total Membros" valor={data.total_membros} />
        <Cartao label="Renda Total" valor={`R$ ${data.renda_familiar_total.toFixed(2)}`} />
        <Cartao label="Renda Per Capita" valor={`R$ ${data.renda_per_capita.toFixed(2)}`} destaque />
        <Cartao label="Total Despesas" valor={`R$ ${data.total_despesas.toFixed(2)}`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-2">Rendas por Membro</h3>
          <table className="w-full text-sm border">
            <thead><tr className="bg-gray-100"><th className="p-2 text-left">Membro</th><th>Tipo</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {data.rendas.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.person_id.slice(0,8)}</td><td className="p-2">{r.tipo}</td>
                  <td className="p-2">R$ {r.valor.toFixed(2)}</td>
                  <td className="p-2">{podeEditar && <button onClick={async () => { await servicoRenda.removerRenda(r.person_id, r.id); qc.invalidateQueries({ queryKey: ["renda"] }); }}><Trash2 className="w-4 h-4 text-red-500" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Despesas</h3>
          <table className="w-full text-sm border">
            <thead><tr className="bg-gray-100"><th className="p-2 text-left">Tipo</th><th>Valor</th></tr></thead>
            <tbody>
              {data.despesas.map(d => (
                <tr key={d.id} className="border-t"><td className="p-2">{d.tipo}</td><td className="p-2">R$ {d.valor.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Cartao({ label, valor, destaque }: { label: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${destaque ? "border-blue-400 bg-blue-50" : "bg-white"}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${destaque ? "text-blue-700" : ""}`}>{valor}</div>
    </div>
  );
}
