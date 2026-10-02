"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, FileText, FileUp, Files, RotateCcw, Upload, X,
} from "lucide-react";
import { AbastecimentoPosto, AnaliseNota, Atalho, brl, dataHora, litros, nomeProprio, periodoDe, portal } from "@/lib/portalPosto";

/** Peças comuns do portal do posto: placa, situação da nota, período e envio de notas (uma ou em lote). */

export const ATALHOS: { k: Atalho; l: string }[] = [
  { k: "hoje", l: "Hoje" },
  { k: "7d", l: "Últimos 7 dias" },
  { k: "mes", l: "Este mês" },
  { k: "mesPassado", l: "Mês passado" },
];

export type Motivo = { codigo: string; descricao: string };

export const veiculo = (a: AbastecimentoPosto) => [a.marca, a.modelo].filter(Boolean).join(" ") || "—";
export const dataCurta = (d: string) => new Date(d).toLocaleDateString("pt-BR");
export const hora = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function rotuloDia(d: string) {
  const dia = new Date(d);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (dia.toDateString() === hoje.toDateString()) return "Hoje";
  if (dia.toDateString() === ontem.toDateString()) return "Ontem";
  return dia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

/** Placa no padrão visual Mercosul. */
export function Placa({ placa }: { placa: string }) {
  return (
    <span className="inline-flex flex-col overflow-hidden rounded-[5px] border-[1.5px] border-[#1F2937] bg-white text-center leading-none shadow-sm">
      <span className="h-[5px] bg-[#1D4ED8]" />
      <span className="px-1.5 py-[3px] font-mono text-[12px] font-bold tracking-[0.12em] text-[#111827]">{placa}</span>
    </span>
  );
}

export function StatusNota({ a }: { a: AbastecimentoPosto }) {
  if (!a.nota) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-[#FFF4D6] px-2.5 py-1 text-meta font-medium text-[#805600]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E0A100]" /> Pendente
      </span>
    );
  }
  const aviso = a.nota.avisos.length > 0;
  const cls = aviso ? "bg-[#FFF4D6] text-[#805600]" : a.nota.substituida ? "bg-[#F4EBFF] text-[#6941C6]" : "bg-[#E7F8EC] text-[#106D34]";
  const Icone = aviso ? AlertTriangle : a.nota.substituida ? RotateCcw : CheckCircle2;
  const texto = a.nota.substituida ? "Substituída" : "Nota enviada";
  return (
    <span
      title={[...a.nota.avisos, a.nota.substituida ? `Motivo: ${a.nota.motivo_substituicao}` : ""].filter(Boolean).join("\n") || undefined}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-meta font-medium ${cls}`}
    >
      <Icone size={12} /> {texto}{a.nota.numero ? ` · NF ${a.nota.numero}` : ""}
    </span>
  );
}

export function useEsc(fn: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fn();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fn]);
}

export function Modal({ titulo, subtitulo, largo, onFechar, children, rodape }: {
  titulo: string; subtitulo?: React.ReactNode; largo?: boolean; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode;
}) {
  useEsc(onFechar);
  // Portal no body e sem backdrop-blur: o Chrome não repinta o blur por cima do
  // visualizador de PDF (iframe) e deixava uma faixa sem escurecer no topo.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/60 sm:items-center sm:p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-elevated sm:rounded-2xl ${largo ? "max-w-5xl" : "max-w-lg"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-title">{titulo}</h2>
            {subtitulo && <p className="text-body-sm text-text-subtle">{subtitulo}</p>}
          </div>
          <button className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6]" aria-label="Fechar" onClick={onFechar}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border px-6 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function CampoMotivo({ motivos, motivo, setMotivo, detalhe, setDetalhe }: {
  motivos: Motivo[]; motivo: string; setMotivo: (v: string) => void; detalhe: string; setDetalhe: (v: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-[#F5C26B] bg-[#FFF8EB] p-3">
      <label htmlFor="motivo-subst" className="block text-body-sm font-medium text-text-title">
        Motivo da substituição <span className="text-[#BA1A1A]">*</span>
      </label>
      <select id="motivo-subst" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
        <option value="">Selecione…</option>
        {motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.descricao}</option>)}
      </select>
      <textarea className="input min-h-[60px]" maxLength={1000} value={detalhe} onChange={(e) => setDetalhe(e.target.value)}
        placeholder={motivo === "OUTRO" ? "Descreva o motivo (obrigatório)" : "Observação (opcional)"} />
      <p className="text-meta text-[#805600]">A nota anterior fica guardada e a Prefeitura vê o motivo.</p>
    </div>
  );
}

export const motivoValido = (m: string, d: string) => !!m && (m !== "OUTRO" || d.trim().length >= 10);

/** Envio de uma nota (PDF) com prévia do arquivo. */
export function EnviarNota({ a, onFechar, onEnviada }: { a: AbastecimentoPosto; onFechar: () => void; onEnviada: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const substitui = !!a.nota;

  useEffect(() => {
    if (substitui) portal.motivosSubstituicao().then(setMotivos).catch(() => setMotivos([]));
  }, [substitui]);

  useEffect(() => {
    if (!arquivo) return setPrevia(null);
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const escolher = (lista: FileList | null) => {
    const f = lista?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return toast.error("Envie a nota em PDF.");
    setArquivo(f);
  };

  const enviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const n = await portal.enviarNota(a.id, [arquivo], substitui ? { codigo: motivo, detalhe: detalhe.trim() || undefined } : undefined);
      if (n.avisos.length) toast(`Nota recebida com aviso: ${n.avisos.join(" ")}`, { icon: "⚠️", duration: 9000 });
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
    <Modal
      titulo={substitui ? "Substituir nota fiscal" : "Enviar nota fiscal"}
      subtitulo={<>{a.numero ? <b className="font-mono">{a.numero}</b> : null} · {a.placa} · {dataHora(a.data)}</>}
      largo={!!previa}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!arquivo || enviando || (substitui && !motivoValido(motivo, detalhe))} onClick={enviar}>
            <Upload size={16} /> {enviando ? "Enviando…" : substitui ? "Substituir nota" : "Enviar nota"}
          </button>
        </>
      }
    >
      <div className={previa ? "grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]" : "space-y-4"}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#F8FAFC] p-3 text-center ring-1 ring-surface-border">
            <div><p className="text-meta text-text-subtle">Combustível</p><p className="text-body-sm font-medium text-text-title">{nomeProprio(a.combustivel)}</p></div>
            <div><p className="text-meta text-text-subtle">Litros</p><p className="text-body-sm font-medium tabular-nums text-text-title">{litros(a.litros)}</p></div>
            <div><p className="text-meta text-text-subtle">Valor esperado</p><p className="text-body-sm font-semibold tabular-nums text-text-title">{brl(a.valor)}</p></div>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files); }}
            className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${arrastando ? "border-[#1D5BD6] bg-[#EFF6FF]" : "border-surface-border hover:border-[#1D5BD6] hover:bg-[#F8FAFC]"}`}
          >
            <FileUp className="h-8 w-8 text-[#1D5BD6]" />
            <span className="text-body-sm font-medium text-text-title">{arquivo ? arquivo.name : "Arraste o PDF da nota ou clique para escolher"}</span>
            <span className="text-meta text-text-subtle">{arquivo ? "Clique para trocar o arquivo" : "Somente PDF (DANFE)"}</span>
          </button>
          <input ref={input} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => { escolher(e.target.files); e.target.value = ""; }} />
          {substitui && <CampoMotivo motivos={motivos} motivo={motivo} setMotivo={setMotivo} detalhe={detalhe} setDetalhe={setDetalhe} />}
        </div>
        {previa && (
          <iframe title="Prévia da nota" src={previa} className="h-[60vh] w-full rounded-xl border border-surface-border bg-[#F3F4F6]" />
        )}
      </div>
    </Modal>
  );
}

