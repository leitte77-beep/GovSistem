"use client";

/**
 * "Meu governo" — a tela do Prefeito, pensada primeiro para o celular.
 *
 * Responde, nesta ordem: quanto está andando, o que está travado (onde, há
 * quanto tempo e por quê), qual setor segura mais, como vão as obras, e de
 * onde veio o dinheiro. Atualiza sozinha quando qualquer pedido anda.
 */

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Hourglass,
  Landmark,
  RefreshCw,
  Timer,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Barras,
  CartaoObra,
  EsqueletoPainel,
  Feed,
  Kpi,
  ListaParados,
  Rosca,
  Secao,
  Vazio,
} from "@/components/painel/Blocos";
import { api, type PainelPrefeito as Dados } from "@/lib/api";
import { moeda, moedaCurta } from "@/lib/formato";
import { useSessao } from "@/lib/sessao";
import { useAoMudar } from "@/lib/tempoReal";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function PainelPrefeito() {
  const { eu } = useSessao();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pulso, setPulso] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.painelPrefeito());
      setAtualizadoEm(new Date());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useAoMudar(() => {
    setPulso(true);
    carregar().finally(() => setTimeout(() => setPulso(false), 1200));
  });

  if (erro && !dados) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!dados) return <EsqueletoPainel />;

  const { kpis, dias_alerta_parado: limite } = dados;
  const previsto = Number(kpis.valor_previsto);
  const pctLiberado = previsto ? Math.min(100, (Number(kpis.valor_liberado) / previsto) * 100) : 0;
  const pctPago = previsto ? Math.min(100, (Number(kpis.valor_pago) / previsto) * 100) : 0;
  const primeiroNome = eu?.nome.split(" ")[0];

  return (
    <div className="animate-fade-subir space-y-5 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted first-letter:uppercase">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-0.5 font-display text-[26px] font-medium leading-tight text-ink sm:text-3xl">
            {saudacao()}
            {primeiroNome ? `, ${primeiroNome}` : ""}.
          </h1>
        </div>
        <button
          onClick={() => carregar()}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs transition",
            pulso ? "bg-estado-concluido/10 text-estado-concluido" : "text-ink-faint hover:bg-paper hover:text-ink"
          )}
        >
          <RefreshCw size={13} className={pulso ? "animate-spin" : ""} aria-hidden />
          {pulso
            ? "Atualizando…"
            : atualizadoEm
              ? `Atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
        </button>
      </header>

      {kpis.parados > 0 && (
        <Link
          href="/pedidos?parados=1"
          className="group flex items-center gap-3 rounded-card border border-estado-atrasado/20 bg-estado-atrasado/[.07] px-4 py-3.5 transition hover:bg-estado-atrasado/10"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-estado-atrasado/15 text-estado-atrasado">
            <AlertTriangle size={19} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold text-estado-atrasado">
              {kpis.parados} {kpis.parados === 1 ? "pedido parado" : "pedidos parados"} há {limite} dias ou mais
            </span>
            <span className="block text-ink-muted">Veja onde estão e por quê.</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-estado-atrasado transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Em andamento" valor={kpis.em_andamento} icone={TrendingUp} tom="marca" href="/pedidos?abertos=1" detalhe={`${kpis.atrasados} com prazo vencido`} />
        <Kpi rotulo="Parados" valor={kpis.parados} icone={Hourglass} tom={kpis.parados ? "alerta" : "ok"} href="/pedidos?parados=1" detalhe={`${limite}+ dias no mesmo lugar`} />
        <Kpi rotulo="Aguardando governo" valor={kpis.aguardando_governo} icone={Landmark} tom="info" href="/pedidos?situacao=AGUARDANDO_TERCEIRO" detalhe="Protocolados fora" />
        <Kpi rotulo="Concluídos no mês" valor={kpis.concluidos_no_mes} icone={CheckCircle2} tom="ok" href="/pedidos?situacao=CONCLUIDO" detalhe={`${kpis.concluidos_no_ano} no ano`} />
      </div>

      <section className="cartao p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[17px] font-medium text-ink">Recursos</h2>
          <p className="text-xs text-ink-muted">Previsto em todos os pedidos não cancelados</p>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {[
            { r: "Previsto", v: kpis.valor_previsto, c: "text-ink" },
            { r: "Liberado", v: kpis.valor_liberado, c: "text-brand" },
            { r: "Pago", v: kpis.valor_pago, c: "text-estado-concluido" },
          ].map((x) => (
            <div key={x.r}>
              <p className="text-xs text-ink-muted">{x.r}</p>
              <p className={clsx("font-display text-2xl tabular-nums", x.c)} title={moeda(x.v)}>
                {moedaCurta(x.v)}
              </p>
            </div>
          ))}
        </div>
        <div className="relative mt-4 h-3 overflow-hidden rounded-pill bg-ink/[.06]" aria-hidden>
          <div className="absolute inset-y-0 left-0 rounded-pill bg-brand/35 transition-[width] duration-700" style={{ width: `${pctLiberado}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-pill bg-estado-concluido transition-[width] duration-700" style={{ width: `${pctPago}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {Math.round(pctLiberado)}% liberado · {Math.round(pctPago)}% pago
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <Secao
          className="lg:col-span-3"
          titulo="Onde está travado"
          subtitulo="Há mais tempo no mesmo lugar primeiro"
          semPadding
          acao={
            <Link href="/pedidos?parados=1" className="shrink-0 text-xs font-medium text-brand hover:underline">
              Ver todos
            </Link>
          }
        >
          <ListaParados pedidos={dados.parados.slice(0, 8)} limite={limite} />
        </Secao>

        <Secao className="lg:col-span-2" titulo="Gargalos por setor" subtitulo="Média de dias que os pedidos estão parados no setor">
          {dados.gargalos.filter((g) => g.abertos > 0).length === 0 ? (
            <Vazio texto="Nenhum pedido nos setores agora." />
          ) : (
            <Barras
              itens={dados.gargalos
                .filter((g) => g.abertos > 0)
                .sort((a, b) => b.dias_medios_agora - a.dias_medios_agora)
                .map((g) => ({
                  chave: g.setor,
                  rotulo: g.nome,
                  valor: g.dias_medios_agora,
                  extra: `· ${g.abertos} ${g.abertos === 1 ? "pedido" : "pedidos"}`,
                  alerta: g.dias_medios_agora >= limite,
                }))}
              formatar={(n) => `${n.toLocaleString("pt-BR")}d`}
              hrefDe={(s) => `/pedidos?setor=${s}&abertos=1`}
            />
          )}
          {dados.gargalos.some((g) => g.dias_medios_historico !== null) && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="sobretitulo flex items-center gap-1.5">
                <Timer size={12} aria-hidden /> Tempo médio de resposta (12 meses)
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {dados.gargalos
                  .filter((g) => g.dias_medios_historico !== null)
                  .map((g) => (
                    <li key={g.setor} className="flex justify-between gap-2">
                      <span className="truncate text-ink-muted">{g.nome}</span>
                      <span className="tabular-nums text-ink">{g.dias_medios_historico?.toLocaleString("pt-BR")}d</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Secao>
      </div>

      {dados.obras.length > 0 && (
        <Secao
          titulo="Obras em andamento"
          subtitulo="Avanço da última medição"
          acao={
            <Link href="/pedidos?tipo=OBRA" className="shrink-0 text-xs font-medium text-brand hover:underline">
              Todas as obras
            </Link>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dados.obras.slice(0, 6).map((o) => (
              <CartaoObra key={o.id} obra={o} limite={limite} />
            ))}
          </div>
        </Secao>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 lg:gap-6">
        <Secao titulo="Por que está parado">
          {dados.por_motivo.length === 0 ? (
            <Vazio texto="Nenhum motivo de parada registrado." />
          ) : (
            <Barras
              itens={dados.por_motivo.map((f) => ({ chave: f.chave, rotulo: f.rotulo, valor: f.quantidade }))}
              cor="bg-estado-info"
              hrefDe={(m) => `/pedidos?motivo_parada=${m}&abertos=1`}
            />
          )}
        </Secao>
        <Secao titulo="O que foi pedido">
          <Rosca fatias={dados.por_tipo} />
        </Secao>
        <Secao titulo="Quem trouxe" subtitulo="Deputados e vereadores, por valor previsto" className="md:col-span-2 xl:col-span-1">
          {dados.por_parlamentar.length === 0 ? (
            <Vazio texto="Nenhum pedido de parlamentar ainda." icone={Landmark} />
          ) : (
            <Barras
              itens={dados.por_parlamentar.map((f) => ({
                chave: f.chave,
                rotulo: f.rotulo,
                valor: Number(f.valor),
                extra: `· ${f.quantidade}`,
              }))}
              formatar={(n) => moedaCurta(n)}
              cor="bg-brass"
              hrefDe={(nome) => `/pedidos?parlamentar=${encodeURIComponent(nome)}`}
            />
          )}
        </Secao>
      </div>

      <Secao titulo="Aconteceu agora" subtitulo="Últimas movimentações, ao vivo">
        <Feed eventos={dados.recentes.slice(0, 10)} />
      </Secao>
    </div>
  );
}
