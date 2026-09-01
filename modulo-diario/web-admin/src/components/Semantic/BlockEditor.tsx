"use client";

import clsx from "clsx";
import type { SemanticBlock } from "@/types/semantic";

interface Props {
  block: SemanticBlock;
  onChange: (patch: Partial<SemanticBlock>) => void;
}

const inputCls =
  "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none";
const labelCls =
  "block text-label-md font-label-md text-on-surface-variant mb-1";

export default function BlockEditor({ block, onChange }: Props) {
  const num = (n: string): number => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 1;
  };

  switch (block.type) {
    case "heading":
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`${block.id}-text`}>Texto do título</label>
            <input id={`${block.id}-text`} className={inputCls} value={block.text}
              onChange={(e) => onChange({ text: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`${block.id}-level`}>Nível</label>
            <select id={`${block.id}-level`} className={inputCls} value={block.level}
              onChange={(e) => onChange({ level: num(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Título {n}</option>)}
            </select>
          </div>
        </div>
      );

    case "command":
      return (
        <div>
          <label className={labelCls} htmlFor={`${block.id}-cmd`}>Comando</label>
          <input id={`${block.id}-cmd`} className={inputCls} value={block.text}
            onChange={(e) => onChange({ text: e.target.value })} placeholder="DECRETA: / RESOLVE: / SANCIONA:" />
        </div>
      );

    case "preamble":
    case "paragraph":
    case "quote":
    case "legacy_html":
      return <RichEditor id={block.id} value={"content" in block ? block.content : ""} onChange={(content) => onChange({ content })} />;

    case "paragraph_item":
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`${block.id}-num`}>Número do parágrafo</label>
            <input id={`${block.id}-num`} className={inputCls} value={block.number ?? ""}
              onChange={(e) => onChange({ number: e.target.value || null })} placeholder="vazio = Parágrafo único" />
          </div>
          <RichEditor id={block.id} value={block.content} onChange={(content) => onChange({ content })} />
        </div>
      );

    case "inciso":
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`${block.id}-num`}>Número (romano)</label>
            <input id={`${block.id}-num`} className={inputCls} value={block.number}
              onChange={(e) => onChange({ number: e.target.value })} placeholder="I, II, III…" />
          </div>
          <RichEditor id={block.id} value={block.content} onChange={(content) => onChange({ content })} />
        </div>
      );

    case "alinea":
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor={`${block.id}-num`}>Letra</label>
            <input id={`${block.id}-num`} className={inputCls} value={block.number}
              onChange={(e) => onChange({ number: e.target.value })} placeholder="a, b, c…" />
          </div>
          <RichEditor id={block.id} value={block.content} onChange={(content) => onChange({ content })} />
        </div>
      );

    case "list":
      return (
        <div className="space-y-2">
          <label className={labelCls}>Itens</label>
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[i] = e.target.value;
                  onChange({ items });
                }} />
              <button type="button" onClick={() => onChange({ items: block.items.filter((_, j) => j !== i) })}
                className="px-2 text-on-surface-variant hover:text-error" aria-label="Remover item">×</button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ items: [...block.items, ""] })}
            className="text-xs text-primary font-medium">+ Adicionar item</button>
        </div>
      );

    case "article":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} htmlFor={`${block.id}-num`}>Número</label>
              <input id={`${block.id}-num`} className={inputCls} value={block.number ?? ""}
                onChange={(e) => onChange({ number: e.target.value || null })} />
            </div>
            <div>
              <label className={labelCls} htmlFor={`${block.id}-suffix`}>Sufixo</label>
              <input id={`${block.id}-suffix`} className={inputCls} value={block.suffix ?? ""}
                onChange={(e) => onChange({ suffix: e.target.value || null })} placeholder="ex.: 1º-A" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor={`${block.id}-caput`}>Caput</label>
            <textarea id={`${block.id}-caput`} className={clsx(inputCls, "min-h-[60px]")} value={block.caput}
              onChange={(e) => onChange({ caput: e.target.value })} />
          </div>
          {block.paragraphs.map((p, i) => (
            <div key={i} className="rounded-lg border border-outline-variant p-2 space-y-2">
              <input className={inputCls} value={p.number ?? ""}
                onChange={(e) => {
                  const paragraphs = [...block.paragraphs];
                  paragraphs[i] = { ...p, number: e.target.value || null };
                  onChange({ paragraphs });
                }} placeholder={`§ número (vazio = único)`} />
              <textarea className={clsx(inputCls, "min-h-[50px]")} value={p.content}
                onChange={(e) => {
                  const paragraphs = [...block.paragraphs];
                  paragraphs[i] = { ...p, content: e.target.value };
                  onChange({ paragraphs });
                }} />
            </div>
          ))}
          <button type="button" onClick={() => onChange({ paragraphs: [...block.paragraphs, { id: `p${Date.now()}`, type: "paragraph_item", number: null, content: "", rich: true, order: block.paragraphs.length }] })}
            className="text-xs text-primary font-medium">+ Adicionar § parágrafo</button>
        </div>
      );

    case "table":
      return <TableEditor block={block} onChange={onChange} />;

    case "signature_block":
      return (
        <div className="space-y-2">
          <label className={labelCls}>Assinaturas</label>
          {block.entries.map((e, i) => (
            <div key={i} className="rounded-lg border border-outline-variant p-2 grid grid-cols-2 gap-2">
              <input className={inputCls} value={e.name} placeholder="Nome"
                onChange={(ev) => {
                  const entries = [...block.entries];
                  entries[i] = { ...e, name: ev.target.value };
                  onChange({ entries });
                }} />
              <input className={inputCls} value={e.role} placeholder="Cargo"
                onChange={(ev) => {
                  const entries = [...block.entries];
                  entries[i] = { ...e, role: ev.target.value };
                  onChange({ entries });
                }} />
              <input className={inputCls} value={e.organ} placeholder="Órgão"
                onChange={(ev) => {
                  const entries = [...block.entries];
                  entries[i] = { ...e, organ: ev.target.value };
                  onChange({ entries });
                }} />
              <input className={inputCls} value={e.location} placeholder="Local"
                onChange={(ev) => {
                  const entries = [...block.entries];
                  entries[i] = { ...e, location: ev.target.value };
                  onChange({ entries });
                }} />
            </div>
          ))}
          <button type="button" onClick={() => onChange({ entries: [...block.entries, { name: "", role: "", organ: "", location: "", date: "" }] })}
            className="text-xs text-primary font-medium">+ Adicionar autoridade</button>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          <div><label className={labelCls}>URL</label><input className={inputCls} value={block.src} onChange={(e) => onChange({ src: e.target.value })} /></div>
          <div><label className={labelCls}>Texto alternativo</label><input className={inputCls} value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} /></div>
          <div><label className={labelCls}>Legenda</label><input className={inputCls} value={block.caption} onChange={(e) => onChange({ caption: e.target.value })} /></div>
        </div>
      );

    case "attachment_reference":
      return (
        <div className="space-y-3">
          <div><label className={labelCls}>Título do anexo</label><input className={inputCls} value={block.title} onChange={(e) => onChange({ title: e.target.value })} /></div>
          <div><label className={labelCls}>Nome do arquivo</label><input className={inputCls} value={block.filename} onChange={(e) => onChange({ filename: e.target.value })} /></div>
        </div>
      );

    case "pdf_reference":
      return (
        <p className="text-sm text-on-surface-variant">
          Modo <strong>PDF original</strong>: as páginas são preservadas. Nenhum conteúdo editável por blocos.
        </p>
      );

    default:
      return <p className="text-sm text-on-surface-variant">Bloco “{block.type}” sem campos editáveis.</p>;
  }
}

