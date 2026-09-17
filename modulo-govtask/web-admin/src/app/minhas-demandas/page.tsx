"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { PERM } from "@/lib/perfil";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { formatDate, daysUntil, cn } from "@/lib/utils";
import type { CaixaDoDepartamento, DemandaItem, Setor } from "@/types/govtask";
import { CheckCircle2, ChevronRight, Inbox, PlayCircle, Undo2, Clock } from "lucide-react";

/**
 * O lado do departamento: o que o assessor mandou, no estado em que está.
 * Três perguntas — o que chegou, o que estou fazendo, o que voltou para
 * corrigir — e a ação de devolver o trabalho pronto.
 */
function MinhasDemandasConteudo() {
  const [caixa, setCaixa] = useState<CaixaDoDepartamento | null>(null);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [setorId, setSetorId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [agindo, setAgindo] = useState<string | null>(null);

  const load = useCallback(async (setor?: string) => {
    try {
      setCaixa(await api.getMinhasDemandas(setor || undefined));
    } catch (e: any) {
      notify.error(e.message || "Não foi possível carregar suas demandas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.listSetores().then((s) => setSetores(s.filter((x) => x.ativo))).catch(() => {});
  }, []);

  useEffect(() => {
    load(setorId);
  }, [load, setorId]);

  const aceitar = async (id: string) => {
    setAgindo(id);
    try {
      await api.aceitarTarefa(id);
      notify.success("Demanda aceita — agora está com você");
      await load(setorId);
    } catch (e: any) {
      notify.error(e.message || "Não foi possível aceitar a demanda");
    } finally {
      setAgindo(null);
    }
  };

  const entregar = async (id: string) => {
    setAgindo(id);
    try {
      await api.entregarTarefa(id);
      notify.success("Entregue ao assessor para análise");
      await load(setorId);
    } catch (e: any) {
      notify.error(e.message || "Não foi possível entregar a demanda");
    } finally {
      setAgindo(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (!caixa) return null;

  const total =
    caixa.novas.length + caixa.em_andamento.length + caixa.devolvidas.length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[36px] font-bold text-[#101828] tracking-tight">
            Minhas demandas
          </h1>
          <p className="text-[14px] text-[#667085] mt-1">
            {total === 0
              ? "Nenhuma demanda pendente com você."
              : `${caixa.novas.length} nova(s) · ${caixa.em_andamento.length} em andamento · ${caixa.devolvidas.length} para corrigir`}
          </p>
        </div>
        {setores.length > 0 && (
          <select
            value={setorId}
            onChange={(e) => setSetorId(e.target.value)}
            className="rounded-lg border border-[#E4E7EC] bg-white px-3 py-2.5 text-[13px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
            aria-label="Incluir demandas do departamento"
          >
            <option value="">Somente minhas</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>Incluir {s.nome}</option>
            ))}
          </select>
        )}
      </div>

      <Grupo
        icone={<Undo2 className="w-[18px] h-[18px]" />}
        cor="#B54708"
        fundo="#FFFAEB"
        titulo="Voltaram para correção"
        descricao="O assessor pediu ajustes"
        itens={caixa.devolvidas}
        vazio=""
        acao={(d) => ({
          rotulo: "Entregar novamente",
          executar: () => entregar(d.id),
        })}
        agindo={agindo}
      />

      <Grupo
        icone={<Inbox className="w-[18px] h-[18px]" />}
        cor="#175CD3"
        fundo="#EFF8FF"
        titulo="Chegaram para você"
        descricao="Aceite para começar a trabalhar"
        itens={caixa.novas}
        vazio="Nenhuma demanda nova."
        acao={(d) => ({ rotulo: "Aceitar", executar: () => aceitar(d.id) })}
        agindo={agindo}
      />

      <Grupo
        icone={<PlayCircle className="w-[18px] h-[18px]" />}
        cor="#027A48"
        fundo="#ECFDF3"
        titulo="Em andamento"
        descricao="Quando terminar, entregue ao assessor"
        itens={caixa.em_andamento}
        vazio="Nada em andamento."
        acao={(d) => ({ rotulo: "Entregar", executar: () => entregar(d.id) })}
        agindo={agindo}
      />

      {caixa.aguardando_analise.length > 0 && (
        <Grupo
          icone={<Clock className="w-[18px] h-[18px]" />}
          cor="#475467"
          fundo="#F2F4F7"
          titulo="Aguardando o assessor"
          descricao="Já entregues, em análise"
          itens={caixa.aguardando_analise}
          vazio=""
          agindo={agindo}
        />
      )}

      {total === 0 && caixa.aguardando_analise.length === 0 && (
        <div className="bg-white border border-[#E4E7EC] rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-[#12B76A] mx-auto mb-3" />
          <h2 className="text-[16px] font-semibold text-[#101828]">Tudo em dia</h2>
          <p className="text-[14px] text-[#667085] mt-1.5 max-w-md mx-auto">
            Quando o assessor encaminhar uma demanda ao seu departamento, ela aparece aqui.
          </p>
        </div>
      )}
    </div>
  );
}

function Grupo({
  icone,
  cor,
  fundo,
  titulo,
  descricao,
  itens,
  vazio,
  acao,
  agindo,
}: {
  icone: React.ReactNode;
  cor: string;
  fundo: string;
  titulo: string;
  descricao: string;
  itens: DemandaItem[];
  vazio: string;
  acao?: (d: DemandaItem) => { rotulo: string; executar: () => void };
  agindo: string | null;
}) {
  if (itens.length === 0 && !vazio) return null;

  return (
    <div className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F2F4F7]">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: fundo, color: cor }}
        >
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-[#101828]">{titulo}</h2>
          <p className="text-[13px] text-[#667085]">{descricao}</p>
        </div>
        <span
          className="text-[20px] font-bold tabular-nums"
          style={{ color: itens.length ? cor : "#98A2B3" }}
        >
          {itens.length}
        </span>
      </div>

      {itens.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-[#667085]">{vazio}</p>
      ) : (
        <div className="divide-y divide-[#F2F4F7]">
          {itens.map((d) => {
            const a = acao?.(d);
            return (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                <Link href={`/tarefas/${d.id}`} className="min-w-0 flex-1 group">
                  <p className="text-[14px] font-medium text-[#101828] truncate group-hover:text-[#1D4ED8]">
                    {d.titulo}
                  </p>
                  <p className="text-[12px] text-[#667085] truncate mt-0.5">
                    {d.processo}
                    {d.setor ? ` · ${d.setor}` : ""}
                  </p>
                </Link>

                <div className="text-right shrink-0 hidden sm:block">
                  <p
                    className={cn(
                      "text-[12px]",
                      d.atrasada ? "text-[#B42318] font-medium" : "text-[#667085]"
                    )}
                  >
                    {prazoTexto(d)}
                  </p>
                  {(d.prazo_interno || d.prazo) && (
                    <p className="text-[11px] text-[#98A2B3]">
                      {formatDate(d.prazo_interno || d.prazo)}
                    </p>
                  )}
                </div>

                {a ? (
                  <button
                    type="button"
                    onClick={a.executar}
                    disabled={agindo === d.id}
                    className="px-3 py-2 rounded-lg bg-[#1D4ED8] text-white text-[13px] font-semibold hover:bg-[#1E40AF] disabled:opacity-60 transition-colors shrink-0"
                  >
                    {agindo === d.id ? "..." : a.rotulo}
                  </button>
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#98A2B3] shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function prazoTexto(d: DemandaItem): string {
  const prazo = d.prazo_interno || d.prazo;
  if (!prazo) return "sem prazo";
  const dias = daysUntil(prazo);
  if (dias < 0) return `${Math.abs(dias)}d de atraso`;
  if (dias === 0) return "vence hoje";
  return `em ${dias}d`;
}

export default function Page() {
  return (
    <RequirePermission anyOf={[PERM.VIEW]}>
      <MinhasDemandasConteudo />
    </RequirePermission>
  );
}
