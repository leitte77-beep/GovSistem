export function notifyError(context: string, err?: unknown) {
  const message = err instanceof Error ? err.message : String(err || "Erro desconhecido")
  console.error(`[${context}]`, message)
  window.dispatchEvent(new CustomEvent("app:error", { detail: { context, message } }))
}
