import type { Meta, StoryObj } from "@storybook/react";
import { CartaoFila } from "./CartaoFila";
import type { AppointmentOut } from "@/tipos/agenda";

/**
 * Cartões da fila do dia (§4.6). A cor de urgência da espera acompanha sempre um
 * texto ("Espera: 40 min"), nunca comunica só por cor.
 */
const meta: Meta<typeof CartaoFila> = {
  title: "Agenda/CartaoFila",
  component: CartaoFila,
};
export default meta;

type Story = StoryObj<typeof CartaoFila>;

function base(min: number, status: string): AppointmentOut {
  return {
    id: "a1",
    unit_id: "u1",
    professional_id: null,
    person_id: "p1",
    family_id: null,
    tipo: "ATENDIMENTO",
    status,
    data_hora_inicio: new Date().toISOString(),
    data_hora_fim: null,
    observacoes: "Atualização do CadÚnico",
    senha: "A",
    lembrete_enviado: false,
    opt_in_lembrete: false,
    created_at: new Date(Date.now() - min * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export const Aguardando: Story = {
  args: {
    agendamento: base(12, "AGUARDANDO"),
    nome: "Maria da Silva Souza",
    acoes: [{ rotulo: "Chamar", variante: "primario", aoClicar: () => {} }],
  },
};

export const EsperaCritica: Story = {
  args: {
    agendamento: base(65, "AGUARDANDO"),
    nome: "João Souza",
    acoes: [{ rotulo: "Chamar", variante: "primario", aoClicar: () => {} }],
  },
};

export const Agendado: Story = {
  args: {
    agendamento: base(0, "AGENDADO"),
    nome: "Antônia Pereira",
    acoes: [{ rotulo: "Fazer check-in", variante: "primario", aoClicar: () => {} }],
  },
};

export const EmAtendimento: Story = {
  args: {
    agendamento: base(5, "EM_ATENDIMENTO"),
    nome: "Carlos Andrade",
    acoes: [{ rotulo: "Concluir", variante: "secundario", aoClicar: () => {} }],
  },
};
