import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/nucleo/http/clienteHttp";
import { Cartao, CartaoCabecalho, CartaoCorpo, Chip, EstadoVazio, Select } from "@/ui";

interface Contrato {
  id: string;
  numero: string;
  objeto: string;
  dias_para_vencer: number;
}

function corAlerta(dias: number): "vermelho" | "laranja" | "amarelo" | "neutro" {
  if (dias <= 15) return "vermelho";
  if (dias <= 30) return "laranja";
  if (dias <= 90) return "amarelo";
  return "neutro";
}

export function Vencimentos() {
  const [janela, setJanela] = useState("180");

  const { data: contratos, isLoading: carregandoContratos } = useQuery({
    queryKey: ["contratos-vencendo", janela],
    queryFn: () => api.get<Contrato[]>("/contratos/vencendo", { dias: janela }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Central de Vencimentos</h1>
          <p className="text-sm text-slate-500">Contratos que precisam de decisão antes do vencimento (seção 49-50)</p>
        </div>
        <Select value={janela} onChange={(e) => setJanela(e.target.value)} className="w-auto">
          <option value="30">Próximos 30 dias</option>
          <option value="60">Próximos 60 dias</option>
          <option value="90">Próximos 90 dias</option>
          <option value="180">Próximos 180 dias</option>
        </Select>
      </div>

      <Cartao>
        <CartaoCabecalho titulo="Contratos vencendo" />
        <CartaoCorpo>
          {carregandoContratos ? (
            <p className="text-xs text-slate-400">Carregando…</p>
          ) : !contratos?.length ? (
            <EstadoVazio titulo="Nenhum contrato vencendo nesta janela" />
          ) : (
            <ul className="space-y-2">
              {contratos.map((c) => (
                <li key={c.id}>
                  <Link to={`/contratos/${c.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Contrato {c.numero} — {c.objeto}
                      </p>
                      <p className="text-xs text-slate-500">
                        Defina agora se haverá nova contratação ou encerramento.
                      </p>
                    </div>
                    <Chip cor={corAlerta(c.dias_para_vencer)}>Vence em {c.dias_para_vencer} dia(s)</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
