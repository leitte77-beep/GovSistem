import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SemanticEditor from "./SemanticEditor";

const analyze = vi.fn();
const get = vi.fn();
const save = vi.fn();

vi.mock("@/lib/semanticApi", () => ({
  semanticApi: {
    analyze: (...args: unknown[]) => analyze(...args),
    get: (...args: unknown[]) => get(...args),
    save: (...args: unknown[]) => save(...args),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

function emptyDocument() {
  return {
    schema_version: 1,
    document_id: "d1",
    document_type: "ato_oficial",
    title: "T",
    summary: "S",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    source_type: "paste_html",
    classification_status: "pending",
    blocks: [],
  };
}

function analyzeResponse() {
  return {
    document: emptyDocument(),
    source_hash: "h",
    text_integrity_hash: "h",
    integrity: {
      valid: true,
      changed_words: [],
      lost_words: [],
      monetary_changes: [],
      date_changes: [],
      total_changed: 0,
      issues: [],
    },
    validation: { valid: true, errors: [], warnings: [] },
  };
}

describe("SemanticEditor", () => {
  beforeEach(() => {
    analyze.mockReset();
    get.mockReset();
    save.mockReset();
    get.mockRejectedValue(new Error("404"));
    analyze.mockResolvedValue(analyzeResponse());
  });

  it("analisa automaticamente o HTML colado quando analyzeToken muda", async () => {
    render(
      <SemanticEditor
        matterId="m1"
        html='<p class="MsoNormal">RESOLVE</p>'
        analyzeToken={1}
      />
    );

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    expect(analyze).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ html: '<p class="MsoNormal">RESOLVE</p>' })
    );
  });

  it("analisa automaticamente texto simples quando analyzeToken muda", async () => {
    render(<SemanticEditor matterId="m1" plain={"RESOLVE\nArt. 1º"} analyzeToken={2} />);

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    expect(analyze).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ plain: "RESOLVE\nArt. 1º", html: null })
    );
  });

  it("mostra os ajustes automáticos aplicados pelo parser", async () => {
    analyze.mockResolvedValue({
      ...analyzeResponse(),
      document: {
        ...emptyDocument(),
        auto_adjustments: [{ action: "removed_duplicate_title" }],
      },
    });
    render(<SemanticEditor matterId="m1" html="<p>x</p>" analyzeToken={9} />);

    expect(await screen.findByText(/Ajustes automáticos aplicados/)).toBeInTheDocument();
    expect(screen.getByText(/Cabeçalho repetido removido/)).toBeInTheDocument();
  });

  it("sincroniza a fonte quando o wizard fornece novo conteúdo colado", () => {
    const { rerender } = render(<SemanticEditor matterId="m1" html="<p>antigo</p>" />);
    const textarea = screen.getByLabelText("HTML (colagem Word/rich)") as HTMLTextAreaElement;
    expect(textarea.value).toBe("<p>antigo</p>");

    rerender(<SemanticEditor matterId="m1" html="<p>novo</p>" />);
    expect(textarea.value).toBe("<p>novo</p>");
  });

  it("analisa manualmente a fonte digitada no editor semântico", async () => {
    render(<SemanticEditor matterId="m1" />);
    fireEvent.change(screen.getByLabelText("Texto simples (PDF extraído)"), {
      target: { value: "DECRETA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Analisar e organizar/ }));

    await waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    expect(analyze).toHaveBeenCalledWith(
      "m1",
      expect.objectContaining({ plain: "DECRETA" })
    );
  });
});
