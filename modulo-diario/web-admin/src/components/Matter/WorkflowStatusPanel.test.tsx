import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowStatusPanel from "./WorkflowStatusPanel";

const updateMatterWorkflow = vi.fn();
const getMatterWorkflowHistory = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    updateMatterWorkflow: (...args: unknown[]) => updateMatterWorkflow(...args),
    getMatterWorkflowHistory: (...args: unknown[]) => getMatterWorkflowHistory(...args),
  },
}));
vi.mock("@/lib/error-handler", () => ({ notifyError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { roles: [{ name: "AUTOR" }] } }),
}));

describe("WorkflowStatusPanel", () => {
  beforeEach(() => {
    updateMatterWorkflow.mockReset();
    getMatterWorkflowHistory.mockReset();
    getMatterWorkflowHistory.mockResolvedValue([]);
  });

  it("mostra o estado atual e as transições permitidas", () => {
    render(<WorkflowStatusPanel matterId="m1" workflowStatus="rascunho" />);
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Em revisão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelado" })).toBeInTheDocument();
  });

  it("avança o fluxo ao clicar numa transição", async () => {
    updateMatterWorkflow.mockResolvedValue({ workflow_status: "em_revisao" });
    render(<WorkflowStatusPanel matterId="m1" workflowStatus="rascunho" />);

    fireEvent.click(screen.getByRole("button", { name: "Em revisão" }));

    await waitFor(() =>
      expect(updateMatterWorkflow).toHaveBeenCalledWith("m1", "em_revisao")
    );
    expect(await screen.findByText("Em revisão")).toBeInTheDocument();
  });

  it("não mostra ações para estado publicado", () => {
    render(<WorkflowStatusPanel matterId="m1" workflowStatus="publicado" />);
    expect(screen.queryByRole("button", { name: "Cancelado" })).toBeNull();
  });

  it("carrega o histórico ao expandir", async () => {
    getMatterWorkflowHistory.mockResolvedValue([
      {
        id: "e1",
        action: "matter.workflow_status_changed",
        description: "Fluxo: rascunho → em_revisao",
        from_status: "rascunho",
        to_status: "em_revisao",
        user_id: null,
        created_at: "2026-09-11T12:00:00Z",
      },
    ]);
    render(<WorkflowStatusPanel matterId="m1" workflowStatus="rascunho" />);

    fireEvent.click(screen.getByRole("button", { name: /Histórico/ }));

    expect(await screen.findByText(/rascunho → em_revisao/)).toBeInTheDocument();
  });
});
