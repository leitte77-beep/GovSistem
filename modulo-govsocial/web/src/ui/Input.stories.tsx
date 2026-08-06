import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Base/Input",
  component: Input,
  args: { label: "Nome civil", placeholder: "Digite o nome" },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Padrao: Story = {};
export const Obrigatorio: Story = { args: { obrigatorio: true } };
export const ComDica: Story = {
  args: { label: "CPF", dica: "Somente números", mono: true, placeholder: "000.000.000-00" },
};
export const ComErro: Story = {
  args: { label: "CPF", mono: true, erro: "CPF inválido — confira os dígitos verificadores." },
};
