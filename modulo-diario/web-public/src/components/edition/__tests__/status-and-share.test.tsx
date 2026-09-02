import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EditionStatus from "../EditionStatus";
import CopyMatterLink from "../CopyMatterLink";
import type { Authenticity, SnapshotEdition } from "@/lib/edition-types";

const edition: SnapshotEdition = {
  id: "e1",
  number: 23,
  year: 2026,
  type: "normal",
  title: "Edição 23",
  subtitle: null,
  publication_date: "2026-09-02",
  verification_code: "20260023-ABCD",
  organization: "PREFEITURA DE FAROL",
  slug: "farol",
};

const authenticity: Authenticity = {
  verification_code: "20260023-ABCD",
  signed_pdf_hash: "abc123",
  content_manifest_hash: "def456",
  snapshot_intact: true,
  snapshot_status: "ok",
  validation_checked_at: null,
  signatures: [],
  states: {
    signed: true,
    intact: true,
    trusted: true,
    certificate_valid: true,
    chain_trusted: true,
    revocation_checked: true,
    timestamped: true,
    snapshot_intact: true,
  },
};

describe("EditionStatus", () => {
  it("shows official-publication status for a trusted edition", () => {
    render(<EditionStatus edition={edition} authenticity={authenticity} publishedLabel="Publicada em 02 de setembro de 2026." />);
    expect(screen.getByText(/Publicação oficial/)).toBeDefined();
    expect(screen.getByText(/assinada digitalmente/i)).toBeDefined();
    expect(screen.getByText(/Ver detalhes técnicos/)).toBeDefined();
  });

  it("never fabricates state it does not have", () => {
    const unknown: Authenticity = {
      ...authenticity,
      states: {
        ...authenticity.states,
        certificate_valid: null,
        revocation_checked: null,
        timestamped: null,
      },
    };
    render(<EditionStatus edition={edition} authenticity={unknown} />);
    fireEvent.click(screen.getByText(/Ver detalhes técnicos/));
    expect(screen.getAllByText(/Não verificado/).length).toBeGreaterThanOrEqual(3);
  });
});

describe("CopyMatterLink", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("copies a stable anchor link and gives feedback", async () => {
    render(<CopyMatterLink anchorId="materia-abc" />);
    fireEvent.click(screen.getByRole("button", { name: /Copiar link/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("#materia-abc"));
    expect(await screen.findByText(/Link copiado/)).toBeDefined();
  });
});
