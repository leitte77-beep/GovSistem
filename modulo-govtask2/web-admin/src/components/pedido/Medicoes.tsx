"use client";

/**
 * Medições da obra.
 *
 * No topo, o painel da obra: % executado, quanto já foi medido frente ao
 * previsto, a curva de avanço e a última foto. Abaixo, cada medição como um
 * cartão com galeria. Registrar é um formulário guiado: período já sugerido,
 * valor em R$, % com aviso de retrocesso e fotos com legenda.
 */

import clsx from "clsx";
import { AlertTriangle, Camera, HardHat, ImagePlus, Plus, Ruler, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { CampoMoeda } from "@/components/CampoMoeda";
import { api, type Anexo, type Eu, type Medicao, type Pedido } from "@/lib/api";
import { data, moeda, moedaCurta, relativo } from "@/lib/formato";

import { useVisualizador } from "./Visualizador";

const n = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AbaMedicoes({
  pedido,
  eu,
  aoAtualizar,
}: {
  pedido: Pedido;
  eu: Eu | null;
  aoAtualizar: (p: Pedido) => void;
}) {
  const enc = pedido.encaminhamento_atual;
  const podeRegistrar =
    pedido.tipo === "OBRA" &&
    enc?.status === "EM_EXECUCAO" &&
    (enc.responsavel?.id === eu?.id || enc.participantes.some((p) => p.id === eu?.id));
  const [form, setForm] = useState(false);

  const medicoes = [...pedido.medicoes].sort((a, b) => a.numero - b.numero);
  const ultima = medicoes[medicoes.length - 1];
  const pct = n(ultima?.percentual_executado) ?? 0;
  const medido = medicoes.reduce((s, m) => s + (n(m.valor) ?? 0), 0);
  const previsto = n(pedido.valor_previsto) ?? 0;
  const fotos = medicoes.flatMap((m) => m.fotos);
  const ultimaFoto = fotos[fotos.length - 1];

  if (pedido.tipo !== "OBRA") {
    return <p className="cartao p-6 text-sm text-ink-muted">Medições só se aplicam a obras.</p>;
  }

  return (
    <section className="space-y-5 pb-24">
      {/* Painel da obra */}
      <div className="cartao overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[1fr_16rem]">
          <div className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="sobretitulo">Execução física</p>
                <p className="mt-1 font-display text-5xl leading-none tabular-nums text-ink">
                  {Math.round(pct)}
                  <span className="ml-1 text-2xl text-ink-muted">%</span>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {ultima ? `Medição ${ultima.numero} · ${relativo(ultima.created_at)} atrás` : "Nenhuma medição ainda"}
                </p>
              </div>
              {podeRegistrar && !form && (
                <button className="botao-primario" onClick={() => setForm(true)}>
                  <Plus size={16} /> Registrar medição
                </button>
              )}
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-pill bg-ink/[.06]">
              <div className="h-full rounded-pill bg-gradient-to-r from-brand to-estado-concluido transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Numero rotulo="Medido" valor={moedaCurta(medido)} dica={moeda(medido)} />
              <Numero rotulo="Previsto" valor={previsto ? moedaCurta(previsto) : "—"} dica={moeda(previsto)} />
              <Numero rotulo="Financeiro" valor={previsto ? `${Math.round((medido / previsto) * 100)}%` : "—"} dica="Medido ÷ previsto" />
            </div>
            {medicoes.length >= 2 && <Curva medicoes={medicoes} />}
          </div>
          <FotoDestaque pedido={pedido} foto={ultimaFoto} todas={fotos} />
        </div>
      </div>

      {form && enc && (
        <FormMedicao pedido={pedido} encId={enc.id} ultima={ultima} medidoAte={medido} previsto={previsto} aoFechar={() => setForm(false)} aoAtualizar={aoAtualizar} />
      )}

      {medicoes.length === 0 ? (
        <div className="cartao flex flex-col items-center gap-2 p-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand">
            <Ruler size={22} />
          </span>
          <p className="font-medium text-ink">Nenhuma medição registrada</p>
          <p className="max-w-sm text-sm text-ink-muted">
            {podeRegistrar
              ? "Registre a primeira medição com o percentual executado e fotos do canteiro."
              : "Quem estiver com a tarefa na Engenharia registra as medições aqui."}
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {[...medicoes].reverse().map((m, i, lista) => (
            <CartaoMedicao key={m.id} pedido={pedido} m={m} anterior={lista[i + 1]} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Numero({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div title={dica}>
      <p className="text-xs text-ink-muted">{rotulo}</p>
      <p className="font-display text-xl tabular-nums text-ink">{valor}</p>
    </div>
  );
}

/** Curva de avanço: % executado por medição. */
function Curva({ medicoes }: { medicoes: Medicao[] }) {
  const pontos = medicoes.map((m) => n(m.percentual_executado) ?? 0);
  const L = 300;
  const A = 70;
  const x = (i: number) => (i / (pontos.length - 1)) * (L - 20) + 10;
  const y = (v: number) => A - 8 - (v / 100) * (A - 16);
  const caminho = pontos.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <div className="mt-5">
      <p className="sobretitulo mb-1 flex items-center gap-1.5">
        <TrendingUp size={12} /> Avanço por medição
      </p>
      <svg viewBox={`0 0 ${L} ${A}`} className="h-20 w-full" role="img" aria-label="Curva de avanço">
        <path d={`${caminho} L${x(pontos.length - 1)},${A - 8} L${x(0)},${A - 8} Z`} fill="rgb(var(--c-brand) / .1)" />
        <path d={caminho} fill="none" stroke="rgb(var(--c-brand))" strokeWidth="2" strokeLinejoin="round" />
        {pontos.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r="3.5" fill="rgb(var(--c-paper))" stroke="rgb(var(--c-brand))" strokeWidth="2" />
            <text x={x(i)} y={y(v) - 7} textAnchor="middle" className="fill-ink-muted text-[9px]">
              {Math.round(v)}%
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function useFoto(pedidoId: string, foto?: Anexo) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!foto) return setUrl(null);
    let criada: string | null = null;
    api
      .urlDaFoto(pedidoId, foto.id)
      .then((u) => {
        criada = u;
        setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [pedidoId, foto]);
  return url;
}

function FotoDestaque({ pedido, foto, todas }: { pedido: Pedido; foto?: Anexo; todas: Anexo[] }) {
  const url = useFoto(pedido.id, foto);
  const { abrir } = useVisualizador();
  return (
    <button
      onClick={() => foto && abrir(foto, todas)}
      disabled={!foto}
      className="relative min-h-[12rem] overflow-hidden border-t border-line bg-gradient-to-br from-brand-50 to-brass-50 md:border-l md:border-t-0"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={foto?.legenda ?? ""} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-faint">
          <HardHat size={32} className="text-brand/40" />
          <span className="text-xs">Sem fotos ainda</span>
        </span>
      )}
      {foto && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 px-3 pb-2.5 pt-8 text-left text-xs text-white">
          {foto.legenda || "Última foto"} · {todas.length} foto(s)
        </span>
      )}
    </button>
  );
}

function CartaoMedicao({ pedido, m, anterior }: { pedido: Pedido; m: Medicao; anterior?: Medicao }) {
  const { abrir } = useVisualizador();
  const pct = n(m.percentual_executado);
  const delta = pct !== null && anterior ? pct - (n(anterior.percentual_executado) ?? 0) : null;
  return (
    <li className="cartao overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 font-display text-lg text-brand">{m.numero}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            Medição {m.numero}
            {m.periodo_inicio && (
              <span className="ml-2 text-sm font-normal text-ink-muted">
                {data(m.periodo_inicio)} a {data(m.periodo_fim)}
              </span>
            )}
          </p>
          <p className="text-xs text-ink-muted">
            {m.responsavel?.name ?? "—"} · registrada {relativo(m.created_at)} atrás
          </p>
          {m.observacao && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{m.observacao}</p>}
        </div>
        <div className="flex gap-5 text-right">
          <div>
            <p className="text-xs text-ink-muted">Executado</p>
            <p className="font-display text-2xl tabular-nums text-ink">{pct === null ? "—" : `${Math.round(pct)}%`}</p>
            {delta !== null && delta !== 0 && (
              <p className={clsx("text-[11px] font-medium", delta > 0 ? "text-estado-concluido" : "text-estado-atrasado")}>
                {delta > 0 ? "+" : ""}
                {Math.round(delta)} p.p.
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-ink-muted">Valor</p>
            <p className="font-display text-2xl tabular-nums text-ink">{m.valor ? moedaCurta(m.valor) : "—"}</p>
          </div>
        </div>
      </div>
      {m.fotos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto border-t border-line bg-canvas/50 p-3">
          {m.fotos.map((f) => (
            <li key={f.id} className="shrink-0">
              <Miniatura pedido={pedido} foto={f} aoAbrir={() => abrir(f, m.fotos)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Miniatura({ pedido, foto, aoAbrir }: { pedido: Pedido; foto: Anexo; aoAbrir: () => void }) {
  const url = useFoto(pedido.id, foto);
  return (
    <button onClick={aoAbrir} className="group relative block h-24 w-32 overflow-hidden rounded-lg bg-ink/[.06]" title={foto.legenda ?? foto.nome_original}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={foto.legenda ?? ""} className="h-full w-full object-cover transition group-hover:scale-105" />
      )}
      {foto.legenda && <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{foto.legenda}</span>}
    </button>
  );
}

// ── Formulário guiado ───────────────────────────────────────────────────

function FormMedicao({
  pedido,
  encId,
  ultima,
  medidoAte,
  previsto,
  aoFechar,
  aoAtualizar,
}: {
  pedido: Pedido;
  encId: string;
  ultima?: Medicao;
  medidoAte: number;
  previsto: number;
  aoFechar: () => void;
  aoAtualizar: (p: Pedido) => void;
}) {
  const inicioSugerido = useMemo(() => {
    if (!ultima?.periodo_fim) return "";
    const d = new Date(ultima.periodo_fim + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [ultima]);
  const pctAnterior = n(ultima?.percentual_executado) ?? 0;
  const [inicio, setInicio] = useState(inicioSugerido);
  const [fim, setFim] = useState(hojeIso());
  const [valor, setValor] = useState("");
  const [pct, setPct] = useState(pctAnterior);
  const [obs, setObs] = useState("");
  const [fotos, setFotos] = useState<{ arquivo: File; url: string; legenda: string }[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const sugestaoPct = previsto && valor ? Math.min(100, ((medidoAte + Number(valor)) / previsto) * 100) : null;
  const retrocesso = pct < pctAnterior;

  function adicionar(lista: FileList | null) {
    const novas = Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));
    setFotos((a) => [...a, ...novas.map((f) => ({ arquivo: f, url: URL.createObjectURL(f), legenda: "" }))]);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  async function salvar() {
    setOcupado(true);
    try {
      let p = await api.registrarMedicao(pedido.id, encId, {
        periodo_inicio: inicio || null,
        periodo_fim: fim || null,
        valor: valor || null,
        percentual_executado: String(pct),
        observacao: obs.trim() || null,
      });
      const nova = [...p.medicoes].sort((a, b) => b.numero - a.numero)[0];
      let falhas = 0;
      for (const f of fotos) {
        try {
          p = await api.anexar(pedido.id, f.arquivo, { medicaoId: nova.id, categoria: "FOTO", tipoDocumento: "FOTO", legenda: f.legenda.trim() || undefined });
        } catch {
          falhas++;
        }
      }
      aoAtualizar(p);
      if (falhas) toast.error(`Medição salva, mas ${falhas} foto(s) não subiram.`);
      else toast.success(`Medição ${nova.numero} registrada.`);
      aoFechar();
    } catch (e) {
      toast.error((e as Error).message);
      setOcupado(false);
    }
  }

  return (
    <div className="cartao animate-fade-subir overflow-hidden border-brand/30">
      <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="font-display text-[17px] font-medium text-ink">Nova medição · nº {(ultima?.numero ?? 0) + 1}</h3>
        <button onClick={aoFechar} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas" aria-label="Fechar">
          <X size={17} />
        </button>
      </header>
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="med-ini">Período medido</label>
            <div className="flex items-center gap-2">
              <input id="med-ini" type="date" className="campo" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              <span className="text-sm text-ink-faint">a</span>
              <input type="date" className="campo" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} aria-label="Fim do período" />
            </div>
            {ultima?.periodo_fim && <p className="mt-1 legenda">Continua da medição {ultima.numero} (até {data(ultima.periodo_fim)}).</p>}
          </div>
          <div>
            <label className="rotulo" htmlFor="med-valor">Valor desta medição (R$)</label>
            <CampoMoeda id="med-valor" valor={valor} aoMudar={setValor} />
            {sugestaoPct !== null && (
              <button type="button" onClick={() => setPct(Math.round(sugestaoPct))} className="mt-1 text-xs text-brand hover:underline">
                Pelo valor, a obra estaria em ~{Math.round(sugestaoPct)}% — usar
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="rotulo" htmlFor="med-pct">Percentual executado (acumulado)</label>
            <span className="font-display text-3xl tabular-nums text-brand">{pct}%</span>
          </div>
          <input
            id="med-pct"
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full accent-[rgb(var(--c-brand))]"
          />
          <div className="flex justify-between text-[11px] text-ink-faint">
            <span>0%</span>
            {pctAnterior > 0 && <span>anterior: {pctAnterior}%</span>}
            <span>100%</span>
          </div>
          {retrocesso && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-brass-700">
              <AlertTriangle size={13} /> Menor que a medição anterior ({pctAnterior}%). Confira antes de salvar.
            </p>
          )}
        </div>

        <div>
          <label className="rotulo" htmlFor="med-obs">O que foi executado</label>
          <textarea id="med-obs" className="campo min-h-[80px]" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: base e sub-base concluídas; iniciada a imprimação." maxLength={8000} />
        </div>

        <div>
          <p className="rotulo">Fotos do canteiro</p>
          <input ref={arquivoRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => adicionar(e.target.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => adicionar(e.target.files)} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {fotos.map((f, i) => (
              <div key={f.url} className="overflow-hidden rounded-btn border border-line">
                <div className="relative aspect-[4/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFotos((a) => a.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                    aria-label="Remover foto"
                  >
                    <X size={13} />
                  </button>
                </div>
                <input
                  value={f.legenda}
                  onChange={(e) => setFotos((a) => a.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))}
                  placeholder="Legenda"
                  maxLength={255}
                  className="w-full border-0 border-t border-line px-2 py-1.5 text-xs focus:ring-0"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-btn border border-dashed border-line-strong text-xs text-ink-muted hover:border-brand hover:text-brand"
            >
              <ImagePlus size={20} /> Adicionar fotos
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-btn border border-dashed border-line-strong text-xs text-ink-muted hover:border-brand hover:text-brand sm:hidden"
            >
              <Camera size={20} /> Tirar foto
            </button>
          </div>
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
        <span className="mr-auto text-xs text-ink-muted">
          {pct}% executado{valor ? ` · ${moeda(valor)}` : ""} · {fotos.length} foto(s)
        </span>
        <button className="botao-fantasma" onClick={aoFechar} disabled={ocupado}>Cancelar</button>
        <button className="botao-primario" onClick={salvar} disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar medição"}
        </button>
      </footer>
    </div>
  );
}
