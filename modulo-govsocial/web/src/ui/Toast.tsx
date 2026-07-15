import toast, { Toaster } from "react-hot-toast";

/**
 * Wrapper de react-hot-toast com aria-live e cores dos tokens.
 * Mensagens nunca contêm dado pessoal (§1.4).
 */
export function ProvedorToast() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 5000,
        style: {
          background: "var(--ga-surface)",
          color: "var(--ga-ink)",
          border: "1px solid rgba(90,107,103,0.2)",
          borderRadius: "8px",
          fontFamily: "'Source Sans 3', system-ui, sans-serif",
        },
        success: { iconTheme: { primary: "var(--ga-primary)", secondary: "#fff" } },
        error: { iconTheme: { primary: "var(--ga-danger)", secondary: "#fff" } },
        ariaProps: { role: "status", "aria-live": "polite" },
      }}
    />
  );
}

export const avisar = {
  sucesso: (msg: string) => toast.success(msg),
  erro: (msg: string) => toast.error(msg),
  info: (msg: string) => toast(msg),
};
