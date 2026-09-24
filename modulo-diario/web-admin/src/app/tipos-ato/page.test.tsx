import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ActTypesAdminPage from "./page";

const adminListActTypes = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    adminListActTypes: (...args: unknown[]) => adminListActTypes(...args),
    adminCreateActType: vi.fn(),
    adminUpdateActType: vi.fn(),
    adminDeleteActType: vi.fn(),
  },
}));

vi.mock("@/lib/error-handler", () => ({ notifyError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn() } }));

describe("Tipos de Ato", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    adminListActTypes.mockReset();
    adminListActTypes.mockResolvedValue([
      { id: "tipo-1", name: "Portaria", description: "", is_active: true, config: {} },
    ]);
    scrollIntoView.mockReset();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it.each([
    ["+ Novo tipo", "Novo tipo"],
    ["Editar", "Editar: Portaria"],
  ])("leva o editor para a área visível ao clicar em %s", async (buttonName, editorTitle) => {
    render(<ActTypesAdminPage />);

    fireEvent.click(await screen.findByRole("button", { name: buttonName }));

    expect(await screen.findByRole("heading", { name: editorTitle })).toBeVisible();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
    expect(screen.getByRole("heading", { name: editorTitle }).parentElement).toHaveFocus();
  });
});
