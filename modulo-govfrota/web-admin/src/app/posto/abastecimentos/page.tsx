"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle, CalendarDays, CheckCircle2, Download, Eye, Files, Fuel, Layers, RotateCcw,
  Search, Upload, User, X,
} from "lucide-react";
import { AbastecimentoPosto, baixarCsv, brl, dataHora, lembrarPeriodo, litros, nomeProprio, periodoDe, periodoLembrado, portal } from "@/lib/portalPosto";
import {
  dataCurta, EnviarNota, EnvioLote, hora, Placa, rotuloDia, SeletorPeriodo, StatusNota, useEsc, veiculo,
} from "@/components/posto/notas";

const FILTROS = [
  { v: "PENDENTE", l: "Sem nota" },
  { v: "ENVIADA", l: "Com nota" },
  { v: "", l: "Todos" },
];

function Detalhe({ a, onFechar, onEnviar }: { a: AbastecimentoPosto; onFechar: () => void; onEnviar: () => void }) {
  useEsc(onFechar);
  const [previa, setPrevia] = useState<string | null>(null);
  const n = a.nota;
  useEffect(() => {
    if (!n?.pdf_id) return;
    let url: string | null = null;
    portal.blobNota(a.id, n.pdf_id).then((b) => { url = URL.createObjectURL(b); setPrevia(url); }).catch(() => setPrevia(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [a.id, n?.pdf_id]);
  const campos: [string, React.ReactNode][] = [
    ["Data e hora", dataHora(a.data)],
    ["Veículo", <span key="v" className="inline-flex items-center gap-2"><Placa placa={a.placa} /> {veiculo(a)}</span>],
    ["Motorista", a.motorista ?? "—"],
    ["Secretaria", a.secretaria ?? "—"],
    ["Combustível", nomeProprio(a.combustivel)],
    ["Litros", litros(a.litros)],
    ["Preço por litro", brl(a.preco_litro)],
  ];
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#0F172A]/40 backdrop-blur-[2px]" onClick={onFechar}>
      <aside role="dialog" aria-modal="true" aria-label="Detalhes do abastecimento" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-elevated">
        <div className="flex items-start justify-between border-b border-surface-border px-6 py-4">
          <div>
            <p className="font-mono text-meta font-semibold text-[#1D4ED8]">{a.numero ?? "Abastecimento"}</p>
            <p className="text-2xl font-semibold tabular-nums text-text-title">{brl(a.valor)}</p>
          </div>
          <button className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6]" aria-label="Fechar" onClick={onFechar}><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <dl className="divide-y divide-surface-border rounded-xl border border-surface-border text-body-sm">
            {campos.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-text-subtle">{k}</dt>
                <dd className="text-right text-text-title">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-3 rounded-xl border border-surface-border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-text-title">Nota fiscal</p>
              <StatusNota a={a} />
            </div>
            {n ? (
              <>
                {(n.valor != null || n.chave) && (
                  <div className="space-y-1 text-body-sm">
                    {n.valor != null && <p className="text-text-body">Valor lido na nota: <strong className="tabular-nums">{brl(n.valor)}</strong></p>}
                    {n.chave && <p className="break-all font-mono text-meta text-text-subtle">{n.chave}</p>}
                  </div>
                )}
                {n.substituida && <p className="text-meta text-text-subtle">Substituída · {n.motivo_substituicao}</p>}
                {n.avisos.map((v) => (
                  <p key={v} className="flex gap-1.5 rounded-lg bg-[#FFF4D6] px-2.5 py-1.5 text-meta text-[#805600]"><AlertTriangle size={14} className="shrink-0" />{v}</p>
                ))}
                {previa && <iframe title="Nota fiscal" src={previa} className="h-80 w-full rounded-lg border border-surface-border" />}
                <div className="flex flex-wrap gap-2">
                  {n.pdf_id && (
                    <button className="btn btn-secondary btn-sm" onClick={() => portal.baixarNota(a.id, n.pdf_id!, `NF-${n.numero ?? a.numero ?? a.placa}.pdf`).catch((e) => toast.error((e as Error).message))}>
                      <Download size={14} /> Baixar PDF
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={onEnviar}><RotateCcw size={14} /> Substituir</button>
                </div>
              </>
            ) : (
              <button className="btn btn-primary w-full" onClick={onEnviar}><Upload size={16} /> Enviar nota fiscal</button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Cartao({ rotulo, valor, detalhe, icone: Icone }: { rotulo: string; valor: string; detalhe?: string; icone: typeof Fuel }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-surface-border bg-white p-4 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F5FF] text-[#1D4ED8]"><Icone size={18} /></span>
      <div className="min-w-0">
        <p className="text-meta text-text-subtle">{rotulo}</p>
        <p className="truncate text-xl font-semibold tabular-nums text-text-title">{valor}</p>
        {detalhe && <p className="text-meta tabular-nums text-text-subtle">{detalhe}</p>}
      </div>
    </div>
  );
}

export default function AbastecimentosPosto() {
  const [[inicio, fim], setPeriodo] = useState<[string, string]>(periodoDe("mes"));
  const [filtro, setFiltro] = useState("PENDENTE");
  const [busca, setBusca] = useState("");
  const [agrupar, setAgrupar] = useState(false);
  const [aberto, setAberto] = useState<AbastecimentoPosto | null>(null);
  const [enviando, setEnviando] = useState<AbastecimentoPosto | null>(null);
  const [lote, setLote] = useState(false);
  const [lista, setLista] = useState<AbastecimentoPosto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pendentes, setPendentes] = useState<{ qtd: number; valor: number } | null>(null);

  const [soAviso, setSoAviso] = useState(false);

  // Filtros vindos da URL (links do Início): ?nota=ENVIADA|TODOS|PENDENTE&busca=…&aviso=1&agrupar=1
  useEffect(() => {
    setPeriodo(periodoLembrado());
    const q = new URLSearchParams(window.location.search);
    const nota = q.get("nota");
    if (nota) setFiltro(nota === "TODOS" ? "" : nota);
    if (q.get("busca")) setBusca(q.get("busca")!);
    if (q.get("aviso") === "1") { setSoAviso(true); setFiltro("ENVIADA"); }
    if (q.get("agrupar") === "1") setAgrupar(true);
  }, []);

  const mudaPeriodo = (p: [string, string]) => {
    setPeriodo(p);
    lembrarPeriodo(p);
  };

  const carregar = useCallback(() => {
    setCarregando(true);
    portal.painel().then((p) => setPendentes({ qtd: p.notas.pendentes, valor: p.notas.valor_pendente })).catch(() => setPendentes(null));
    return portal
      .abastecimentos({ inicio, fim, nota: filtro || undefined })
      .then(setLista)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setCarregando(false));
  }, [inicio, fim, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = soAviso ? lista.filter((a) => (a.nota?.avisos.length ?? 0) > 0) : lista;
    if (!t) return base;
    return base.filter((a) =>
      [a.numero, a.placa, a.marca, a.modelo, a.motorista, a.combustivel, a.secretaria, a.nota?.numero].some((v) => v?.toLowerCase().includes(t)),
    );
  }, [lista, busca, soAviso]);

  const tot = useMemo(() => {
    let valor = 0, l = 0, sem = 0;
    for (const a of filtrada) {
      valor += a.valor ?? 0;
      l += a.litros;
      if (!a.nota) sem++;
    }
    return { valor, l, sem, com: filtrada.length - sem };
  }, [filtrada]);

  // Grupos: por secretaria (opcional) ou por dia (padrão).
  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; itens: AbastecimentoPosto[]; valor: number; litros: number }>();
    for (const a of filtrada) {
      const k = agrupar ? a.secretaria ?? "Sem secretaria" : new Date(a.data).toDateString();
      const g = m.get(k) ?? { nome: agrupar ? k : rotuloDia(a.data), itens: [], valor: 0, litros: 0 };
      g.itens.push(a);
      g.valor += a.valor ?? 0;
      g.litros += a.litros;
      m.set(k, g);
    }
    const arr = Array.from(m.values());
    return agrupar ? arr.sort((a, b) => b.valor - a.valor) : arr;
  }, [filtrada, agrupar]);

  const exportar = () =>
    baixarCsv(
      `abastecimentos-${filtro === "PENDENTE" ? "sem-nota" : `${inicio}-a-${fim}`}.csv`,
      ["Número", "Data", "Placa", "Marca", "Modelo", "Motorista", "Secretaria", "Combustível", "Litros", "Preço/L", "Valor", "Nota fiscal"],
      filtrada.map((a) => [a.numero, dataHora(a.data), a.placa, a.marca, a.modelo, a.motorista, a.secretaria, nomeProprio(a.combustivel), a.litros,
        a.preco_litro, a.valor, a.nota ? (a.nota.numero ? `NF ${a.nota.numero}` : "Enviada") : "Pendente"]),
    );

  const aoEnviar = () => {
    setEnviando(null);
    setAberto(null);
    carregar();
  };

  const semPeriodo = filtro === "PENDENTE";
  const tudoEmDia = pendentes !== null && pendentes.qtd === 0;
  const pct = filtrada.length ? Math.round((tot.com * 100) / filtrada.length) : 0;

  const acoes = (a: AbastecimentoPosto) =>
    a.nota ? (
      <div className="flex items-center justify-end gap-2">
        <StatusNota a={a} />
        <button className="rounded-lg p-1.5 text-text-subtle opacity-0 transition hover:bg-[#F3F4F6] hover:text-text-title focus:opacity-100 group-hover:opacity-100"
          title="Ver detalhes" onClick={(e) => { e.stopPropagation(); setAberto(a); }}><Eye size={16} /></button>
      </div>
    ) : (
      <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setEnviando(a); }}>
        <Upload size={14} /> Enviar nota
      </button>
    );

  const linha = (a: AbastecimentoPosto) => (
    <tr key={a.id} onClick={() => setAberto(a)} className="group cursor-pointer border-b border-surface-border transition last:border-0 hover:bg-[#F8FAFF]">
      <td className="whitespace-nowrap px-5 py-3.5">
        <p className="font-mono text-body-sm font-semibold text-[#1D4ED8]">{a.numero ?? "—"}</p>
        <p className="text-meta tabular-nums text-text-subtle">{dataCurta(a.data)} · {hora(a.data)}</p>
      </td>
      <td className="py-3.5 pr-4">
        <div className="flex items-center gap-3">
          <Placa placa={a.placa} />
          <span className="text-meta text-text-subtle">{veiculo(a)}</span>
        </div>
      </td>
      <td className="py-3.5 pr-4">
        <p className="text-text-title">{a.motorista ?? "—"}</p>
        {!agrupar && <p className="text-meta text-text-subtle">{a.secretaria ?? "—"}</p>}
      </td>
      <td className="py-3.5 pr-4 text-text-body">{nomeProprio(a.combustivel)}</td>
      <td className="whitespace-nowrap py-3.5 pr-4 text-right tabular-nums">
        <p className="text-text-title">{litros(a.litros)}</p>
        <p className="text-meta text-text-subtle">{brl(a.preco_litro)}/L</p>
      </td>
      <td className="whitespace-nowrap py-3.5 pr-4 text-right text-body font-semibold tabular-nums text-text-title">{brl(a.valor)}</td>
      <td className="px-5 py-3.5 text-right">{acoes(a)}</td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 tracking-tight text-text-title">Abastecimentos</h1>
          <p className="text-body-sm text-text-subtle">Envie o PDF da nota fiscal de cada abastecimento feito pelos veículos da prefeitura.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={exportar} disabled={!filtrada.length}><Download size={14} /> Exportar</button>
          <button className="btn btn-primary btn-sm" onClick={() => setLote(true)}><Files size={14} /> Enviar notas em lote</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
        {tudoEmDia ? (
          <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#E7F8EC] to-[#F4FCF6] p-5 ring-1 ring-[#B7E4C7]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#16A34A] shadow-sm"><CheckCircle2 size={26} /></span>
            <div>
              <p className="text-lg font-semibold text-[#0B3D20]">Tudo em dia</p>
              <p className="text-body-sm text-[#106D34]">Todos os abastecimentos já têm nota fiscal.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-[#FFF4D6] to-[#FFFBF0] p-5 ring-1 ring-[#F5D78E]">
            <div>
              <p className="text-body-sm font-medium text-[#805600]">Notas pendentes</p>
              <p className="text-3xl font-bold tabular-nums text-[#5C4200]">{pendentes?.qtd ?? "…"}</p>
              <p className="text-body-sm tabular-nums text-[#805600]">{pendentes ? `${brl(pendentes.valor)} aguardando nota` : ""}</p>
            </div>
            <button className="btn btn-primary" onClick={() => { setFiltro("PENDENTE"); setBusca(""); }}>
              <Upload size={16} /> Enviar agora
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Cartao icone={Fuel} rotulo={semPeriodo ? "Sem nota (todas as datas)" : "Abastecimentos"} valor={String(filtrada.length)} detalhe={brl(tot.valor)} />
          <Cartao icone={Fuel} rotulo="Litros" valor={litros(tot.l)} />
          <div className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-meta text-text-subtle">Com nota</p>
            <p className="text-xl font-semibold tabular-nums text-text-title">{tot.com} <span className="text-body-sm font-normal text-text-subtle">de {filtrada.length}</span></p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
              <div className={`h-full rounded-full ${pct === 100 ? "bg-[#16A34A]" : "bg-[#1D4ED8]"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex rounded-xl bg-[#EEF2F7] p-1">
          {FILTROS.map((f) => (
            <button key={f.v} type="button" role="tab" aria-selected={filtro === f.v} onClick={() => setFiltro(f.v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-body-sm transition ${filtro === f.v ? "bg-white font-semibold text-text-title shadow-sm" : "text-text-subtle hover:text-text-title"}`}>
              {f.l}
              {f.v === "PENDENTE" && !!pendentes?.qtd && (
                <span className="rounded-pill bg-[#D92D20] px-1.5 text-[10px] font-bold leading-4 text-white">{pendentes.qtd}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
          <input className="input !rounded-xl !pl-9 !pr-9" placeholder="Buscar por nº (AB-2026/…), placa, modelo, motorista ou nº da nota…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {busca && (
            <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-title">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {semPeriodo ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-meta text-text-subtle ring-1 ring-surface-border">
            <CalendarDays size={14} /> Todas as datas
          </span>
        ) : (
          <SeletorPeriodo inicio={inicio} fim={fim} onChange={mudaPeriodo} />
        )}
        {soAviso && (
          <button onClick={() => setSoAviso(false)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#FFF4D6] px-3 py-2 text-body-sm text-[#805600]">
            Só com aviso <X size={14} />
          </button>
        )}
        <button type="button" aria-pressed={agrupar} onClick={() => setAgrupar(!agrupar)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-body-sm transition ${agrupar ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : "border-surface-border bg-white text-text-body hover:bg-[#F8FAFC]"}`}>
          <Layers size={14} /> Por secretaria
        </button>
      </div>

      {carregando ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white shadow-card" />)}</div>
      ) : filtrada.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-surface-border bg-white px-4 py-14 text-center">
          {semPeriodo && !busca ? <CheckCircle2 className="h-10 w-10 text-[#16A34A]" /> : <Fuel className="h-10 w-10 text-text-subtle" />}
          <p className="text-body font-medium text-text-title">{semPeriodo && !busca ? "Nenhuma nota pendente" : "Nenhum abastecimento encontrado"}</p>
          <p className="text-body-sm text-text-subtle">{busca ? "Tente outro termo de busca." : semPeriodo ? "Todos os abastecimentos já têm nota fiscal." : "Escolha outro período."}</p>
        </div>
      ) : (
        <>
          {/* Celular: cartões */}
          <div className="space-y-4 md:hidden">
            {grupos.map((g) => (
              <div key={g.nome} className="space-y-2">
                <p className="flex justify-between px-1 text-meta font-semibold uppercase tracking-wide text-text-subtle">
                  <span className="first-letter:uppercase">{g.nome}</span><span className="tabular-nums">{brl(g.valor)}</span>
                </p>
                {g.itens.map((a) => (
                  <div key={a.id} onClick={() => setAberto(a)} className="space-y-3 rounded-2xl border border-surface-border bg-white p-4 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5">
                        <p className="font-mono text-meta font-semibold text-[#1D4ED8]">{a.numero}</p>
                        <Placa placa={a.placa} />
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold tabular-nums text-text-title">{brl(a.valor)}</p>
                        <p className="text-meta tabular-nums text-text-subtle">{litros(a.litros)} · {hora(a.data)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-body-sm text-text-body">
                      <span className="flex items-center gap-1 truncate"><User className="h-3.5 w-3.5 text-text-subtle" />{a.motorista ?? "—"}</span>
                      <span className="text-meta text-text-subtle">{nomeProprio(a.combustivel)}</span>
                    </div>
                    {a.nota ? <StatusNota a={a} /> : (
                      <button className="btn btn-primary w-full" onClick={(e) => { e.stopPropagation(); setEnviando(a); }}>
                        <Upload size={16} /> Enviar nota
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card md:block">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-body-sm">
                <thead className="sticky top-0 z-10 bg-[#F8FAFC]/95 backdrop-blur">
                  <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wider text-text-subtle">
                    <th className="px-5 py-3 font-semibold">Nº / data</th>
                    <th className="py-3 pr-4 font-semibold">Veículo</th>
                    <th className="py-3 pr-4 font-semibold">Motorista</th>
                    <th className="py-3 pr-4 font-semibold">Combustível</th>
                    <th className="py-3 pr-4 text-right font-semibold">Litros</th>
                    <th className="py-3 pr-4 text-right font-semibold">Valor</th>
                    <th className="px-5 py-3 text-right font-semibold">Nota fiscal</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <Fragment key={g.nome}>
                      <tr className="border-b border-surface-border bg-[#FBFCFE]">
                        <td colSpan={4} className="px-5 py-2">
                          <span className="text-meta font-semibold uppercase tracking-wide text-text-title first-letter:uppercase">{g.nome}</span>
                          <span className="ml-2 text-meta text-text-subtle">{g.itens.length} abastecimento(s)</span>
                        </td>
                        <td className="py-2 pr-4 text-right text-meta font-medium tabular-nums text-text-subtle">{litros(g.litros)}</td>
                        <td className="py-2 pr-4 text-right text-meta font-semibold tabular-nums text-text-body">{brl(g.valor)}</td>
                        <td />
                      </tr>
                      {g.itens.map(linha)}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-[#F8FAFC]/95 backdrop-blur">
                  <tr className="border-t border-surface-border font-semibold text-text-title">
                    <td className="px-5 py-3" colSpan={4}>{filtrada.length} abastecimento(s)</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{litros(tot.l)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{brl(tot.valor)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {aberto && !enviando && <Detalhe a={aberto} onFechar={() => setAberto(null)} onEnviar={() => setEnviando(aberto)} />}
      {enviando && <EnviarNota a={enviando} onFechar={() => setEnviando(null)} onEnviada={aoEnviar} />}
      {lote && <EnvioLote onFechar={() => { setLote(false); carregar(); }} onConcluido={carregar} />}
    </div>
  );
}
