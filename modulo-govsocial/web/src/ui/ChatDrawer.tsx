import { useEffect, useRef, useState, useCallback } from "react";
import { X, Send, Users, Loader2 } from "lucide-react";
import clsx from "clsx";
import { usePrenderFoco } from "./usePrenderFoco";
import type { MensagemChat, SalaChat } from "@/nucleo/api/servicosFase2";

export type ChatDrawerProps = {
  aberto: boolean;
  aoFechar: () => void;
  conectado: boolean;
  mensagens: MensagemChat[];
  digitando: string | null;
  online: string[];
  userId: string;
  salas: SalaChat[];
  salaAtiva: string;
  aoMudarSala: (salaId: string) => void;
  aoEnviar: (texto: string) => void;
  aoDigitar: () => void;
};

function AvatarNome({ nome }: { nome: string }) {
  const inicial = (nome?.[0] ?? "?").toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
      {inicial}
    </div>
  );
}

function formatarHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatDrawer({
  aberto,
  aoFechar,
  conectado,
  mensagens,
  digitando,
  online,
  userId,
  salas,
  salaAtiva,
  aoMudarSala,
  aoEnviar,
  aoDigitar,
}: ChatDrawerProps) {
  const ref = usePrenderFoco(aberto, aoFechar);
  const [texto, setTexto] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const digitandoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (aberto && inputRef.current) {
      inputRef.current.focus();
    }
  }, [aberto]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [mensagens, digitando]);

  const enviar = useCallback(() => {
    if (!texto.trim()) return;
    aoEnviar(texto);
    setTexto("");
  }, [texto, aoEnviar]);

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        enviar();
      }
    },
    [enviar],
  );

  const aoDigitarLocal = useCallback(() => {
    aoDigitar();
    if (digitandoTimerRef.current) clearTimeout(digitandoTimerRef.current);
    digitandoTimerRef.current = setTimeout(() => {}, 2000);
  }, [aoDigitar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        aria-label="Fechar chat"
        onClick={aoFechar}
        tabIndex={-1}
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Chat interno"
        className="absolute bottom-0 right-0 flex h-full w-full flex-col bg-surface shadow-xl ring-1 ring-ink-soft/10 md:bottom-0 md:right-0 md:top-0 md:h-full md:w-[400px] md:border-l md:border-ink-soft/15"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-ink-soft/15 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-ink">Chat Interno</h2>
            <span
              className={clsx("h-2 w-2 rounded-full", conectado ? "bg-green-500" : "bg-red-500")}
              title={conectado ? "Conectado" : "Desconectado"}
            />
            {online.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-ink-soft">
                <Users aria-hidden className="h-3 w-3" />
                {online.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded p-1 text-ink-soft hover:bg-ink-soft/10 hover:text-ink focus-visible:outline-focus"
            aria-label="Fechar chat"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo: salas + mensagens */}
        <div className="flex flex-1 overflow-hidden">
          {/* Lista de salas */}
          <div className="w-[130px] shrink-0 overflow-y-auto border-r border-ink-soft/10 bg-surface-container-low p-2">
            {salas.map((sala) => (
              <button
                key={sala.id}
                onClick={() => aoMudarSala(sala.id)}
                className={clsx(
                  "w-full rounded-lg px-3 py-2 text-left text-xs transition-colors",
                  sala.id === salaAtiva
                    ? "bg-primary text-white font-semibold"
                    : "text-ink-soft hover:bg-surface-container hover:text-ink",
                )}
              >
                # {sala.nome}
              </button>
            ))}
          </div>

          {/* Área de mensagens */}
          <div className="flex flex-1 flex-col min-w-0">
            <div
              ref={containerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            >
              {mensagens.length === 0 && conectado && (
                <div className="pt-8 text-center text-sm text-ink-soft">
                  Nenhuma mensagem ainda. Seja o primeiro a falar!
                </div>
              )}

              {!conectado && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-ink-soft">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  Reconectando…
                </div>
              )}

              {mensagens.map((m, idx) => {
                const ehPropria = m.userId === userId;
                const mostrarAvatar =
                  idx === 0 || mensagens[idx - 1].userId !== m.userId;

                return (
                  <div
                    key={m.id}
                    className={clsx("flex gap-2", ehPropria && "flex-row-reverse")}
                  >
                    {!ehPropria && (
                      <div className="pt-1">
                        {mostrarAvatar && <AvatarNome nome={m.userName} />}
                      </div>
                    )}
                    <div
                      className={clsx(
                        "flex max-w-[80%] flex-col",
                        ehPropria ? "items-end" : "items-start",
                      )}
                    >
                      {!ehPropria && mostrarAvatar && (
                        <span className="mb-0.5 ml-1 text-[10px] font-semibold text-ink-soft">
                          {m.userName}
                        </span>
                      )}
                      <div
                        className={clsx(
                          "rounded-xl px-3 py-2 text-sm leading-relaxed",
                          ehPropria
                            ? "rounded-br-md bg-primary text-white"
                            : "rounded-bl-md bg-surface-container-high text-ink",
                        )}
                      >
                        {m.text}
                      </div>
                      <span className="mt-0.5 text-[10px] text-ink-soft/60">
                        {formatarHora(m.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {digitando && (
                <div className="flex items-center gap-2 pl-9">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft/50 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft/50 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft/50 [animation-delay:300ms]" />
                  </span>
                  <span className="text-[11px] italic text-ink-soft">
                    {digitando} está digitando…
                  </span>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 border-t border-ink-soft/15 px-3 py-3">
              <textarea
                ref={inputRef}
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  aoDigitarLocal();
                }}
                onKeyDown={aoTeclar}
                placeholder="Digite sua mensagem…"
                rows={1}
                maxLength={5000}
                className="flex-1 resize-none rounded-xl border border-ink-soft/15 bg-surface-container-low px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                onClick={enviar}
                disabled={!texto.trim() || !conectado}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-focus"
                aria-label="Enviar mensagem"
              >
                <Send aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
