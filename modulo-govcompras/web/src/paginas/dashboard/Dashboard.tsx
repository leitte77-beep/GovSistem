import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, Clock3, FileWarning, FolderKanban, Landmark, ScrollText, Timer } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import type { DashboardIndicadores, ProcessoResumo } from "@/nucleo/tipos";
import { CartaoIndicador, Cartao, CartaoCabecalho, CartaoCorpo, SkeletonCartoes, ChipSLA, EstadoVazio } from "@/ui";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function Dashboard() {
  const { usuario } = useSessao();

  const { data: indicadores, isLoading } = useQuery({
    queryKey: ["dashboard-indicadores"],
    queryFn: () => api.get<DashboardIndicadores>("/dashboard/indicadores"),
  });

  const { data: atrasados } = useQuery({
    queryKey: ["processos", "atrasados"],
    queryFn: () =>
      api.get<{ itens: ProcessoResumo[] }>("/processos", { apenas_atrasados: true, por_pagina: 6 }),
  });

  const primeiroNome = usuario?.nome.split(" ")[0];
  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? "Bom dia" : horaAtual < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {saudacao}, {primeiroNome}.
        </h1>
        <p className="text-sm text-slate-500">Aqui está o panorama das contratações do município agora.</p>
      </div>

      {isLoading || !indicadores ? (
        <SkeletonCartoes quantidade={8} />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <CartaoIndicador
            rotulo="Processos em andamento"
            valor={indicadores.processos_em_andamento}
            icone={<FolderKanban className="size-4" />}
            link="/processos"
          />
          <CartaoIndicador
            rotulo="Processos atrasados"
            valor={indicadores.processos_atrasados}
            icone={<AlertTriangle className="size-4" />}
            destaque={indicadores.processos_atrasados > 0 ? "critico" : "neutro"}
            link="/processos"
          />
          <CartaoIndicador
            rotulo="Contratos vencendo (30 dias)"
            valor={indicadores.contratos_vencendo}
            icone={<Timer className="size-4" />}
            destaque={indicadores.contratos_vencendo > 0 ? "atencao" : "neutro"}
            link="/vencimentos"
          />
          <CartaoIndicador
            rotulo="Atas vencendo (30 dias)"
            valor={indicadores.atas_vencendo}
            icone={<ScrollText className="size-4" />}
            destaque={indicadores.atas_vencendo > 0 ? "atencao" : "neutro"}
            link="/atas"
          />
          <CartaoIndicador
            rotulo="Valor em contratação"
            valor={formatarMoeda(indicadores.valor_em_contratacao)}
            icone={<Banknote className="size-4" />}
            link="/processos"
          />
          <CartaoIndicador
            rotulo="Valor contratado (ativo)"
            valor={formatarMoeda(indicadores.valor_contratado)}
            icone={<Landmark className="size-4" />}
            link="/contratos"
          />
          <CartaoIndicador
            rotulo="Contratos ativos"
            valor={indicadores.contratos_ativos}
            icone={<FileWarning className="size-4" />}
            link="/contratos"
          />
          <CartaoIndicador
            rotulo="Etapas distintas em uso"
            valor={Object.keys(indicadores.por_etapa).length}
            icone={<Clock3 className="size-4" />}
          />
        </div>
      )}

      <Cartao>
        <CartaoCabecalho
          titulo="Atenção necessária"
          descricao="Processos além do prazo interno configurado para a etapa atual"
          acoes={
            <Link to="/processos?apenas_atrasados=1" className="text-xs font-medium text-brand-700 hover:underline">
              Ver todos
            </Link>
          }
        />
        <CartaoCorpo>
          {!atrasados?.itens.length ? (
            <EstadoVazio
              titulo="Nenhum processo atrasado agora"
              descricao="Assim que algum processo ultrapassar o prazo interno da etapa, ele aparece aqui."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {atrasados.itens.map((processo) => (
                <li key={processo.id}>
                  <Link
                    to={`/processos/${processo.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {processo.numero_processo} — {processo.objeto}
                      </p>
                      <p className="text-xs text-slate-500">
                        {processo.etapa_atual_nome} · {processo.responsavel_setor ?? "sem responsável definido"} ·{" "}
                        {processo.dias_na_etapa} dia(s) nesta etapa
                      </p>
                    </div>
                    <ChipSLA status={processo.status_sla} />
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
