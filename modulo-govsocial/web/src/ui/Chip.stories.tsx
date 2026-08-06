import type { Meta, StoryObj } from "@storybook/react";
import { Chip } from "./Chip";
import { Cadeado } from "./Cadeado";

const meta: Meta<typeof Chip> = {
  title: "Base/Chip",
  component: Chip,
  args: { children: "Em acompanhamento PAIF", cor: "paif" },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const PorTipoDeEvento: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip cor="paif">PAIF</Chip>
      <Chip cor="scfv">SCFV</Chip>
      <Chip cor="paefi" icone={<Cadeado />}>
        PAEFI
      </Chip>
      <Chip cor="mse">MSE</Chip>
      <Chip cor="beneficio">Benefício</Chip>
      <Chip cor="encaminhamento">Encaminhamento</Chip>
      <Chip cor="visita">Visita domiciliar</Chip>
    </div>
  ),
};

export const Situacoes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Chip cor="primario">PBF</Chip>
      <Chip cor="neutro">CadÚnico atualizado 03/2026</Chip>
      <Chip cor="amber">Plano vencido</Chip>
      <Chip cor="danger">Violação de direitos</Chip>
    </div>
  ),
};
