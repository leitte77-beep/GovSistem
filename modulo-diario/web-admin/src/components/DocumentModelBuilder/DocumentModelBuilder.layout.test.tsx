import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DocumentModelDetail, VersionDetail } from "@/types/document_model";
import { defaultLayout, emptyConfig } from "./constants";
import DocumentModelBuilder from "./DocumentModelBuilder";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { roles: [{ name: "AUTOR" }] } }),
}));

const model: DocumentModelDetail = {
  id: "model-1",
  slug: "portaria",
  name: "Portaria",
  purpose: "Teste",
  description: "",
  document_type: "portaria",
  status: "active",
  is_default: false,
  active_version: 1,
  usage_count: 0,
  versions: [],
};

const version: VersionDetail = {
  version_number: 1,
  status: "draft",
  config_hash: "hash",
  config: emptyConfig(),
  layout: defaultLayout(),
};

describe("DocumentModelBuilder layout", () => {
  it("mantém o canvas confinado e rolável quando documentos aprendidos aumentam o conteúdo", () => {
    const { container } = render(
      <DocumentModelBuilder model={model} version={version} onRefresh={vi.fn()} />
    );

    expect(container.querySelector("main")).toHaveClass(
      "min-h-0",
      "overflow-hidden"
    );
    expect(screen.getByTestId("builder-a4").parentElement).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-auto"
    );
  });
});
