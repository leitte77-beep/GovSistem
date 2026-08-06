import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CampoCPF } from "@/ui/CampoCPF";
import { CampoNIS } from "@/ui/CampoNIS";

function WrapperCpf() {
  const [v, setV] = useState("");
  return <CampoCPF valor={v} aoMudar={setV} />;
}

function WrapperNis() {
  const [v, setV] = useState("");
  return <CampoNIS valor={v} aoMudar={setV} />;
}

describe("<CampoCPF> — máscara e validação de DV em tempo real", () => {
  it("aplica a máscara e sinaliza CPF válido", async () => {
    const user = userEvent.setup();
    render(<WrapperCpf />);
    const input = screen.getByLabelText("CPF") as HTMLInputElement;
    await user.type(input, "52998224725");
    expect(input.value).toBe("529.982.247-25");
    expect(screen.getByText("CPF válido")).toBeInTheDocument();
  });

  it("mostra erro de DV para CPF inválido completo", async () => {
    const user = userEvent.setup();
    render(<WrapperCpf />);
    const input = screen.getByLabelText("CPF");
    await user.type(input, "52998224724");
    expect(
      screen.getByText(/dígitos verificadores/i),
    ).toBeInTheDocument();
  });
});

describe("<CampoNIS> — validação de DV", () => {
  it("sinaliza NIS válido", async () => {
    const user = userEvent.setup();
    render(<WrapperNis />);
    const input = screen.getByLabelText("NIS");
    await user.type(input, "20883856292");
    expect(screen.getByText("NIS válido")).toBeInTheDocument();
  });
});
