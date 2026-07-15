import { useEffect, useRef, useState, useCallback } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { lerAccessToken } from "@/nucleo/auth/tokenStorage";
import { decodificarClaims } from "@/nucleo/auth/jwt";
import { useSessao } from "@/nucleo/auth/SessaoProvider";

interface ChatMessage {
  type: "message" | "presence" | "typing";
  user_id: string;
  user_name: string;
  text?: string;
  status?: string;
  timestamp: string;
}

interface MensagemExibida {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  timestamp: string;
  local?: boolean;
}

function buildWsUrl(tenantId: string, token: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/ws/chat/${tenantId}?token=${encodeURIComponent(token)}`;
}

export function ChatDrawer() {
  const { usuario } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemExibida[]>([]);
  const [digitando, setDigitando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [usuariosOnline, setUsuariosOnline] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef(0);
  const [unread, setUnread] = useState(0);

  const conectar = useCallback(() => {
    const token = lerAccessToken();
    if (!token) return;
    const claims = decodificarClaims(token);
    const tenantId = claims?.organization_id;
    if (!tenantId || !usuario?.id) return;

    const ws = new WebSocket(buildWsUrl(tenantId, token));
    wsRef.current = ws;

    ws.onopen = () => setConectado(true);
    ws.onclose = () => setConectado(false);

    ws.onmessage = (event) => {
      try {
        const data: ChatMessage = JSON.parse(event.data);
        if (data.type === "message" && data.text) {
          const msg: MensagemExibida = {
            id: crypto.randomUUID(),
            user_id: data.user_id,
            user_name: data.user_name,
            text: data.text,
            timestamp: data.timestamp,
          };
          setMensagens((prev) => [...prev, msg]);
          if (!aberto) {
            unreadRef.current += 1;
            setUnread(unreadRef.current);
          }
        } else if (data.type === "presence") {
          setUsuariosOnline((prev) => {
            if (data.status === "online" && !prev.includes(data.user_id)) {
              return [...prev, data.user_id];
            }
            if (data.status === "offline") {
              return prev.filter((id) => id !== data.user_id);
            }
            return prev;
          });
        } else if (data.type === "typing" && data.user_id !== usuario?.id) {
          setDigitando(data.user_name);
          setTimeout(() => setDigitando(null), 3000);
        }
      } catch {}
    };

    return () => ws.close();
  }, [usuario?.id, aberto]);

  useEffect(() => {
    const cleanup = conectar();
    const interval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const c = conectar();
        return c;
      }
    }, 30_000);
    return () => {
      cleanup?.();
      clearInterval(interval);
      wsRef.current?.close();
    };
  }, [conectar]);

  useEffect(() => {
    if (aberto) {
      unreadRef.current = 0;
      setUnread(0);
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
    }
  }, [aberto, mensagens.length]);

  function enviar() {
    if (!texto.trim() || !wsRef.current) return;
    const msg: MensagemExibida = {
      id: crypto.randomUUID(),
      user_id: usuario?.id ?? "",
      user_name: usuario?.name ?? "",
      text: texto.trim(),
      timestamp: new Date().toISOString(),
      local: true,
    };
    wsRef.current.send(JSON.stringify({ type: "message", text: texto.trim() }));
    setMensagens((prev) => [...prev, msg]);
    setTexto("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="relative rounded p-2 hover:bg-white/10 focus-visible:outline-focus"
        aria-label={aberto ? "Fechar chat" : "Abrir chat"}
        title="Chat"
      >
        <MessageCircle aria-hidden className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed bottom-0 right-4 z-40 flex h-[500px] w-[360px] flex-col rounded-t-cartao border border-ink-soft/15 bg-surface shadow-elevado">
          <div className="flex items-center justify-between border-b border-ink-soft/15 px-4 py-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Chat</h3>
              <span className={`h-2 w-2 rounded-full ${conectado ? "bg-green-500" : "bg-red-500"}`} title={conectado ? "Conectado" : "Desconectado"} />
            </div>
            <div className="flex items-center gap-2">
              {usuariosOnline.length > 0 && (
                <span className="text-xs text-ink-soft">{usuariosOnline.length} online</span>
              )}
              <button onClick={() => setAberto(false)} className="rounded p-1 hover:bg-ink-soft/10">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {mensagens.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.user_id === usuario?.id ? "items-end" : "items-start"}`}>
                {m.user_id !== usuario?.id && (
                  <span className="text-[10px] text-ink-soft ml-1 mb-0.5">{m.user_name}</span>
                )}
                <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                  m.user_id === usuario?.id ? "bg-primary text-white" : "bg-paper text-ink"
                }`}>
                  {m.text}
                </div>
                <span className="text-[10px] text-ink-soft/60 mt-0.5">
                  {new Date(m.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
            {digitando && (
              <div className="text-xs text-ink-soft italic">{digitando} está digitando…</div>
            )}
            {!conectado && (
              <div className="text-center text-xs text-ink-soft py-4">Reconectando…</div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-ink-soft/15 px-3 py-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={onKeyDown}
              placeholder="Digite sua mensagem…"
              className="flex-1 rounded-input border border-ink-soft/20 bg-surface px-3 py-1.5 text-sm"
              maxLength={1000}
            />
            <button onClick={enviar} disabled={!texto.trim()}
              className="rounded-input bg-primary p-2 text-white hover:brightness-110 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
