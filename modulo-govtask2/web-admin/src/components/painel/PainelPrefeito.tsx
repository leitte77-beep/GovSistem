"use client";

/**
 * "Meu governo" — a tela do Prefeito.
 *
 * Banner executivo, números do dia, recursos, grade estratégica (obras,
 * gargalos e travas) e o feed ao vivo com despacho rápido. Pensada para o
 * celular e para o telão da reunião de secretariado.
 */

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Hourglass,
  Landmark,
  Presentation,
  Printer,
  RefreshCw,
  Send,
  Timer,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

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
import { useAoMudar, useTempoReal } from "@/lib/tempoReal";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function PainelPrefeito() {
  const { eu } = useSessao();
  const { conectado } = useTempoReal();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pulso, setPulso] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [despacho, setDespacho] = useState("");
  const [enviando, setEnviando] = useState(false);

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

  async function enviarDespacho(evento: React.FormEvent) {
    evento.preventDefault();
    const alvo = dados?.recentes[0];
    const texto = despacho.trim();
    if (!alvo || !texto) return;
    setEnviando(true);
    try {
      await api.comentar(alvo.pedido_id, texto);
      toast.success(`Despacho registrado em ${alvo.numero}.`);
      setDespacho("");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o despacho.");
    } finally {
      setEnviando(false);
    }
  }

  if (erro && !dados) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!dados) return <EsqueletoPainel />;

  const { kpis, dias_alerta_parado: limite } = dados;
  const previsto = Number(kpis.valor_previsto);
  const pctLiberado = previsto ? Math.min(100, (Number(kpis.valor_liberado) / previsto) * 100) : 0;
  const pctPago = previsto ? Math.min(100, (Number(kpis.valor_pago) / previsto) * 100) : 0;
  const primeiroNome = eu?.nome.split(" ")[0];
  const setoresAtivos = dados.gargalos.filter((g) => g.abertos > 0).length;
  const alvoDespacho = dados.recentes[0];
  const dataLonga = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const resumo = [
    { rotulo: "Em tramitação", valor: String(kpis.em_andamento) },
    { rotulo: "Setores com pedidos", valor: String(setoresAtivos) },
    { rotulo: "Obras em andamento", valor: String(dados.obras.length) },
    { rotulo: "Valor previsto", valor: moedaCurta(kpis.valor_previsto) },
  ];

  return (
    <div className="animate-fade-subir space-y-5 sm:space-y-6">
      {/* Banner executivo */}
      <section className="relative overflow-hidden rounded-card bg-brand-900 p-5 text-white shadow-pop sm:p-6 lg:p-7 print:border print:border-line print:bg-white print:text-ink print:shadow-none">
        <div
          className="pointer-events-none absolute inset-0 opacity-[.07] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:16px_16px] print:hidden"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-600/25 blur-3xl print:hidden"
          aria-hidden
        />

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-200">
              <span className="text-ouro">GovTask</span>
              <span className="text-white/25">•</span>
              <span>Gabinete digital</span>
              <span className="text-white/25">·</span>
              <span className="rounded-pill bg-white/10 px-2 py-0.5 text-white/70">
                Painel do Prefeito
              </span>
            </p>
            <h1 className="mt-2.5 font-display text-[26px] font-medium leading-tight text-white sm:text-3xl print:text-ink">
              {saudacao()}
              {primeiroNome ? `, ${primeiroNome}` : ""}.
            </h1>
            <p className="mt-1 text-sm text-brand-100/85 first-letter:uppercase print:text-ink-muted">
              {dataLonga}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/[.08] px-3 py-1.5 text-xs text-white/85">
              <span
                className={clsx("h-2 w-2 rounded-full", conectado ? "bg-estado-concluido" : "bg-brass")}
                aria-hidden
              />
              {conectado ? "Ao vivo" : "Reconectando"}
              {atualizadoEm && (
                <span className="text-white/50">
                  · {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </span>
            <button
              onClick={() => carregar()}
              className="grid h-9 w-9 place-items-center rounded-btn bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Atualizar"
              title="Atualizar"
            >
              <RefreshCw size={16} className={pulso ? "animate-spin" : ""} aria-hidden />
            </button>
            <button
              onClick={alternarTelaCheia}
              className="inline-flex items-center gap-2 rounded-btn bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              <Presentation size={16} aria-hidden />
              <span className="hidden sm:inline">Modo telão</span>
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-btn bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <Printer size={16} aria-hidden />
              <span className="hidden sm:inline">Exportar balanço</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
          {resumo.map((m) => (
            <div key={m.rotulo}>
              <p className="text-[11px] uppercase tracking-wider text-brand-100/70 print:text-ink-muted">
                {m.rotulo}
              </p>
              <p className="mt-1 font-display text-xl font-semibold tabular-nums text-white print:text-ink">
                {m.valor}
              </p>
            </div>
          ))}
        </div>
      </section>

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
          <ArrowRight
            size={18}
            className="shrink-0 text-estado-atrasado transition group-hover:translate-x-0.5"
            aria-hidden
          />
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
          <div
            className="absolute inset-y-0 left-0 rounded-pill bg-brand/35 transition-[width] duration-700"
            style={{ width: `${pctLiberado}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-pill bg-estado-concluido transition-[width] duration-700"
            style={{ width: `${pctPago}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {Math.round(pctLiberado)}% liberado · {Math.round(pctPago)}% pago
        </p>
      </section>

      {/* Grade estratégica 8/4 */}
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-5 lg:col-span-8 lg:space-y-6">
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
              <div className="grid gap-3 md:grid-cols-2">
                {dados.obras.slice(0, 6).map((o) => (
                  <CartaoObra key={o.id} obra={o} limite={limite} />
                ))}
              </div>
            </Secao>
          )}

          <div className="grid gap-5 md:grid-cols-2 lg:gap-6">
            <Secao
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

            <Secao titulo="Gargalos por setor" subtitulo="Média de dias que os pedidos estão parados no setor">
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
                          <span className="tabular-nums text-ink">
                            {g.dias_medios_historico?.toLocaleString("pt-BR")}d
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </Secao>
          </div>

          <div className="grid gap-5 md:grid-cols-3 lg:gap-6">
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

            <Secao titulo="Quem trouxe" subtitulo="Deputados e vereadores, por valor previsto">
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
        </div>

        {/* Coluna direita: feed ao vivo + despacho rápido */}
        <div className="lg:col-span-4">
          <div className="cartao flex h-fit flex-col lg:sticky lg:top-5">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="font-display text-[17px] font-medium text-ink">Aconteceu agora</h2>
                <p className="mt-0.5 text-xs text-ink-muted">Últimas movimentações, ao vivo</p>
              </div>
              <span className="etiqueta shrink-0 bg-brand-50 text-brand-700">
                <span className="h-2 w-2 rounded-full bg-brand animate-pulsar" aria-hidden />
                Stream
              </span>
            </header>
            <div className="rolagem-fina max-h-[560px] overflow-y-auto p-4">
              <Feed eventos={dados.recentes.slice(0, 12)} />
            </div>
            <form onSubmit={enviarDespacho} className="border-t border-line p-4 print:hidden">
              <div className="relative">
                <input
                  className="campo pr-12"
                  placeholder="Adicionar despacho rápido do prefeito…"
                  value={despacho}
                  onChange={(e) => setDespacho(e.target.value)}
                  disabled={!alvoDespacho || enviando}
                  aria-label="Despacho rápido"
                />
                <button
                  type="submit"
                  disabled={!alvoDespacho || enviando || !despacho.trim()}
                  className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-btn bg-brand text-white transition hover:bg-brand-600 disabled:opacity-45"
                  aria-label="Enviar despacho"
                >
                  <Send size={15} aria-hidden />
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {alvoDespacho
                  ? `Vai como comentário em ${alvoDespacho.numero}${alvoDespacho.titulo ? ` · ${alvoDespacho.titulo}` : ""}`
                  : "Sem movimentações para responder."}
              </p>
            </form>
          </div>
        </div>
      </div>

      {telaCheia && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-pill border border-line bg-brand-900/95 px-4 py-2 text-white shadow-pop backdrop-blur print:hidden">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ouro">
            <span className="h-2 w-2 rounded-full bg-estado-concluido animate-pulsar" aria-hidden />
            Modo reunião ativo
          </span>
          <span className="hidden text-xs text-white/60 sm:inline">Exibição otimizada para telão e lousa</span>
          <button
            onClick={alternarTelaCheia}
            className="rounded-pill bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white transition hover:bg-white/20"
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
