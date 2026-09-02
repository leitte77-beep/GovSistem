import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HomeClient, { Props } from "../src/app/HomeClient";
import { OrgProvider } from "../src/lib/org-context";

const mockListEditions = vi.fn();
const mockGetOrganization = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    listEditions: (...args: unknown[]) => mockListEditions(...args),
    getOrganization: (...args: unknown[]) => mockGetOrganization(...args),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  mockListEditions.mockReset();
  mockGetOrganization.mockReset();
  mockGetOrganization.mockResolvedValue({});
});

function renderHome(props: Partial<Props> = {}) {
  return render(
    <OrgProvider>
      <HomeClient initialEditions={props.initialEditions ?? []} />
    </OrgProvider>
  );
}

describe("Home page", () => {
  it("renders the main heading", async () => {
    mockListEditions.mockResolvedValue({ data: [] });
    renderHome();
    expect(
      await screen.findByRole("heading", { name: /diário oficial/i })
    ).toBeDefined();
  });

  it("renders editions from initialEditions", async () => {
    renderHome({
      initialEditions: [
        { id: "1", year: 2026, number: 21, title: "Edição 21", type: "normal" },
      ],
    });
    await waitFor(() =>
      expect(screen.getByText(/edição 21/i)).toBeDefined()
    );
  });
});
