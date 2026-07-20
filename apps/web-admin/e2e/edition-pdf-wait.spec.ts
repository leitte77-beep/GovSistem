import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { waitForEditionPdf } from "../src/lib/waitForEditionPdf";

test.describe("fluxo assinar e publicar", () => {
  test("aguarda o worker concluir a geração do PDF", async () => {
    const statuses = ["closed", "closed", "pdf_generated"];
    let elapsedMs = 0;
    let calls = 0;

    const edition = await waitForEditionPdf(
      async () => ({ status: statuses[calls++] }),
      {
        pollIntervalMs: 1_000,
        timeoutMs: 10_000,
        now: () => elapsedMs,
        sleep: async (ms) => { elapsedMs += ms; },
      },
    );

    expect(edition.status).toBe("pdf_generated");
    expect(calls).toBe(3);
  });

  test("explica quando a geração assíncrona excede o tempo limite", async () => {
    let elapsedMs = 0;

    await expect(waitForEditionPdf(
      async () => ({ status: "closed" }),
      {
        pollIntervalMs: 1_000,
        timeoutMs: 2_000,
        now: () => elapsedMs,
        sleep: async (ms) => { elapsedMs += ms; },
      },
    )).rejects.toThrow("PDF ainda está sendo gerado");
  });

  test("aplica o timeout total mesmo quando a consulta fica pendente", async () => {
    test.setTimeout(500);

    await expect(waitForEditionPdf(
      () => new Promise<{ status: string }>(() => {}),
      { timeoutMs: 25 },
    )).rejects.toThrow("PDF ainda está sendo gerado");
  });

  test("não inicia uma segunda geração síncrona depois de fechar", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/Edition/EditionForm.tsx"),
      "utf8",
    );
    const workflow = source.match(
      /const handleCloseSignPublish = async \(\) => \{([\s\S]*?)\n  \};/,
    )?.[1];

    expect(workflow).toBeTruthy();
    expect(workflow).toContain("waitForEditionPdf");
    expect(workflow).not.toContain("api.generatePdf");
    expect(workflow).toContain("if (!signatureAttempted)");
    expect(workflow).toContain('if (workflowPhase === "publishing")');
    expect(workflow).toContain("assinada, mas não foi possível publicá-la");
  });
});
