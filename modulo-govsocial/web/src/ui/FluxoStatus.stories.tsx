import type { Meta, StoryObj } from "@storybook/react";
import { FluxoStatus } from "./FluxoStatus";
import { ETAPAS_CONCESSAO } from "./fluxoConcessao";

const meta: Meta<typeof FluxoStatus> = {
  title: "Benefícios/FluxoStatus",
  component: FluxoStatus,
  args: { etapas: ETAPAS_CONCESSAO },
};
export default meta;

type Story = StoryObj<typeof FluxoStatus>;

export const Solicitado: Story = { args: { atual: 0 } };
export const EmAnalise: Story = { args: { atual: 1 } };
export const Aprovado: Story = { args: { atual: 2 } };
export const Entregue: Story = { args: { atual: 3 } };
export const Negado: Story = { args: { atual: 2, cancelado: true } };
