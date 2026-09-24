"use client";

/**
 * Visualizador de documentos. Qualquer parte da tela do pedido chama
 * `useVisualizador().abrir(anexo)`: PDF e imagem abrem direto; Word/Excel
 * chegam do servidor já convertidos em PDF. No computador é um painel
 * lateral largo; no celular, tela cheia. Setas navegam entre os documentos.
 */

import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileWarning,
  Loader2,
  X,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import { api, type Anexo } from "@/lib/api";
import { ROTULO_TIPO_DOCUMENTO, dataHora, tamanho } from "@/lib/formato";

interface Ctx {
  abrir: (anexo: Anexo, lista?: Anexo[]) => void;
}

const Contexto = createContext<Ctx>({ abrir: () => {} });

export function useVisualizador() {
  return useContext(Contexto);
}

export function VisualizadorProvider({
  pedidoId,
  children,
}: {
  pedidoId: string;
  children: React.ReactNode;
}) {
  const [lista, setLista] = useState<Anexo[]>([]);
  const [indice, setIndice] = useState(-1);

  const abrir = useCallback((anexo: Anexo, outros?: Anexo[]) => {
    const conjunto = outros && outros.some((a) => a.id === anexo.id) ? outros : [anexo];
    setLista(conjunto);
    setIndice(conjunto.findIndex((a) => a.id === anexo.id));
  }, []);

  return (
    <Contexto.Provider value={{ abrir }}>
      {children}
      {indice >= 0 && lista[indice] && (
        <Painel
          pedidoId={pedidoId}
          anexo={lista[indice]}
          posicao={`${indice + 1} de ${lista.length}`}
          anterior={indice > 0 ? () => setIndice(indice - 1) : undefined}
          proximo={indice < lista.length - 1 ? () => setIndice(indice + 1) : undefined}
          aoFechar={() => setIndice(-1)}
        />
      )}
    </Contexto.Provider>
  );
}

function Painel({
  pedidoId,
  anexo,
  posicao,
  anterior,
  proximo,
  aoFechar,
}: {
  pedidoId: string;
  anexo: Anexo;
  posicao: string;
  anterior?: () => void;
  proximo?: () => void;
  aoFechar: () => void;
}) {
  const [arquivo, setArquivo] = useState<{ url: string; tipo: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    setArquivo(null);
    setErro(null);
    api
      .urlVisualizar(pedidoId, anexo.id)
      .then((r) => {
        url = r.url;
        setArquivo(r);
      })
      .catch((e) => setErro(e.message));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pedidoId, anexo.id]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowLeft" && anterior) anterior();
      if (e.key === "ArrowRight" && proximo) proximo();
    }
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar, anterior, proximo]);

  const imagem = arquivo?.tipo.startsWith("image/");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm" onClick={aoFechar} aria-label="Fechar" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={anexo.nome_original}
        className="relative flex h-full w-full animate-entrar-baixo flex-col bg-paper shadow-pop lg:w-[min(64rem,85vw)] lg:animate-fade-subir"
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{anexo.nome_original}</p>
            <p className="truncate text-xs text-ink-muted">
              {anexo.tipo_documento ? `${ROTULO_TIPO_DOCUMENTO[anexo.tipo_documento] ?? anexo.tipo_documento} · ` : ""}
              v{anexo.versao} · {tamanho(anexo.tamanho_bytes)} · {anexo.enviado_por?.name ?? "—"} ·{" "}
              {dataHora(anexo.created_at)}
            </p>
          </div>
          <span className="hidden text-xs text-ink-faint sm:inline">{posicao}</span>
          <button
            onClick={anterior}
            disabled={!anterior}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas disabled:opacity-30"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={proximo}
            disabled={!proximo}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas disabled:opacity-30"
            aria-label="Próximo"
          >
            <ChevronRight size={18} />
          </button>
          {arquivo && (
            <a
              href={arquivo.url}
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas sm:grid"
              aria-label="Abrir em nova aba"
              title="Abrir em nova aba"
            >
              <ExternalLink size={17} />
            </a>
          )}
          <button
            onClick={() => api.baixarAnexo(pedidoId, anexo).catch((e) => toast.error(e.message))}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas"
            aria-label="Baixar original"
            title="Baixar original"
          >
            <Download size={17} />
          </button>
          <button
            onClick={aoFechar}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-canvas"
            aria-label="Fechar"
          >
            <X size={19} />
          </button>
        </header>

        <div className={clsx("relative min-h-0 flex-1", imagem ? "bg-black/90" : "bg-canvas")}>
          {erro ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileWarning size={34} className="text-ink-faint" />
              <p className="max-w-sm text-sm text-ink-muted">{erro}</p>
              <button
                className="botao-primario"
                onClick={() => api.baixarAnexo(pedidoId, anexo).catch((e) => toast.error(e.message))}
              >
                <Download size={15} /> Baixar o arquivo
              </button>
            </div>
          ) : !arquivo ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 size={24} className="animate-spin" />
              Preparando a visualização…
            </div>
          ) : imagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={arquivo.url} alt={anexo.legenda || anexo.nome_original} className="h-full w-full object-contain" />
          ) : (
            <iframe src={arquivo.url} title={anexo.nome_original} className="h-full w-full border-0 bg-white" />
          )}
          {anexo.legenda && imagem && (
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 px-4 pb-4 pt-10 text-sm text-white">
              {anexo.legenda}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
