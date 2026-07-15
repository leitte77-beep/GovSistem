import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { EditorEvolucao } from "./EditorEvolucao";

const meta: Meta = { title: "Atendimento/EditorEvolucao" };
export default meta;

type Story = StoryObj;

export const Padrao: Story = {
  render: () => {
    const Demo = () => {
      const [v, setV] = useState("<p>Acolhida realizada.</p>");
      return (
        <div className="max-w-lg">
          <EditorEvolucao valor={v} aoMudar={setV} rascunhoEm={new Date().toISOString()} />
        </div>
      );
    };
    return <Demo />;
  },
};
