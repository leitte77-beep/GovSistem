import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockGetOrganization = vi.fn();

vi.mock("../api", () => ({
  api: {
    getOrganization: () => mockGetOrganization(),
  },
}));

import { OrgProvider, useOrg } from "../org-context";
import type { ReactNode } from "react";

function Consumer() {
  const { org, loading } = useOrg();
  if (loading) return <div data-testid="state">loading</div>;
  if (!org) return <div data-testid="state">no-org</div>;
  return (
    <div data-testid="state">
      <span data-testid="org-name">{org.name}</span>
      <span data-testid="org-slug">{org.slug}</span>
    </div>
  );
}

function renderWithProvider(ui: ReactNode) {
  return render(<OrgProvider>{ui}</OrgProvider>);
}

beforeEach(() => {
  mockGetOrganization.mockReset();
});

describe("OrgProvider", () => {
  it("renders children", async () => {
    mockGetOrganization.mockResolvedValue({
      id: "1",
      name: "Prefeitura Teste",
      slug: "prefeitura-teste",
      logo_url: null,
      description: null,
      contact_email: null,
      address: null,
      theme: { primary_color: "#000", secondary_color: "#fff", font_family: "Inter" },
    });

    renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(screen.getByTestId("org-name")).toHaveTextContent("Prefeitura Teste");
    });
  });

  it("exposes org data via useOrg", async () => {
    mockGetOrganization.mockResolvedValue({
      id: "2",
      name: "Camara Municipal",
      slug: "camara-municipal",
      logo_url: "/logo.png",
      description: "Diario oficial",
      contact_email: "contato@camara.gov.br",
      address: "Rua X, 123",
      theme: { primary_color: "#111", secondary_color: "#222", font_family: "Roboto" },
    });

    renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(screen.getByTestId("org-name")).toHaveTextContent("Camara Municipal");
      expect(screen.getByTestId("org-slug")).toHaveTextContent("camara-municipal");
    });
  });

  it("shows loading state initially", () => {
    mockGetOrganization.mockReturnValue(new Promise(() => {}));

    renderWithProvider(<Consumer />);

    expect(screen.getByTestId("state")).toHaveTextContent("loading");
  });

  it("shows no-org state on fetch error", async () => {
    mockGetOrganization.mockRejectedValue(new Error("Network error"));

    renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(screen.getByTestId("state")).toHaveTextContent("no-org");
    });
  });

  it("sets loading to false even on error", async () => {
    mockGetOrganization.mockRejectedValue(new Error("Server error"));

    renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(screen.getByTestId("state")).not.toHaveTextContent("loading");
    });
  });

  it("fetches organization only once on mount", async () => {
    mockGetOrganization.mockResolvedValue({
      id: "1", name: "Test", slug: "test",
      logo_url: null, description: null, contact_email: null, address: null,
      theme: { primary_color: "#000", secondary_color: "#fff", font_family: "Inter" },
    });

    renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(screen.getByTestId("state")).not.toHaveTextContent("loading");
    });

    expect(mockGetOrganization).toHaveBeenCalledTimes(1);
  });

  it("provides default context value with loading=true when used outside provider", () => {
    function OutsideConsumer() {
      const { org, loading } = useOrg();
      return (
        <div>
          <span data-testid="load">{String(loading)}</span>
          <span data-testid="org">{String(org)}</span>
        </div>
      );
    }

    render(<OutsideConsumer />);

    expect(screen.getByTestId("load")).toHaveTextContent("true");
    expect(screen.getByTestId("org")).toHaveTextContent("null");
  });
});

describe("useOrg", () => {
  it("returns context from provider", async () => {
    mockGetOrganization.mockResolvedValue({
      id: "3",
      name: "Secretaria X",
      slug: "secretaria-x",
      logo_url: null,
      description: null,
      contact_email: null,
      address: null,
      theme: { primary_color: "#333", secondary_color: "#444", font_family: "Arial" },
    });

    renderWithProvider(<Consumer />);

    await waitFor(() => {
      expect(screen.getByTestId("org-name")).toHaveTextContent("Secretaria X");
    });
  });
});
