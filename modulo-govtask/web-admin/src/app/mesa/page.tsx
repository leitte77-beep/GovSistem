"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { EncaminharDemanda } from "@/components/EncaminharDemanda";
import { PERM } from "@/lib/perfil";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { formatDate, daysUntil, cn } from "@/lib/utils";
import type { MesaDoAssessor, DemandaItem, ProcessoPendente } from "@/types/govtask";
import {
  Inbox,
  Undo2,
  Building2,
  Send,
  Landmark,
  Clock,
  ChevronRight,
  Plus,
  CheckCircle2,
} from "lucide-react";

/**
 * A mesa de trabalho do assessor, na ordem do fluxo:
 * o que voltou para mim → o que devolvi → o que está nos departamentos →
 * o que preciso protocolar → o que está com o governo.
 */
function MesaConteudo() {
  const [mesa, setMesa] = useState<MesaDoAssessor | null>(null);
  const [loading, setLoading] = useState(true);
  const [encaminhar, setEncaminhar] = useState<{ id: string; titulo: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setMesa(await api.getMesa());
    } catch (e: any) {
      notify.error(e.message || "Não foi possível carregar a mesa");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!mesa) return null;

  const totalNosSetores = mesa.nos_setores.reduce((s, x) => s + x.total, 0);
  const atrasadasTotal = mesa.nos_setores.reduce((s, x) => s + x.atrasadas, 0);
  const tudoEmDia =
    mesa.para_analisar.length === 0 &&
    mesa.devolvidas.length === 0 &&
    totalNosSetores === 0 &&
    mesa.para_protocolar.length === 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-[28px] leading-[36px] font-bold text-[#101828] tracking-tight">
          Minha mesa
        </h1>
        <p className="text-[14px] text-[#667085] mt-1">
          {tudoEmDia
            ? "Nada aguardando você no momento."
            : `${mesa.para_analisar.length} para analisar · ${totalNosSetores} nos departamentos${
                atrasadasTotal ? ` (${atrasadasTotal} em atraso)` : ""
              } · ${mesa.para_protocolar.length} para protocolar`}
        </p>
      </div>

      {/* 1 — Voltou do departamento, preciso conferir */}
      <Bloco
        icone={<Inbox className="w-[18px] h-[18px]" />}
        titulo="Preciso analisar"
        descricao="O departamento entregou e aguarda seu aceite"
        cor="#175CD3"
        fundo="#EFF8FF"
        contagem={mesa.para_analisar.length}
        vazio="Nenhuma entrega aguardando análise."
      >
        {mesa.para_analisar.map((d) => (
          <LinhaDemanda key={d.id} d={d} acao="Analisar" />
        ))}
      </Bloco>

      {/* 2 — Está com os departamentos */}
      <div className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F2F4F7]">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#F2F4F7] text-[#475467]">
            <Building2 className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[#101828]">Nos departamentos</h2>
            <p className="text-[13px] text-[#667085]">Demandas que você encaminhou e ainda não voltaram</p>
          </div>
          <span className="text-[20px] font-bold text-[#101828] tabular-nums">{totalNosSetores}</span>
        </div>

        {mesa.nos_setores.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-[#667085]">
            Nenhuma demanda em andamento nos departamentos. Abra um processo e use{" "}
            <span className="font-medium text-[#344054]">Encaminhar</span> para distribuir o trabalho.
          </p>
        ) : (
          <div className="divide-y divide-[#F2F4F7]">
            {mesa.nos_setores.map((s) => (
              <details key={s.setor_id || s.setor} className="group">
                <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#F9FAFB] list-none">
                  <ChevronRight className="w-4 h-4 text-[#98A2B3] transition-transform group-open:rotate-90 shrink-0" />
                  <span className="text-[14px] font-medium text-[#101828] flex-1 min-w-0 truncate">
                    {s.setor}
                  </span>
                  {s.atrasadas > 0 && (
                    <span className="text-[12px] font-medium px-2 py-0.5 rounded-pill bg-[#FEF3F2] text-[#B42318]">
                      {s.atrasadas} em atraso
                    </span>
                  )}
                  <span className="text-[14px] font-semibold text-[#344054] tabular-nums w-6 text-right">
                    {s.total}
                  </span>
                </summary>
                <div className="pb-2">
                  {s.demandas.map((d) => (
                    <LinhaDemanda key={d.id} d={d} acao="Abrir" recuada />
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* 3 — Devolvi para correção */}
      {mesa.devolvidas.length > 0 && (
        <Bloco
          icone={<Undo2 className="w-[18px] h-[18px]" />}
          titulo="Devolvidas para correção"
          descricao="Você pediu ajustes e aguarda o retorno"
          cor="#B54708"
          fundo="#FFFAEB"
          contagem={mesa.devolvidas.length}
          vazio=""
        >
          {mesa.devolvidas.map((d) => (
            <LinhaDemanda key={d.id} d={d} acao="Acompanhar" />
          ))}
        </Bloco>
      )}

      {/* 4 — Preciso protocolar no governo */}
      <Bloco
        icone={<Send className="w-[18px] h-[18px]" />}
        titulo="Preciso protocolar no governo"
        descricao="Processos ainda sem número de protocolo externo"
        cor="#6941C6"
        fundo="#F4F3FF"
        contagem={mesa.para_protocolar.length}
        vazio="Todos os processos ativos já têm protocolo registrado."
      >
        {mesa.para_protocolar.map((p) => (
          <LinhaProcesso
            key={p.id}
            p={p}
            acao="Registrar protocolo"
            onEncaminhar={() => setEncaminhar({ id: p.id, titulo: p.titulo })}
          />
        ))}
      </Bloco>

      {/* 5 — Com o governo */}
      {mesa.aguardando_governo.length > 0 && (
        <Bloco
          icone={<Landmark className="w-[18px] h-[18px]" />}
          titulo="Aguardando o governo"
          descricao="Etapas encaminhadas ao órgão concedente"
          cor="#027A48"
          fundo="#ECFDF3"
          contagem={mesa.aguardando_governo.length}
          vazio=""
        >
          {mesa.aguardando_governo.map((p) => (
            <LinhaProcesso key={p.id} p={p} acao="Ver processo" />
          ))}
        </Bloco>
      )}

      {/* 6 — Prazos e esquecidos */}
      {(mesa.prazos_criticos.length > 0 || mesa.sem_movimentacao.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mesa.prazos_criticos.length > 0 && (
            <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-[18px] h-[18px] text-[#B42318]" />
                <h2 className="text-[15px] font-semibold text-[#101828]">Prazos críticos</h2>
              </div>
              <div className="space-y-1.5">
                {mesa.prazos_criticos.slice(0, 6).map((d) => (
                  <Link
                    key={d.id}
                    href={`/tarefas/${d.id}`}
                    className="flex items-center gap-3 text-[13px] hover:bg-[#F9FAFB] rounded-lg px-2 py-1.5 -mx-2"
                  >
                    <span className="flex-1 min-w-0 truncate text-[#344054]">{d.titulo}</span>
                    <span className={cn("text-[12px] shrink-0", d.atrasada ? "text-[#B42318] font-medium" : "text-[#B54708]")}>
                      {prazoTexto(d)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {mesa.sem_movimentacao.length > 0 && (
            <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-[18px] h-[18px] text-[#98A2B3]" />
                <h2 className="text-[15px] font-semibold text-[#101828]">Processos parados</h2>
              </div>
              <div className="space-y-1.5">
                {mesa.sem_movimentacao.slice(0, 6).map((p) => (
                  <Link
                    key={p.id}
                    href={`/convenios/${p.id}`}
                    className="flex items-center gap-3 text-[13px] hover:bg-[#F9FAFB] rounded-lg px-2 py-1.5 -mx-2"
                  >
                    <span className="flex-1 min-w-0 truncate text-[#344054]">{p.titulo}</span>
                    <span className="text-[12px] text-[#98A2B3] shrink-0">
                      {p.dias_parado} dias sem movimentação
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tudoEmDia && (
        <div className="bg-white border border-[#E4E7EC] rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-[#12B76A] mx-auto mb-3" />
          <h2 className="text-[16px] font-semibold text-[#101828]">Sua mesa está limpa</h2>
          <p className="text-[14px] text-[#667085] mt-1.5 max-w-md mx-auto">
            Nada aguarda sua análise e nenhum departamento está com demanda pendente.
          </p>
          <Link
            href="/convenios"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 rounded-lg bg-[#1D4ED8] text-white text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
          >
            <Plus className="w-4 h-4" /> Abrir um processo
          </Link>
        </div>
      )}

      {encaminhar && (
        <EncaminharDemanda
          convenioId={encaminhar.id}
          processoTitulo={encaminhar.titulo}
          aberto
          onFechar={() => setEncaminhar(null)}
          onEncaminhado={load}
        />
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

function Bloco({
  icone,
  titulo,
  descricao,
  cor,
  fundo,
  contagem,
  vazio,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  cor: string;
  fundo: string;
  contagem: number;
  vazio: string;
  children: React.ReactNode;
}) {
  if (contagem === 0 && !vazio) return null;
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
        <span className="text-[20px] font-bold tabular-nums" style={{ color: contagem ? cor : "#98A2B3" }}>
          {contagem}
        </span>
      </div>
      {contagem === 0 ? (
        <p className="px-5 py-6 text-[13px] text-[#667085]">{vazio}</p>
      ) : (
        <div className="divide-y divide-[#F2F4F7]">{children}</div>
      )}
    </div>
  );
}

function LinhaDemanda({ d, acao, recuada }: { d: DemandaItem; acao: string; recuada?: boolean }) {
  return (
    <Link
      href={`/tarefas/${d.id}`}
      className={cn(
        "flex items-center gap-3 px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors",
        recuada && "pl-12"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-[#101828] truncate">{d.titulo}</p>
        <p className="text-[12px] text-[#667085] truncate mt-0.5">
          {d.processo}
          {d.setor ? ` · ${d.setor}` : ""}
          {d.responsavel ? ` · ${d.responsavel}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        <p className={cn("text-[12px]", d.atrasada ? "text-[#B42318] font-medium" : "text-[#667085]")}>
          {prazoTexto(d)}
        </p>
        {(d.prazo_interno || d.prazo) && (
          <p className="text-[11px] text-[#98A2B3]">{formatDate(d.prazo_interno || d.prazo)}</p>
        )}
      </div>
      <span className="text-[13px] font-medium text-[#1D4ED8] shrink-0 hidden sm:inline">{acao}</span>
      <ChevronRight className="w-4 h-4 text-[#98A2B3] shrink-0 sm:hidden" />
    </Link>
  );
}

function LinhaProcesso({
  p,
  acao,
  onEncaminhar,
}: {
  p: ProcessoPendente;
  acao: string;
  onEncaminhar?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors">
      <Link href={`/convenios/${p.id}`} className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-[#101828] truncate">{p.titulo}</p>
        <p className="text-[12px] text-[#667085] truncate mt-0.5">
          {p.etapa_atual || "Sem etapa em andamento"}
          {p.dias_parado !== null ? ` · ${p.dias_parado}d sem movimentação` : ""}
        </p>
      </Link>
      {onEncaminhar && (
        <button
          type="button"
          onClick={onEncaminhar}
          className="text-[13px] font-medium text-[#344054] hover:text-[#101828] px-2.5 py-1.5 rounded-lg hover:bg-[#F2F4F7] shrink-0 hidden sm:block"
        >
          Encaminhar
        </button>
      )}
      <Link href={`/convenios/${p.id}`} className="text-[13px] font-medium text-[#1D4ED8] shrink-0 hidden sm:inline">
        {acao}
      </Link>
      <ChevronRight className="w-4 h-4 text-[#98A2B3] shrink-0 sm:hidden" />
    </div>
  );
}

export default function Page() {
  return (
    <RequirePermission anyOf={[PERM.TASK_ASSIGN, PERM.EDIT]}>
      <MesaConteudo />
    </RequirePermission>
  );
}
