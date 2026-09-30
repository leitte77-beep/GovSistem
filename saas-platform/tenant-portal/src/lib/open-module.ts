import api from "@/lib/api";

/**
 * Abre o módulo em uma nova guia via SSO (/auth/module-access).
 *
 * A guia é aberta ainda dentro do clique (antes do await), senão o navegador
 * trata como pop-up e bloqueia. Se mesmo assim bloquear, abre na guia atual.
 * Chame diretamente do handler de clique. Lança o erro da API para a tela exibir.
 */
export async function openModuleInNewTab(slug: string, name: string): Promise<void> {
  const tab = window.open("", "_blank");
  if (tab) {
    tab.opener = null;
    tab.document.title = `Abrindo ${name}…`;
    tab.document.body.style.cssText = "font:14px system-ui,sans-serif;color:#475467;padding:24px";
    tab.document.body.textContent = `Abrindo ${name}…`;
  }
  try {
    const res = await api<{ module_token: string; module_url: string }>("/auth/module-access", {
      method: "POST",
      body: { module_slug: slug },
    });
    const joiner = res.module_url.includes("?") ? "&" : "?";
    const url = `${res.module_url}${joiner}token=${encodeURIComponent(res.module_token)}`;
    if (tab && !tab.closed) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
