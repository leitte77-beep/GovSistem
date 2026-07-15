import { useEffect, useRef, useState } from "react";
import { Lock, Eye } from "lucide-react";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { textos } from "@/i18n/textos";
import { pareceHtml, sanitizarHtmlEvolucao } from "@/nucleo/htmlSeguro";

/**
 * <CartaoSigiloso> — conteúdo sensível velado (§1.2 / §2 "sigilo visível").
 *
 * - Exibe o estado velado (desfoque + cadeado + aviso "sua visualização será
 *   registrada") até o usuário revelar conscientemente.
 * - A revelação chama o endpoint dedicado (via `buscar`), que gera auditoria no
 *   backend (READ_SENSIVEL).
 * - O conteúdo revelado vive SOMENTE no estado local desta tela; ao desmontar,
 *   é apagado. Nunca vai para cache persistente, localStorage ou estado global.
 * - Se a política negar (evolution_restrita), mostra aviso de restrição.
 */
export function CartaoSigiloso<T>({
  titulo = textos.sigilo.veladoTitulo,
  buscar,
  extrairTexto,
  estaRestrito,
  reforcado = false,
}: {
  titulo?: string;
  /** Busca o conteúdo sob demanda (deve chamar o endpoint que audita). */
  buscar: () => Promise<T>;
  /** Extrai o texto exibível do payload retornado. */
  extrairTexto: (dado: T) => string | null;
  /** Indica se o payload veio restrito pela política (sem conteúdo). */
  estaRestrito: (dado: T) => boolean;
  reforcado?: boolean;
}) {
  const [estado, setEstado] = useState<"velado" | "carregando" | "revelado" | "restrito" | "erro">(
    "velado",
  );
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string>("");
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      // Apaga o conteúdo sensível ao sair da tela (não persiste na sessão).
      montado.current = false;
      setTexto(null);
    };
  }, []);

  async function revelar() {
    setEstado("carregando");
    setErro("");
    try {
      const dado = await buscar();
      if (!montado.current) return;
      if (estaRestrito(dado)) {
        setEstado("restrito");
        return;
      }
      setTexto(extrairTexto(dado));
      setEstado("revelado");
    } catch (e) {
      if (!montado.current) return;
      setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o conteúdo.");
      setEstado("erro");
    }
  }

  if (estado === "revelado") {
    return (
      <div className="glass-card rounded-xl p-md shadow-sm border border-sensitive/30">
        <div className="mb-2 flex items-center gap-2 font-label-md text-label-md text-sensitive">
          <Lock aria-hidden className="h-4 w-4" />
          <span>Conteúdo restrito — sua visualização foi registrada.</span>
        </div>
        <TextoEvolucao texto={texto} />
      </div>
    );
  }

  if (estado === "restrito") {
    return (
      <div
        role="note"
        className="glass-card rounded-xl p-md shadow-sm border border-outline-variant/30 font-corpo text-body-sm text-on-surface-variant"
      >
        <Lock aria-hidden className="mr-1 inline h-4 w-4 align-text-bottom text-sensitive" />
        Este conteúdo é restrito ao profissional que registrou e à coordenação da
        unidade. Seu perfil não tem acesso à leitura.
      </div>
    );
  }

  // Estado velado (padrão) e variações de carregando/erro.
  return (
    <div className="glass-card rounded-xl p-md shadow-sm border border-outline-variant/30 overflow-hidden relative group">
      <div className="flex items-start justify-between mb-sm">
        <div aria-hidden className="space-y-1 pointer-events-none select-none">
          <div className="w-48 max-w-full h-4 bg-surface-container-highest rounded" />
          <div className="w-64 max-w-full h-3 bg-surface-container-highest/60 rounded" />
        </div>
        <Lock aria-hidden className="h-5 w-5 shrink-0 text-secondary opacity-40" />
      </div>

      <div className="relative py-md flex flex-col items-center justify-center gap-4 bg-surface-container/20 rounded-lg">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-secondary font-label-md text-label-md mb-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined !text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              security
            </span>
            {titulo}
            {reforcado && " (sigilo reforçado)"}
          </div>
          <p className="text-on-surface-variant font-corpo text-body-sm px-md">
            {textos.sigilo.veladoAviso}
          </p>
          {estado === "erro" && (
            <p role="alert" className="mt-1 text-xs font-semibold text-danger">
              {erro}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={revelar}
          disabled={estado === "carregando"}
          className="px-lg py-sm bg-primary/10 text-primary border border-primary/20 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-all disabled:opacity-60"
        >
          {estado === "carregando" ? (
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : (
            <Eye aria-hidden className="h-4 w-4" />
          )}
          {textos.sigilo.revelar}
        </button>
      </div>
    </div>
  );
}

/**
 * Renderiza a evolução revelada. O <EditorEvolucao> grava HTML (com
 * &nbsp;, <b>, <ul>…); registros antigos podem ser texto puro. Se o texto
 * parecer HTML, sanitizamos (allowlist) e renderizamos formatado — assim
 * entidades como &nbsp; não aparecem literalmente no meio do texto.
 */
function TextoEvolucao({ texto }: { texto: string | null }) {
  if (!texto) {
    return <p className="font-corpo text-body-sm text-on-surface">(sem texto)</p>;
  }
  if (pareceHtml(texto)) {
    return (
      <div
        className="font-corpo text-body-sm text-on-surface break-words [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-bold [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5"
        // Seguro: HTML passa pela allowlist de sanitizarHtmlEvolucao.
        dangerouslySetInnerHTML={{ __html: sanitizarHtmlEvolucao(texto) }}
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap font-corpo text-body-sm text-on-surface">{texto}</p>
  );
}
