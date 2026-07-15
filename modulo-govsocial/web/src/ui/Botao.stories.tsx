import type { Meta, StoryObj } from "@storybook/react";
import { Plus } from "lucide-react";
import { Botao } from "./Botao";

const meta: Meta<typeof Botao> = {
  title: "Base/Botão",
  component: Botao,
  args: { children: "Registrar atendimento" },
};
export default meta;

type Story = StoryObj<typeof Botao>;

export const Primario: Story = { args: { variante: "primario" } };
export const Secundario: Story = { args: { variante: "secundario", children: "Cancelar" } };
export const Perigo: Story = { args: { variante: "perigo", children: "Fechar RMA de junho" } };
export const Texto: Story = { args: { variante: "texto", children: "Ver detalhes" } };
export const ComIcone: Story = {
  args: { iconeInicio: <Plus className="h-4 w-4" aria-hidden />, children: "Cadastrar nova família" },
};
export const Carregando: Story = { args: { carregando: true, children: "Salvando…" } };
export const Desabilitado: Story = { args: { disabled: true } };
