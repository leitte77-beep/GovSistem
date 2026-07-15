import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CampoCPF } from "./CampoCPF";
import { CampoNIS } from "./CampoNIS";

const meta: Meta = { title: "Cadastro/Campos CPF e NIS" };
export default meta;

type Story = StoryObj;

export const CPF: Story = {
  render: () => {
    const Demo = () => {
      const [v, setV] = useState("");
      return (
        <div className="max-w-xs">
          <CampoCPF valor={v} aoMudar={setV} obrigatorio />
          <p className="mt-2 text-xs text-ink-soft">Tente: 529.982.247-25 (válido)</p>
        </div>
      );
    };
    return <Demo />;
  },
};

export const NIS: Story = {
  render: () => {
    const Demo = () => {
      const [v, setV] = useState("");
      return (
        <div className="max-w-xs">
          <CampoNIS valor={v} aoMudar={setV} />
          <p className="mt-2 text-xs text-ink-soft">Tente: 208.83856.29-2 (válido)</p>
        </div>
      );
    };
    return <Demo />;
  },
};
