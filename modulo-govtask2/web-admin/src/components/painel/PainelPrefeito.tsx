"use client";

/**
 * "Meu governo" — a tela do Prefeito.
 *
 * O que ele precisa para cobrar: quatro números, cada pedido em andamento
 * (onde está, há quanto tempo, por onde já passou e quanto vale), recursos,
 * setores, valor por tipo e obras. O detalhe fica em Pedidos.
 */

import clsx from "clsx";
import { ArrowRight, ChevronRight, Presentation, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { EtiquetaTipo } from "@/components/Etiquetas";
import { Barras, CartaoObra, EsqueletoPainel, Feed, Secao, Vazio } from "@/components/painel/Blocos";
import { api, type PainelPrefeito as Dados, type PedidoComTrilha } from "@/lib/api";
import { moeda, moedaCurta, ondeEsta } from "@/lib/formato";
import { useNomeSetor } from "@/lib/setores";
import { useSessao } from "@/lib/sessao";
import { useAoMudar, useTempoReal } from "@/lib/tempoReal";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function dias(n: number) {
  return n === 1 ? "1 dia" : `${n} dias`;
}

export function PainelPrefeito() {
  const { eu } = useSessao();
  const { conectado } = useTempoReal();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pulso, setPulso] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await api.painelPrefeito());
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

  // Mantém o botão de telão em sincronia quando o usuário sai pelo Esc/F11.
  useEffect(() => {
    const aoMudarTela = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoMudarTela);
    return () => document.removeEventListener("fullscreenchange", aoMudarTela);
  }, []);

  function alternarTelaCheia() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement
        .requestFullscreen()
        .catch(() => toast.error("O navegador não permitiu a tela cheia."));
    }
  }

  if (erro && !dados) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!dados) return <EsqueletoPainel />;

  const { kpis, dias_alerta_parado: limite } = dados;
  const primeiroNome = eu?.nome.split(" ")[0];
  const emAndamento = dados.parados;
  const previsto = Number(kpis.valor_previsto);
  const pctLiberado = previsto ? Math.min(100, (Number(kpis.valor_liberado) / previsto) * 100) : 0;
  const pctPago = previsto ? Math.min(100, (Number(kpis.valor_pago) / previsto) * 100) : 0;
  const setores = dados.gargalos
    .filter((g) => g.abertos > 0)
    .sort((a, b) => b.dias_medios_agora - a.dias_medios_agora);
  const tipos = [...dados.por_tipo].sort((a, b) => Number(b.valor) - Number(a.valor));

  const numeros = [
    { rotulo: "Em andamento", valor: String(kpis.em_andamento), href: "/pedidos?abertos=1", alerta: false },
    { rotulo: "Parados", valor: String(kpis.parados), href: "/pedidos?parados=1", alerta: kpis.parados > 0, detalhe: `${limite}+ dias no mesmo lugar` },
    { rotulo: "Valor em pedidos", valor: moedaCurta(kpis.valor_previsto), href: "/pedidos", alerta: false, titulo: moeda(kpis.valor_previsto) },
    { rotulo: "Concluídos no mês", valor: String(kpis.concluidos_no_mes), href: "/pedidos?situacao=CONCLUIDO", alerta: false, detalhe: `${kpis.concluidos_no_ano} no ano` },
  ];

  return (
    <div className="animate-fade-subir space-y-5 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="sobretitulo">Painel do Prefeito</p>
          <h1 className="mt-1 font-display text-[26px] font-medium leading-tight text-ink sm:text-3xl">
            {saudacao()}
            {primeiroNome ? `, ${primeiroNome}` : ""}.
          </h1>
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className={clsx("h-2 w-2 rounded-full", conectado ? "bg-estado-concluido" : "bg-brass")} aria-hidden />
            {conectado ? "Ao vivo" : "Reconectando"}
          </span>
          <button onClick={() => carregar()} className="grid h-9 w-9 place-items-center rounded-btn border border-line text-ink-muted transition hover:bg-ink/[.04] hover:text-ink" aria-label="Atualizar" title="Atualizar">
            <RefreshCw size={16} className={pulso ? "animate-spin" : ""} aria-hidden />
          </button>
          <button onClick={alternarTelaCheia} className="grid h-9 w-9 place-items-center rounded-btn border border-line text-ink-muted transition hover:bg-ink/[.04] hover:text-ink" aria-label="Modo telão" title="Modo telão">
            <Presentation size={16} aria-hidden />
          </button>
          <button onClick={() => window.print()} className="grid h-9 w-9 place-items-center rounded-btn border border-line text-ink-muted transition hover:bg-ink/[.04] hover:text-ink" aria-label="Imprimir" title="Imprimir">
            <Printer size={16} aria-hidden />
          </button>
        </div>
      </header>

      {/* Quatro números */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numeros.map((n) => (
          <Link
            key={n.rotulo}
            href={n.href}
            className={clsx(
              "cartao group p-4 transition hover:shadow-pop",
              n.alerta && "border-estado-atrasado/30 bg-estado-atrasado/[.05]"
            )}
          >
            <p className={clsx("text-xs font-medium", n.alerta ? "text-estado-atrasado" : "text-ink-muted")}>
              {n.rotulo}
            </p>
            <p
              className={clsx(
                "mt-1 font-display text-3xl font-semibold tabular-nums",
                n.alerta ? "text-estado-atrasado" : "text-ink"
              )}
              title={n.titulo}
            >
              {n.valor}
            </p>
            {n.detalhe && <p className="mt-0.5 text-xs text-ink-muted">{n.detalhe}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Onde está cada pedido */}
        <Secao
          className="lg:col-span-8"
          titulo="Pedidos em andamento"
          subtitulo="Onde está, há quanto tempo e por onde já passou — os mais parados primeiro"
          semPadding
          acao={
            <Link href="/pedidos?abertos=1" className="shrink-0 text-xs font-medium text-brand hover:underline">
              Ver todos
            </Link>
          }
        >
          {emAndamento.length === 0 ? (
            <Vazio texto="Nenhum pedido em andamento." />
          ) : (
            <ul className="divide-y divide-line">
              {emAndamento.slice(0, 10).map((p) => (
                <LinhaPedido key={p.id} pedido={p} limite={limite} />
              ))}
            </ul>
          )}
        </Secao>

        <div className="space-y-5 lg:col-span-4 lg:space-y-6">
          <Secao titulo="Recursos" subtitulo="Pedidos não cancelados">
            <dl className="space-y-2 text-sm">
              {[
                { r: "Previsto", v: kpis.valor_previsto, c: "text-ink" },
                { r: "Liberado", v: kpis.valor_liberado, c: "text-brand" },
                { r: "Pago", v: kpis.valor_pago, c: "text-estado-concluido" },
              ].map((x) => (
                <div key={x.r} className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-muted">{x.r}</dt>
                  <dd className={clsx("font-display text-lg font-semibold tabular-nums", x.c)} title={moeda(x.v)}>
                    {moedaCurta(x.v)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="relative mt-3 h-2.5 overflow-hidden rounded-pill bg-ink/[.06]" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-pill bg-brand/35" style={{ width: `${pctLiberado}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-pill bg-estado-concluido" style={{ width: `${pctPago}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {Math.round(pctLiberado)}% liberado · {Math.round(pctPago)}% pago
            </p>
          </Secao>

          <Secao titulo="Últimas movimentações">
            <Feed eventos={dados.recentes.slice(0, 6)} />
          </Secao>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:gap-6">
        <Secao titulo="Setores com pedidos" subtitulo="Média de dias que os pedidos estão no setor agora">
          {setores.length === 0 ? (
            <Vazio texto="Nenhum pedido nos setores agora." />
          ) : (
            <Barras
              itens={setores.map((g) => ({
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
        </Secao>

        <Secao titulo="Valor por tipo de pedido" subtitulo="Previsto nos pedidos não cancelados">
          {tipos.length === 0 ? (
            <Vazio texto="Nenhum pedido ainda." />
          ) : (
            <Barras
              itens={tipos.map((f) => ({
                chave: f.chave,
                rotulo: f.rotulo,
                valor: Number(f.valor),
                extra: `· ${f.quantidade} ${f.quantidade === 1 ? "pedido" : "pedidos"}`,
              }))}
              formatar={(n) => moedaCurta(n)}
              cor="bg-brass"
              hrefDe={(t) => `/pedidos?tipo=${t}`}
            />
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
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dados.obras.slice(0, 6).map((o) => (
              <CartaoObra key={o.id} obra={o} limite={limite} />
            ))}
          </div>
        </Secao>
      )}

      {telaCheia && (
        <button
          onClick={alternarTelaCheia}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-brand-900/95 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-pop print:hidden"
        >
          Sair do modo telão
        </button>
      )}
    </div>
  );
}

function LinhaPedido({ pedido: p, limite }: { pedido: PedidoComTrilha; limite: number }) {
  const nomeSetor = useNomeSetor();
  const onde = ondeEsta(p.situacao, p.setor_atual, nomeSetor);
  const parado = p.dias_na_situacao >= limite;
  const critico = p.dias_na_situacao >= limite * 2;

  return (
    <li>
      <Link href={`/pedidos/${p.id}`} className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-ink/[.03] sm:px-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs text-ink-muted">{p.numero}</span>
            <EtiquetaTipo tipo={p.tipo} />
            {parado && (
              <span className="etiqueta bg-estado-atrasado/10 text-estado-atrasado">Parado</span>
            )}
          </div>
          <p className="truncate font-medium text-ink">{p.titulo}</p>
          <p className="text-sm">
            <span className="text-ink-muted">{parado ? "Parado em " : "Está em "}</span>
            <strong className="text-ink">{onde}</strong>
            <span
              className={clsx(
                "font-semibold",
                critico ? "text-estado-atrasado" : parado ? "text-brass" : "text-ink-muted"
              )}
            >
              {" "}há {dias(p.dias_na_situacao)}
            </span>
          </p>
          {p.trilha.length > 0 && (
            <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted" aria-label="Por onde tramitou">
              <li className="mr-0.5">Tramitou:</li>
              {p.trilha.map((t, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight size={11} className="text-ink-faint" aria-hidden />}
                  <span
                    className={clsx(
                      "rounded-pill px-1.5 py-0.5",
                      t.atual ? "bg-estado-atrasado/10 font-semibold text-estado-atrasado" : "bg-ink/[.05]"
                    )}
                  >
                    {t.nome} · {t.dias}d
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-base font-semibold tabular-nums text-ink" title={moeda(p.valor_previsto)}>
            {p.valor_previsto ? moedaCurta(p.valor_previsto) : "—"}
          </p>
          <ChevronRight size={16} className="ml-auto mt-2 text-ink-faint transition group-hover:translate-x-0.5" aria-hidden />
        </div>
      </Link>
    </li>
  );
}
