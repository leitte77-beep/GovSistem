"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle, Car, CheckCircle2, Download, Droplets, FileCode2, FileText, FileUp, Fuel, Layers, Search, Upload, User, X,
} from "lucide-react";
import { Kpi } from "@/components/posto/Kpi";
import {
  AbastecimentoPosto, Atalho, baixarCsv, brl, dataHora, lembrarPeriodo, litros, nomeProprio, periodoDe, periodoLembrado, portal,
} from "@/lib/portalPosto";

const FILTROS = [
  { v: "PENDENTE", l: "Sem nota" },
  { v: "ENVIADA", l: "Com nota" },
  { v: "", l: "Todos" },
];

const ATALHOS: { k: Atalho; l: string }[] = [
  { k: "hoje", l: "Hoje" },
  { k: "7d", l: "7 dias" },
  { k: "mes", l: "Este mês" },
  { k: "mesPassado", l: "Mês passado" },
];

const veiculo = (a: AbastecimentoPosto) => [a.marca, a.modelo].filter(Boolean).join(" ") || "—";

function StatusNota({ a }: { a: AbastecimentoPosto }) {
  if (!a.nota) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-[#FFF4D6] px-2 py-0.5 text-meta font-medium text-[#805600]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E0A100]" /> Sem nota
      </span>
    );
  }
  const aviso = a.nota.avisos.length > 0;
  return (
    <span title={a.nota.avisos.join("\n") || undefined}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2 py-0.5 text-meta font-medium ${aviso ? "bg-[#FFF4D6] text-[#805600]" : "bg-[#E7F8EC] text-[#106D34]"}`}>
      {aviso ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
      {a.nota.numero ? `NF ${a.nota.numero}` : "PDF enviado"}
    </span>
  );
}

/** Janela de envio: arraste ou escolha o XML e/ou o PDF (DANFE). */
function EnviarNota({ a, onFechar, onEnviada }: { a: AbastecimentoPosto; onFechar: () => void; onEnviada: () => void }) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const adicionar = (lista: FileList | null) => {
    if (!lista) return;
    const novos = Array.from(lista).filter((f) => /\.(xml|pdf)$/i.test(f.name));
    if (novos.length < lista.length) toast.error("Só arquivos .xml ou .pdf.");
    // Um de cada tipo: o novo substitui o anterior do mesmo tipo.
    setArquivos((atual) => {
      const m = new Map(atual.map((f) => [f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "xml", f]));
      novos.forEach((f) => m.set(f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "xml", f));
      return Array.from(m.values());
    });
  };

  const enviar = async () => {
    setEnviando(true);
    try {
      const n = await portal.enviarNota(a.id, arquivos);
      if (n.avisos.length) toast(`Nota recebida com aviso: ${n.avisos.join(" ")}`, { icon: "⚠️", duration: 8000 });
      else toast.success(n.numero ? `NF ${n.numero} recebida.` : "Nota recebida.");
      window.dispatchEvent(new Event("posto:nota-enviada"));
      onEnviada();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label="Enviar nota fiscal" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-card bg-white shadow-elevated sm:rounded-card">
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-title">{a.nota ? "Substituir nota fiscal" : "Enviar nota fiscal"}</h2>
            <p className="text-body-sm text-text-subtle">{a.placa} · {dataHora(a.data)}</p>
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="Fechar" onClick={onFechar}><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2 rounded-btn bg-[#F9FAFB] p-3 text-center">
            <div><p className="text-meta text-text-subtle">Combustível</p><p className="text-body-sm font-medium text-text-title">{nomeProprio(a.combustivel)}</p></div>
            <div><p className="text-meta text-text-subtle">Litros</p><p className="text-body-sm font-medium tabular-nums text-text-title">{litros(a.litros)}</p></div>
            <div><p className="text-meta text-text-subtle">Valor da nota</p><p className="text-body-sm font-semibold tabular-nums text-text-title">{brl(a.valor)}</p></div>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
            className={`flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center transition ${arrastando ? "border-[#1D5BD6] bg-[#EFF6FF]" : "border-surface-border hover:border-[#1D5BD6] hover:bg-[#F9FAFB]"}`}
          >
            <FileUp className="h-8 w-8 text-[#1D5BD6]" />
            <span className="text-body-sm font-medium text-text-title">Arraste aqui ou clique para escolher</span>
            <span className="text-meta text-text-subtle">XML da NF-e/NFC-e e/ou PDF (DANFE). De preferência os dois.</span>
          </button>
          <input ref={input} type="file" accept=".xml,.pdf,application/xml,text/xml,application/pdf" multiple hidden
            onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
          {arquivos.length > 0 && (
            <ul className="space-y-1.5">
              {arquivos.map((f) => (
                <li key={f.name} className="flex items-center gap-2 rounded-btn border border-surface-border px-3 py-2 text-body-sm">
                  {f.name.toLowerCase().endsWith(".pdf") ? <FileText size={16} className="text-[#BA1A1A]" /> : <FileCode2 size={16} className="text-[#1D4ED8]" />}
                  <span className="flex-1 truncate">{f.name}</span>
                  <button aria-label={`Remover ${f.name}`} onClick={() => setArquivos(arquivos.filter((x) => x !== f))} className="text-text-subtle hover:text-text-title"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {a.nota && <p className="text-meta text-text-subtle">O arquivo novo substitui o anterior do mesmo tipo. O histórico fica guardado.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
          <button className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!arquivos.length || enviando} onClick={enviar}>
            <Upload size={16} /> {enviando ? "Enviando…" : "Enviar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detalhe({ a, onFechar, onEnviar }: { a: AbastecimentoPosto; onFechar: () => void; onEnviar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  const baixar = (id: string, nome: string) => portal.baixarNota(a.id, id, nome).catch((e) => toast.error((e as Error).message));
  const campos: [string, React.ReactNode][] = [
    ["Data e hora", dataHora(a.data)],
    ["Veículo", <>{a.placa} <span className="text-text-subtle">· {veiculo(a)}</span></>],
    ["Motorista", a.motorista ?? "—"],
    ["Secretaria", a.secretaria ?? "—"],
    ["Combustível", nomeProprio(a.combustivel)],
    ["Litros", litros(a.litros)],
    ["Preço por litro", brl(a.preco_litro)],
  ];
  const n = a.nota;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onFechar}>
      <aside role="dialog" aria-modal="true" aria-label="Detalhes do abastecimento" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-elevated">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <p className="text-meta text-text-subtle">Abastecimento</p>
            <p className="text-lg font-semibold text-text-title">{brl(a.valor)}</p>
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="Fechar" onClick={onFechar}><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <dl className="divide-y divide-surface-border text-body-sm">
            {campos.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-text-subtle">{k}</dt>
                <dd className="text-right text-text-title">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-card border border-surface-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-text-title">Nota fiscal</p>
              <StatusNota a={a} />
            </div>
            {n ? (
              <div className="space-y-2 text-body-sm">
                {n.valor != null && <p className="text-text-body">Valor na nota: <strong>{brl(n.valor)}</strong></p>}
                {n.chave && <p className="break-all text-meta text-text-subtle">Chave {n.chave}</p>}
                {n.avisos.map((v) => (
                  <p key={v} className="flex gap-1.5 rounded-btn bg-[#FFF4D6] px-2 py-1 text-meta text-[#805600]"><AlertTriangle size={14} className="shrink-0" />{v}</p>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  {n.xml_id && <button className="btn btn-secondary btn-sm" onClick={() => baixar(n.xml_id!, `NF-${n.numero ?? a.placa}.xml`)}><FileCode2 size={14} /> XML</button>}
                  {n.pdf_id && <button className="btn btn-secondary btn-sm" onClick={() => baixar(n.pdf_id!, `NF-${n.numero ?? a.placa}.pdf`)}><FileText size={14} /> PDF</button>}
                  <button className="btn btn-ghost btn-sm" onClick={onEnviar}><Upload size={14} /> Substituir</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-primary w-full" onClick={onEnviar}><Upload size={16} /> Enviar nota fiscal</button>
            )}
          </div>
        </div>
      </aside>
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
  const [lista, setLista] = useState<AbastecimentoPosto[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => setPeriodo(periodoLembrado()), []);

  const mudaPeriodo = (p: [string, string]) => {
    setPeriodo(p);
    lembrarPeriodo(p);
  };

  const carregar = useCallback(() => {
    setCarregando(true);
    return portal
      .abastecimentos({ inicio, fim, nota: filtro || undefined })
      .then(setLista)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setCarregando(false));
  }, [inicio, fim, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((a) =>
      [a.placa, a.marca, a.modelo, a.motorista, a.combustivel, a.secretaria, a.nota?.numero].some((v) => v?.toLowerCase().includes(t)),
    );
  }, [lista, busca]);

  const tot = useMemo(() => {
    let valor = 0, l = 0, sem = 0, semValor = 0;
    for (const a of filtrada) {
      valor += a.valor ?? 0;
      l += a.litros;
      if (!a.nota) { sem++; semValor += a.valor ?? 0; }
    }
    return { valor, l, sem, semValor };
  }, [filtrada]);

  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; itens: AbastecimentoPosto[]; valor: number; litros: number }>();
    for (const a of filtrada) {
      const k = a.secretaria ?? "Sem secretaria";
      const g = m.get(k) ?? { nome: k, itens: [], valor: 0, litros: 0 };
      g.itens.push(a);
      g.valor += a.valor ?? 0;
      g.litros += a.litros;
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [filtrada]);

  const exportar = () =>
    baixarCsv(
      `abastecimentos-${filtro === "PENDENTE" ? "sem-nota" : `${inicio}-a-${fim}`}.csv`,
      ["Data", "Placa", "Marca", "Modelo", "Motorista", "Secretaria", "Combustível", "Litros", "Preço/L", "Valor", "Nota fiscal"],
      filtrada.map((a) => [dataHora(a.data), a.placa, a.marca, a.modelo, a.motorista, a.secretaria, nomeProprio(a.combustivel), a.litros,
        a.preco_litro, a.valor, a.nota ? (a.nota.numero ?? "PDF") : "Sem nota"]),
    );

  const aoEnviar = () => {
    setEnviando(null);
    setAberto(null);
    carregar();
  };

  const atalhoAtivo = ATALHOS.find((a) => { const [i, f] = periodoDe(a.k); return i === inicio && f === fim; })?.k;
  const semPeriodo = filtro === "PENDENTE";

  const acao = (a: AbastecimentoPosto) =>
    a.nota ? (
      <StatusNota a={a} />
    ) : (
      <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setEnviando(a); }}>
        <Upload size={14} /> Enviar nota
      </button>
    );

  const linha = (a: AbastecimentoPosto) => (
    <tr key={a.id} onClick={() => setAberto(a)} className="cursor-pointer border-b border-surface-border transition last:border-0 hover:bg-[#F9FAFB]">
      <td className="whitespace-nowrap px-4 py-3 text-text-body">{dataHora(a.data)}</td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 shrink-0 text-text-subtle" />
          <div>
            <p className="font-medium text-text-title">{a.placa}</p>
            <p className="text-meta text-text-subtle">{veiculo(a)}</p>
          </div>
        </div>
      </td>
      <td className="py-3">
        <p className="text-text-body">{a.motorista ?? "—"}</p>
        {!agrupar && <p className="text-meta text-text-subtle">{a.secretaria ?? "—"}</p>}
      </td>
      <td className="py-3 text-text-body">{nomeProprio(a.combustivel)}</td>
      <td className="whitespace-nowrap py-3 text-right tabular-nums text-text-body">
        {litros(a.litros)} <span className="text-text-subtle">× {brl(a.preco_litro)}</span>
      </td>
      <td className="whitespace-nowrap py-3 pl-4 text-right font-semibold tabular-nums text-text-title">{brl(a.valor)}</td>
      <td className="px-4 py-3 text-right">{acao(a)}</td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text-title">Abastecimentos</h1>
          <p className="text-body-sm text-text-subtle">Envie a nota fiscal de cada abastecimento feito pelos veículos da prefeitura.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportar} disabled={!filtrada.length}><Download size={14} /> Exportar (Excel)</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Fuel} rotulo="Abastecimentos" valor={String(filtrada.length)} nota={brl(tot.valor)} />
        <Kpi icon={Droplets} rotulo="Litros" valor={litros(tot.l)} />
        <Kpi icon={CheckCircle2} rotulo="Com nota" valor={String(filtrada.length - tot.sem)} tom={filtrada.length && !tot.sem ? "verde" : "neutro"} />
        <Kpi icon={FileUp} rotulo="Sem nota" valor={String(tot.sem)} nota={brl(tot.semValor)} tom={tot.sem > 0 ? "amarelo" : "neutro"} />
      </div>

      <div className="space-y-3 rounded-card border border-surface-border bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" className="inline-flex rounded-pill bg-[#F3F4F6] p-1">
            {FILTROS.map((f) => (
              <button key={f.v} type="button" role="tab" aria-selected={filtro === f.v} onClick={() => setFiltro(f.v)}
                className={`rounded-pill px-3 py-1 text-body-sm transition ${filtro === f.v ? "bg-white font-medium text-text-title shadow-card" : "text-text-subtle hover:text-text-title"}`}>
                {f.l}
              </button>
            ))}
          </div>
          {semPeriodo ? (
            <p className="text-body-sm text-text-subtle">Mostrando todos os abastecimentos ainda sem nota, de qualquer data.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {ATALHOS.map((a) => (
                <button key={a.k} type="button" onClick={() => mudaPeriodo(periodoDe(a.k))}
                  className={`rounded-pill border px-3 py-1 text-body-sm transition ${atalhoAtivo === a.k ? "border-[#1D4ED8] bg-[#1D4ED8] text-white" : "border-surface-border text-text-body hover:bg-[#F3F4F6]"}`}>
                  {a.l}
                </button>
              ))}
              <div className="flex items-center gap-2 text-body-sm text-text-subtle">
                <input type="date" aria-label="De" className="input !w-auto !py-1" value={inicio} max={fim} onChange={(e) => e.target.value && mudaPeriodo([e.target.value, fim])} />
                até
                <input type="date" aria-label="Até" className="input !w-auto !py-1" value={fim} min={inicio} onChange={(e) => e.target.value && mudaPeriodo([inicio, e.target.value])} />
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
            <input className="input !pl-9 !pr-9" placeholder="Buscar por placa, modelo, motorista, secretaria, nº da nota…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {busca && (
              <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-title">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button type="button" aria-pressed={agrupar} onClick={() => setAgrupar(!agrupar)}
            className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-body-sm transition ${agrupar ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]" : "border-surface-border text-text-body hover:bg-[#F3F4F6]"}`}>
            <Layers size={14} /> Agrupar por secretaria
          </button>
        </div>
      </div>

      {carregando ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-white shadow-card" />)}</div>
      ) : filtrada.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-surface-border bg-white px-4 py-12 text-center">
          {semPeriodo && !busca ? <CheckCircle2 className="h-8 w-8 text-[#16A34A]" /> : <Fuel className="h-8 w-8 text-text-subtle" />}
          <p className="font-medium text-text-title">{semPeriodo && !busca ? "Todas as notas foram enviadas" : "Nenhum abastecimento encontrado"}</p>
          <p className="text-body-sm text-text-subtle">{busca ? "Tente outro termo de busca." : semPeriodo ? "Não há abastecimento esperando nota fiscal." : "Escolha outro período."}</p>
        </div>
      ) : (
        <>
          {/* Celular: cartões */}
          <div className="space-y-2 md:hidden">
            {filtrada.map((a) => (
              <div key={a.id} onClick={() => setAberto(a)} className="rounded-card border border-surface-border bg-white p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-text-title">{a.placa}</p>
                    <p className="text-meta text-text-subtle">{veiculo(a)}</p>
                  </div>
                  <p className="text-right font-semibold tabular-nums text-text-title">{brl(a.valor)}</p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-body-sm text-text-body">
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-text-subtle" />{a.motorista ?? "—"}</span>
                  <span className="text-right text-text-subtle">{dataHora(a.data)}</span>
                  <span>{nomeProprio(a.combustivel)}</span>
                  <span className="text-right tabular-nums">{litros(a.litros)} × {brl(a.preco_litro)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-meta text-text-subtle">{a.secretaria ?? "—"}</span>
                  {acao(a)}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden overflow-x-auto rounded-card border border-surface-border bg-white shadow-card md:block">
            <table className="w-full text-body-sm">
              <thead className="bg-[#F9FAFB]">
                <tr className="border-b border-surface-border text-left text-meta uppercase tracking-wide text-text-subtle">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="py-3 font-medium">Veículo</th>
                  <th className="py-3 font-medium">Motorista</th>
                  <th className="py-3 font-medium">Combustível</th>
                  <th className="py-3 text-right font-medium">Litros × Preço</th>
                  <th className="py-3 pl-4 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-right font-medium">Nota fiscal</th>
                </tr>
              </thead>
              <tbody>
                {agrupar
                  ? grupos.map((g) => (
                    <Fragment key={g.nome}>
                      <tr className="border-b border-surface-border bg-[#F3F6FC]">
                        <td colSpan={4} className="px-4 py-2">
                          <span className="font-semibold text-text-title">{g.nome}</span>
                          <span className="ml-2 text-meta text-text-subtle">{g.itens.length} abastecimento(s)</span>
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">{litros(g.litros)}</td>
                        <td className="py-2 pl-4 text-right font-semibold tabular-nums">{brl(g.valor)}</td>
                        <td />
                      </tr>
                      {g.itens.map(linha)}
                    </Fragment>
                  ))
                  : filtrada.map(linha)}
              </tbody>
              <tfoot>
                <tr className="border-t border-surface-border bg-[#F9FAFB] font-semibold text-text-title">
                  <td className="px-4 py-3" colSpan={4}>{filtrada.length} abastecimento(s)</td>
                  <td className="py-3 text-right tabular-nums">{litros(tot.l)}</td>
                  <td className="py-3 pl-4 text-right tabular-nums">{brl(tot.valor)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {aberto && !enviando && <Detalhe a={aberto} onFechar={() => setAberto(null)} onEnviar={() => setEnviando(aberto)} />}
      {enviando && <EnviarNota a={enviando} onFechar={() => setEnviando(null)} onEnviada={aoEnviar} />}
    </div>
  );
}
