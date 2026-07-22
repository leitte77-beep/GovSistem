import { forwardRef } from "react";
import { MessageCircle } from "lucide-react";

export type ChatButtonProps = {
  naoLidas: number;
  aoClicar: () => void;
};

export const ChatButton = forwardRef<HTMLButtonElement, ChatButtonProps>(function ChatButton(
  { naoLidas, aoClicar },
  ref,
) {
  return (
    <button
      ref={ref}
      onClick={aoClicar}
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg motion-safe:transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-focus active:scale-95"
      aria-label={naoLidas > 0 ? `Chat — ${naoLidas} mensagens não lidas` : "Abrir chat"}
    >
      <MessageCircle aria-hidden className="h-6 w-6" />
      {naoLidas > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white ring-2 ring-white"
        >
          {naoLidas > 99 ? "99+" : naoLidas}
        </span>
      )}
    </button>
  );
});
