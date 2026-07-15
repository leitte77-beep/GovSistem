import type { Meta, StoryObj } from "@storybook/react";
import { CartaoSigiloso } from "./CartaoSigiloso";

const meta: Meta = { title: "Sigilo/CartaoSigiloso" };
export default meta;

type Payload = { texto: string | null; restrito: boolean };
type Story = StoryObj;

export const Legivel: Story = {
  render: () => (
    <div className="max-w-md">
      <CartaoSigiloso<Payload>
        buscar={async () => ({
          texto:
            "Acolhida realizada. Família em acompanhamento PAIF. Retorno em 30 dias.",
          restrito: false,
        })}
        extrairTexto={(d) => d.texto}
        estaRestrito={(d) => d.restrito}
      />
    </div>
  ),
};

export const Restrito: Story = {
  render: () => (
    <div className="max-w-md">
      <CartaoSigiloso<Payload>
        reforcado
        buscar={async () => ({ texto: null, restrito: true })}
        extrairTexto={(d) => d.texto}
        estaRestrito={(d) => d.restrito}
      />
    </div>
  ),
};
