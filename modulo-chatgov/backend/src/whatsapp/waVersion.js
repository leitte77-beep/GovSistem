import { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';

// Versão Web válida em 2026-08-17. É usada apenas quando a consulta oficial do
// Baileys falha; WA_VERSION permite atualizar o fallback sem alterar o código.
export const FALLBACK_WA_VERSION = Object.freeze([2, 3000, 1044214717]);

export function parseWaVersion(value) {
  if (Array.isArray(value)) {
    if (value.length !== 3 || value.some((part) => !Number.isSafeInteger(part) || part < 0)) {
      return null;
    }
    return [...value];
  }

  if (typeof value !== 'string' || !value.trim()) return null;

  const parts = value.trim().split(/[.,]/).map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return null;
  }
  return parts;
}

export async function resolveWaVersion({
  configuredVersion = process.env.WA_VERSION,
  fetchLatest = fetchLatestBaileysVersion,
  timeoutMs = Number(process.env.WA_VERSION_FETCH_TIMEOUT_MS || 10000),
  logger = console,
} = {}) {
  const configured = parseWaVersion(configuredVersion);
  if (configured) {
    logger.info(`[WA] Versão do protocolo definida por WA_VERSION: ${configured.join('.')}`);
    return configured;
  }

  if (configuredVersion) {
    logger.warn(`[WA] WA_VERSION inválida (${configuredVersion}); consultando versão atual.`);
  }

  try {
    const result = await fetchLatest({ timeout: timeoutMs });
    const fetched = parseWaVersion(result?.version);

    // fetchLatestBaileysVersion captura erros internamente e devolve a versão
    // embutida no pacote com isLatest=false. Essa versão pode já ter expirado.
    if (result?.isLatest === true && fetched) {
      logger.info(`[WA] Versão atual do protocolo obtida pelo Baileys: ${fetched.join('.')}`);
      return fetched;
    }

    logger.warn(
      `[WA] Consulta da versão atual indisponível${result?.error?.message ? `: ${result.error.message}` : ''}; `
      + `usando fallback ${FALLBACK_WA_VERSION.join('.')}.`
    );
  } catch (err) {
    logger.warn(
      `[WA] Falha ao consultar versão atual: ${err.message}; `
      + `usando fallback ${FALLBACK_WA_VERSION.join('.')}.`
    );
  }

  return [...FALLBACK_WA_VERSION];
}