function RichEditor({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls} htmlFor={`${id}-rich`}>Conteúdo</label>
      <textarea id={`${id}-rich`} className={clsx(inputCls, "min-h-[70px] font-mono text-xs")} value={value}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TableEditor({ block, onChange }: { block: Extract<SemanticBlock, { type: "table" }>; onChange: (patch: Partial<SemanticBlock>) => void }) {
  const num = (n: string): number => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 1 ? v : 1;
  };
  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} htmlFor={`${block.id}-caption`}>Legenda</label>
        <input id={`${block.id}-caption`} className={inputCls} value={block.caption}
          onChange={(e) => onChange({ caption: e.target.value })} />
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse w-full text-xs">
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th key={i} className="border border-outline-variant p-1">
                  <input className="w-full bg-transparent px-1" value={h}
                    onChange={(e) => {
                      const headers = [...block.headers];
                      headers[i] = e.target.value;
                      onChange({ headers });
                    }} />
                </th>
              ))}
              <th className="border border-outline-variant p-1 w-8">
                <button type="button" onClick={() => onChange({ headers: [...block.headers, "Coluna"] })} className="text-primary">+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-outline-variant p-1">
                    <input className="w-full bg-transparent px-1" value={cell.content}
                      onChange={(e) => {
                        const rows = block.rows.map((r, i) =>
                          i === ri ? r.map((c, j) => (j === ci ? { ...c, content: e.target.value } : c)) : r
                        );
                        onChange({ rows });
                      }} />
                    <div className="flex gap-1 mt-0.5 text-[9px]">
                      <input className="w-8" title="rowspan" value={cell.rowspan} onChange={(e) => {
                        const rows = block.rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? { ...c, rowspan: num(e.target.value) } : c) : r);
                        onChange({ rows });
                      }} />
                      <input className="w-8" title="colspan" value={cell.colspan} onChange={(e) => {
                        const rows = block.rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? { ...c, colspan: num(e.target.value) } : c) : r);
                        onChange({ rows });
                      }} />
                      <label className="flex items-center gap-0.5"><input type="checkbox" checked={cell.is_total} onChange={(e) => {
                        const rows = block.rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? { ...c, is_total: e.target.checked } : c) : r);
                        onChange({ rows });
                      }} />total</label>
                    </div>
                  </td>
                ))}
                <td className="border border-outline-variant p-1 w-8">
                  <button type="button" onClick={() => onChange({ rows: block.rows.map((r, i) => i === ri ? [...r, { content: "", rowspan: 1, colspan: 1, header: false, is_total: false }] : r) })} className="text-primary">+</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-xs">
        <button type="button" className="text-primary font-medium"
          onClick={() => onChange({ rows: [...block.rows, Array(block.headers.length || 1).fill(null).map(() => ({ content: "", rowspan: 1, colspan: 1, header: false, is_total: false }))] })}>
          + Linha
        </button>
        <button type="button" className="text-error font-medium"
          onClick={() => onChange({ rows: block.rows.slice(0, -1) })}>
          − Linha
        </button>
      </div>
    </div>
  );
}
