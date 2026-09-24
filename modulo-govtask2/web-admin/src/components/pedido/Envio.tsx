"use client";

/**
 * Envio de arquivos: arrastar ou escolher vários de uma vez, tipo do
 * documento por arquivo, progresso individual e câmera no celular. Cada
 * arquivo sobe sozinho — um erro num não derruba os outros.
 */

import clsx from "clsx";
import { Camera, CheckCircle2, FileText, Loader2, Paperclip, Trash2, Upload, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { api, type Pedido } from "@/lib/api";
import { ROTULO_TIPO_DOCUMENTO, tamanho } from "@/lib/formato";

const LIMITE_MB = 32;

/** Palpite do tipo pelo nome do arquivo: poupa um clique na maioria dos casos. */
export function palpiteDeTipo(nome: string): string {
  const n = nome.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(n)) return "FOTO";
  if (/of[ií]cio/.test(n)) return "OFICIO";
  if (/certid|cnd|crf|fgts|cndt/.test(n)) return "CERTIDAO";
  if (/parecer/.test(n)) return "PARECER";
  if (/projeto|planta|memorial|or[cç]amento/.test(n)) return "PROJETO";
  if (/nota|nf-?e|danfe/.test(n)) return "NOTA_FISCAL";
  if (/contrato|termo|convenio|conv[eê]nio/.test(n)) return "CONTRATO";
  return "OUTRO";
}

interface Item {
  arquivo: File;
  tipo: string;
  progresso: number;
  estado: "fila" | "enviando" | "ok" | "erro";
  erro?: string;
}

export function EnvioDeArquivos({
  pedido,
  encaminhamentoId,
  medicaoId,
  categoria,
  aoAtualizar,
  compacto,
  rotulo = "Arraste os arquivos aqui ou",
}: {
  pedido: Pedido;
  encaminhamentoId?: string;
  medicaoId?: string;
  categoria?: "DOCUMENTO" | "FOTO";
  aoAtualizar: (p: Pedido) => void;
  compacto?: boolean;
  rotulo?: string;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const soFotos = categoria === "FOTO";

  function adicionar(lista: FileList | File[] | null) {
    const novos = Array.from(lista ?? []);
    const grandes = novos.filter((f) => f.size > LIMITE_MB * 1024 * 1024);
    if (grandes.length) toast.error(`Acima de ${LIMITE_MB} MB: ${grandes.map((f) => f.name).join(", ")}`);
    setItens((atuais) => [
      ...atuais.filter((i) => i.estado !== "ok"),
      ...novos
        .filter((f) => f.size <= LIMITE_MB * 1024 * 1024)
        .map((f) => ({ arquivo: f, tipo: soFotos ? "FOTO" : palpiteDeTipo(f.name), progresso: 0, estado: "fila" as const })),
    ]);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  async function enviarTodos() {
    for (let i = 0; i < itens.length; i++) {
      if (itens[i].estado === "ok") continue;
      const atualizar = (parcial: Partial<Item>) =>
        setItens((atuais) => atuais.map((x, j) => (j === i ? { ...x, ...parcial } : x)));
      atualizar({ estado: "enviando", progresso: 0 });
      try {
        const p = await api.anexar(
          pedido.id,
          itens[i].arquivo,
          {
            encaminhamentoId,
            medicaoId,
            categoria: categoria ?? (itens[i].tipo === "FOTO" ? "FOTO" : "DOCUMENTO"),
            tipoDocumento: itens[i].tipo,
          },
          (f) => atualizar({ progresso: f })
        );
        atualizar({ estado: "ok", progresso: 1 });
        aoAtualizar(p);
      } catch (e) {
        atualizar({ estado: "erro", erro: (e as Error).message });
      }
    }
  }

  const pendentes = itens.filter((i) => i.estado === "fila" || i.estado === "erro").length;
  const enviando = itens.some((i) => i.estado === "enviando");

  return (
    <div>
      <input ref={arquivoRef} type="file" multiple accept={soFotos ? "image/*" : undefined} className="sr-only" tabIndex={-1} onChange={(e) => adicionar(e.target.files)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => adicionar(e.target.files)} />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionar(e.dataTransfer.files);
        }}
        className={clsx(
          "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-btn border border-dashed text-center text-sm transition",
          compacto ? "px-3 py-3" : "px-4 py-7",
          arrastando ? "border-brand bg-brand-50 text-brand" : "border-line-strong bg-canvas/40 text-ink-muted"
        )}
      >
        {!compacto && <Upload size={22} className="mb-1 w-full text-ink-faint" aria-hidden />}
        <span className="hidden sm:inline">{rotulo}</span>
        <button type="button" onClick={() => arquivoRef.current?.click()} className="font-medium text-brand hover:underline">
          <Paperclip size={14} className="mr-1 inline" aria-hidden />
          {soFotos ? "escolher fotos" : "escolher arquivos"}
        </button>
        <button type="button" onClick={() => cameraRef.current?.click()} className="font-medium text-brand hover:underline sm:hidden">
          <Camera size={14} className="mr-1 inline" aria-hidden />
          tirar foto
        </button>
        {!compacto && <span className="w-full text-xs text-ink-faint">PDF, Word, Excel, imagens · até {LIMITE_MB} MB cada</span>}
      </div>

      {itens.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {itens.map((item, i) => (
            <li key={`${item.arquivo.name}-${i}`} className="overflow-hidden rounded-btn border border-line bg-paper">
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                {item.estado === "ok" ? (
                  <CheckCircle2 size={16} className="shrink-0 text-estado-concluido" />
                ) : item.estado === "erro" ? (
                  <XCircle size={16} className="shrink-0 text-estado-atrasado" />
                ) : item.estado === "enviando" ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-brand" />
                ) : (
                  <FileText size={16} className="shrink-0 text-ink-faint" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{item.arquivo.name}</span>
                  <span className={clsx("block text-xs", item.erro ? "text-estado-atrasado" : "text-ink-faint")}>
                    {item.erro ?? tamanho(item.arquivo.size)}
                  </span>
                </span>
                {!soFotos && (item.estado === "fila" || item.estado === "erro") && (
                  <select
                    value={item.tipo}
                    onChange={(e) => setItens((a) => a.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}
                    className="rounded-md border border-line bg-paper px-1.5 py-1 text-xs text-ink-soft"
                    aria-label="Tipo do documento"
                  >
                    {Object.entries(ROTULO_TIPO_DOCUMENTO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
                {(item.estado === "fila" || item.estado === "erro") && (
                  <button
                    type="button"
                    onClick={() => setItens((a) => a.filter((_, j) => j !== i))}
                    className="rounded p-1 text-ink-muted hover:text-estado-atrasado"
                    aria-label={`Remover ${item.arquivo.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {item.estado === "enviando" && (
                <div className="h-1 bg-ink/[.06]">
                  <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round(item.progresso * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pendentes > 0 && (
        <button type="button" className="botao-primario mt-2" onClick={enviarTodos} disabled={enviando}>
          <Upload size={15} aria-hidden />
          {enviando ? "Enviando…" : `Enviar ${pendentes} arquivo${pendentes > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