/** Envio em lote: vários PDFs, o sistema lê e sugere o abastecimento de cada um. */
export function EnvioLote({ onFechar, onConcluido }: { onFechar: () => void; onConcluido: () => void }) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [analise, setAnalise] = useState<AnaliseNota[] | null>(null);
  const [escolha, setEscolha] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<Record<number, { ok: boolean; msg: string }>>({});
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState<AbastecimentoPosto[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    portal.abastecimentos({ nota: "PENDENTE" }).then(setPendentes).catch(() => setPendentes([]));
    portal.motivosSubstituicao().then(setMotivos).catch(() => setMotivos([]));
  }, []);

  const ler = async (lista: FileList | null) => {
    const pdfs = Array.from(lista ?? []).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!pdfs.length) return toast.error("Escolha arquivos PDF.");
    if (pdfs.length > 50) return toast.error("Envie até 50 notas por vez.");
    setArquivos(pdfs);
    setStatus({});
    setLendo(true);
    try {
      const r = await portal.analisarNotas(pdfs);
      setAnalise(r);
      setEscolha(Object.fromEntries(r.filter((x) => x.sugestao && !x.ja_enviada && !x.preco_acima?.bloqueada).map((x) => [x.indice, x.sugestao!])));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLendo(false);
    }
  };

  const opcoes = (item: AnaliseNota) => {
    const vistos = new Set<string>();
    const lista: { id: string; rotulo: string; tem_nota: boolean }[] = [];
    for (const c of item.candidatos) {
      vistos.add(c.id);
      lista.push({ id: c.id, rotulo: `${c.numero ?? ""} · ${c.placa} · ${dataCurta(c.data)}${c.litros != null ? ` · ${litros(c.litros)}` : ""} · ${brl(c.valor)}${c.tem_nota ? " (já tem nota)" : ""}`, tem_nota: c.tem_nota });
    }
    for (const p of pendentes) {
      if (!vistos.has(p.id)) lista.push({ id: p.id, rotulo: `${p.numero ?? ""} · ${p.placa} · ${dataCurta(p.data)} · ${brl(p.valor)}`, tem_nota: false });
    }
    return lista;
  };

  const temNota = (id: string) =>
    analise?.some((x) => x.candidatos.some((c) => c.id === id && c.tem_nota)) ?? false;
  const escolhidos = Object.entries(escolha).filter(([, v]) => v);
  const repetidos = new Set(escolhidos.map(([, v]) => v).filter((v, i, arr) => arr.indexOf(v) !== i));
  const precisaMotivo = escolhidos.some(([, v]) => temNota(v));
  const pronto = escolhidos.length > 0 && !repetidos.size && (!precisaMotivo || motivoValido(motivo, detalhe));

  const enviar = async () => {
    setEnviando(true);
    let ok = 0;
    for (const [idx, abastId] of escolhidos) {
      const i = Number(idx);
      if (status[i]?.ok) continue;
      try {
        const n = await portal.enviarNota(abastId, [arquivos[i]], temNota(abastId) ? { codigo: motivo, detalhe: detalhe.trim() || undefined } : undefined);
        ok++;
        setStatus((s) => ({ ...s, [i]: { ok: true, msg: n.avisos.length ? `Enviada com aviso: ${n.avisos.join(" ")}` : "Enviada" } }));
      } catch (e) {
        setStatus((s) => ({ ...s, [i]: { ok: false, msg: (e as Error).message } }));
      }
    }
    setEnviando(false);
    if (ok) {
      toast.success(`${ok} nota(s) enviada(s).`);
      window.dispatchEvent(new Event("posto:nota-enviada"));
      onConcluido();
    }
  };

  return (
    <Modal
      titulo="Enviar notas em lote"
      subtitulo="Selecione vários PDFs: o sistema lê cada nota e sugere o abastecimento. Confira antes de enviar."
      largo
      onFechar={onFechar}
      rodape={analise && (
        <>
          <button className="btn btn-ghost" onClick={() => { setAnalise(null); setArquivos([]); }}>Escolher outros arquivos</button>
          <button className="btn btn-primary" disabled={!pronto || enviando} onClick={enviar}>
            <Upload size={16} /> {enviando ? "Enviando…" : `Enviar ${escolhidos.length} nota(s)`}
          </button>
        </>
      )}
    >
      {!analise ? (
        <button
          type="button"
          disabled={lendo}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); ler(e.dataTransfer.files); }}
          className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-14 text-center transition ${arrastando ? "border-[#1D5BD6] bg-[#EFF6FF]" : "border-surface-border hover:border-[#1D5BD6] hover:bg-[#F8FAFC]"}`}
        >
          <Files className="h-10 w-10 text-[#1D5BD6]" />
          <span className="text-body font-medium text-text-title">{lendo ? `Lendo ${arquivos.length} nota(s)…` : "Arraste os PDFs das notas ou clique para escolher"}</span>
          <span className="text-meta text-text-subtle">Até 50 arquivos. PDFs gerados pelo emissor são lidos automaticamente; escaneados você associa manualmente.</span>
          <input ref={input} type="file" accept=".pdf,application/pdf" multiple hidden onChange={(e) => { ler(e.target.files); e.target.value = ""; }} />
        </button>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full min-w-[820px] text-body-sm">
              <thead className="bg-[#F8FAFC] text-left text-meta uppercase tracking-wide text-text-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Arquivo</th>
                  <th className="px-4 py-2.5 font-medium">Lido na nota</th>
                  <th className="px-4 py-2.5 font-medium">Abastecimento</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {analise.map((it) => {
                  const st = status[it.indice];
                  const sel = escolha[it.indice] ?? "";
                  return (
                    <tr key={it.indice} className="border-t border-surface-border align-top">
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="flex items-center gap-1.5 truncate font-medium text-text-title"><FileText size={14} className="shrink-0 text-[#BA1A1A]" />{it.arquivo}</p>
                      </td>
                      <td className="px-4 py-3 text-meta text-text-body">
                        {it.erro ? <span className="text-[#B42318]">{it.erro}</span> : it.leitura?.texto ? (
                          <>
                            <p>{it.leitura.numero ? `NF ${it.leitura.numero}` : "Número não identificado"}</p>
                            <p className="tabular-nums">{it.leitura.valor != null ? brl(it.leitura.valor) : "Valor não identificado"}</p>
                            {it.leitura.litros != null && (
                              <p className="tabular-nums">{litros(it.leitura.litros)}{it.leitura.preco_unitario != null ? ` × ${brl(it.leitura.preco_unitario)}/L` : ""}</p>
                            )}
                            {(it.leitura.placas?.length || it.leitura.km != null) ? (
                              <p className="text-text-subtle">{it.leitura.placas?.join(", ")}{it.leitura.km != null ? ` · km ${it.leitura.km.toLocaleString("pt-BR")}` : ""}</p>
                            ) : null}
                            {it.leitura.emissao && <p className="text-text-subtle">Emissão {dataCurta(it.leitura.emissao)}</p>}
                          </>
                        ) : <span className="text-text-subtle">PDF sem texto (escaneado)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {it.ja_enviada ? (
                          <p className="text-meta text-[#B42318]">Já enviada em {it.ja_enviada.numero} ({it.ja_enviada.placa}).</p>
                        ) : it.erro ? null : (
                          <>
                            <select className="input !py-1.5 text-body-sm" value={sel} disabled={!!st?.ok}
                              onChange={(e) => setEscolha({ ...escolha, [it.indice]: e.target.value })}>
                              <option value="">Não enviar</option>
                              {opcoes(it).map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                            </select>
                            {sel && sel === it.sugestao && (
                              <p className="mt-1 text-meta text-[#106D34]">Sugestão {it.confianca === "alta" ? "com alta confiança" : "— confira"}</p>
                            )}
                            {it.preco_acima && sel === it.sugestao && (
                              <p className={`mt-1 rounded-lg px-2 py-1 text-meta ${it.preco_acima.bloqueada ? "bg-[#FEE4E2] text-[#B42318]" : "bg-[#FFF4D6] text-[#805600]"}`}>
                                Preço {brl(it.preco_acima.preco_nota)}/L acima do contrato ({brl(it.preco_acima.preco_contrato)}/L): {brl(it.preco_acima.diferenca)} a mais.{" "}
                                {it.preco_acima.bloqueada ? "A Prefeitura não aceita esta nota — emita pelo preço do contrato." : "Será enviada com aviso à Prefeitura."}
                              </p>
                            )}
                            {sel && repetidos.has(sel) && <p className="mt-1 text-meta text-[#B42318]">Abastecimento escolhido para mais de uma nota.</p>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-meta">
                        {st ? (
                          <span className={st.ok ? "text-[#106D34]" : "text-[#B42318]"}>{st.msg}</span>
                        ) : sel && temNota(sel) ? (
                          <span className="text-[#805600]">Vai substituir a nota atual</span>
                        ) : sel ? <span className="text-text-subtle">Pronta</span> : <span className="text-text-subtle">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {precisaMotivo && <CampoMotivo motivos={motivos} motivo={motivo} setMotivo={setMotivo} detalhe={detalhe} setDetalhe={setDetalhe} />}
        </div>
      )}
    </Modal>
  );
}

export function SeletorPeriodo({ inicio, fim, onChange }: { inicio: string; fim: string; onChange: (p: [string, string]) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativo = ATALHOS.find((a) => { const [i, f] = periodoDe(a.k); return i === inicio && f === fim; });
  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    window.addEventListener("click", fechar);
    return () => window.removeEventListener("click", fechar);
  }, [aberto]);
  const br = (d: string) => new Date(`${d}T12:00`).toLocaleDateString("pt-BR");
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setAberto(!aberto)} aria-haspopup="dialog" aria-expanded={aberto}
        className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-white px-3 py-2 text-body-sm text-text-title shadow-sm hover:bg-[#F8FAFC]">
        <CalendarDays size={15} className="text-text-subtle" />
        {ativo ? ativo.l : `${br(inicio)} – ${br(fim)}`}
        <ChevronDown size={14} className="text-text-subtle" />
      </button>
      {aberto && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-surface-border bg-white p-3 shadow-elevated">
          <div className="grid grid-cols-2 gap-1.5">
            {ATALHOS.map((a) => (
              <button key={a.k} onClick={() => { onChange(periodoDe(a.k)); setAberto(false); }}
                className={`rounded-lg px-2.5 py-1.5 text-left text-body-sm ${ativo?.k === a.k ? "bg-[#1D4ED8] font-medium text-white" : "hover:bg-[#F3F4F6]"}`}>
                {a.l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-surface-border pt-3">
            <label className="text-meta text-text-subtle">De
              <input type="date" className="input mt-1 !py-1" value={inicio} max={fim} onChange={(e) => e.target.value && onChange([e.target.value, fim])} />
            </label>
            <label className="text-meta text-text-subtle">Até
              <input type="date" className="input mt-1 !py-1" value={fim} min={inicio} onChange={(e) => e.target.value && onChange([inicio, e.target.value])} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

