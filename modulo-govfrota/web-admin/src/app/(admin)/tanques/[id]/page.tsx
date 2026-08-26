"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { api, Movimentacao, ResumoTanque, Tanque } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

export default function PaginaTanque() {
  const { id } = useParams<{ id: string }>();
  const [tanque, setTanque] = useState<Tanque | null>(null);
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [resumo, setResumo] = useState<ResumoTanque | null>(null);

  const carregar = useCallback(async () => {
    try {
      setTanque(await api.getTanque(id));
      setMovs(await api.movimentacoesTanque(id));
      setResumo(await api.resumoTanque(id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!tanque) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  async function ajustar(positivo: boolean) {
    const quantidade = window.prompt(`Quantidade a ${positivo ? "acrescentar" : "reduzir"} (litros):`);
    if (!quantidade) return;
    const justificativa = window.prompt("Justificativa do ajuste:");
    if (!justificativa || justificativa.length < 5) return;
    try {
      await api.ajustarEstoque(tanque!.id, quantidade, positivo, justificativa);
      toast.success("Ajuste registrado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function inventario() {
    const fisico = window.prompt("Estoque físico conferido (litros):");
    if (!fisico) return;
    try {
      const inv = await api.registrarInventario({
        tanque_id: tanque!.id,
        estoque_fisico: fisico,
        data_conferencia: new Date().toISOString().slice(0, 10),
        observacao: "Conferência pela página do tanque",
      });
      const dif = Number(inv.diferenca);
      if (dif === 0) {
        toast.success("Sem diferença entre sistema e físico.");
        return;
      }
      const confirmar = window.confirm(
        `Estoque no sistema: ${Number(inv.estoque_sistema).toLocaleString("pt-BR")} L\n` +
        `Estoque físico: ${Number(inv.estoque_fisico).toLocaleString("pt-BR")} L\n` +
        `Diferença: ${dif > 0 ? "+" : ""}${dif.toLocaleString("pt-BR")} L\n\nAplicar ajuste?`
      );
      if (confirmar) {
        await api.aplicarInventario(inv.id, "Diferença confirmada em inventário físico.");
        toast.success("Ajuste aplicado.");
      }
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-4">
        <div>
          <h1 className="text-h2 text-text-title">{tanque.nome}</h1>
          <p className="text-body-sm text-text-subtle">
            {tanque.combustivel_nome} · Capacidade {Number(tanque.capacidade_maxima).toLocaleString("pt-BR")} L
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <div className="text-meta text-text-subtle">Estoque atual</div>
            <div className="text-h2 text-text-title">{Number(tanque.estoque_atual).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L</div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-bg">
              <div className={`h-full ${
                tanque.status_estoque === "CRITICO" ? "bg-[#B42318]" : tanque.status_estoque === "BAIXO" ? "bg-[#B54708]" : "bg-[#067647]"
              }`} style={{ width: `${Math.min(tanque.percentual_disponivel ?? 0, 100)}%` }} />
            </div>
            <div className="mt-1 text-meta text-text-body">{(tanque.percentual_disponivel ?? 0).toFixed(0)}% · mínimo {Number(tanque.estoque_minimo).toLocaleString("pt-BR")} L</div>
          </div>
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <div className="text-meta text-text-subtle">Consumo médio diário (30d)</div>
            <div className="text-h3 text-text-title">
              {resumo?.consumo_medio_diario_litros ? `${resumo.consumo_medio_diario_litros.toFixed(1)} L/dia` : "—"}
            </div>
            <div className="mt-2 text-meta text-text-subtle">Previsão informativa</div>
            <div className="text-h3 text-text-title">
              {resumo?.previsao_dias_restantes ? `~${Math.round(resumo.previsao_dias_restantes)} dias` : "—"}
            </div>
          </div>
          <RequirePermission perms="fuel.manage">
            <div className="flex flex-col gap-2 rounded-card border border-surface-border bg-white p-4 shadow-card">
              <button onClick={() => ajustar(true)} className="btn btn-secondary btn-sm">Ajuste (+) com justificativa</button>
              <button onClick={() => ajustar(false)} className="btn btn-secondary btn-sm">Ajuste (−) com justificativa</button>
              <button onClick={inventario} className="btn btn-primary btn-sm">Conferência de estoque</button>
            </div>
          </RequirePermission>
        </div>

        <div className="rounded-card border border-surface-border bg-white shadow-card">
          <h2 className="border-b border-surface-border px-4 py-3 text-label font-semibold text-text-title">Histórico de movimentações</h2>
          <ul className="divide-y divide-surface-border">
            {movs.length === 0 && <li className="px-4 py-6 text-center text-body-sm text-text-subtle">Sem movimentações.</li>}
            {movs.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between px-4 py-3 text-body-sm">
                <div>
                  <span className={`font-medium ${m.sinal > 0 ? "text-[#067647]" : "text-[#B42318]"}`}>
                    {m.sinal > 0 ? "+" : "−"}{Number(m.quantidade).toLocaleString("pt-BR")} L
                  </span>{" "}
                  <span className="text-text-body">{m.descricao ?? m.tipo}</span>
                </div>
                <div className="text-meta text-text-subtle">
                  {new Date(m.created_at).toLocaleString("pt-BR")}
                  {m.saldo_apos != null && <> · saldo {Number(m.saldo_apos).toLocaleString("pt-BR")} L</>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </RequirePermission>
  );
}
