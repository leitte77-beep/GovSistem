const PDF_READY_STATUSES = new Set(["pdf_generated", "signed", "published"]);

interface WaitForEditionPdfOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

const pdfGenerationTimeoutError = () => new Error(
  "O PDF ainda está sendo gerado. Aguarde alguns instantes e tente assinar e publicar novamente.",
);

async function withDeadline<T>(promise: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) throw pdfGenerationTimeoutError();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(pdfGenerationTimeoutError()), remainingMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function waitForEditionPdf<T extends { status: string }>(
  fetchEdition: () => Promise<T>,
  options: WaitForEditionPdfOptions = {},
): Promise<T> {
  const {
    pollIntervalMs = 2_000,
    timeoutMs = 5 * 60_000,
    now = Date.now,
    sleep = defaultSleep,
  } = options;
  const startedAt = now();

  while (true) {
    const remainingMs = timeoutMs - (now() - startedAt);
    const edition = await withDeadline(
      Promise.resolve().then(fetchEdition),
      remainingMs,
    );
    if (PDF_READY_STATUSES.has(edition.status)) return edition;

    if (edition.status !== "closed") {
      throw new Error(
        `A geração do PDF foi interrompida (status atual: ${edition.status}). Atualize a edição e tente novamente.`,
      );
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      throw pdfGenerationTimeoutError();
    }

    await sleep(Math.min(pollIntervalMs, timeoutMs - elapsedMs));
  }
}
