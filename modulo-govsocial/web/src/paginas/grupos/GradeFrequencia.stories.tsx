import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SincronizacaoProvider } from "@/nucleo/offline/SincronizacaoProvider";
import { GradeFrequencia } from "./GradeFrequencia";
import type { InscricaoOut } from "@/tipos/grupos";

/**
 * A <GradeFrequencia> consulta a frequência existente via TanStack Query e usa a
 * fila de sincronização; por isso a story provê QueryClient + Sincronização.
 * Sem handlers de rede, a consulta fica vazia e a grade inicia todos presentes.
 */
const meta: Meta<typeof GradeFrequencia> = {
  title: "Grupos/GradeFrequencia",
  component: GradeFrequencia,
  decorators: [
    (Story) => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return (
        <QueryClientProvider client={qc}>
          <SincronizacaoProvider>
            <div className="max-w-md">
              <Story />
            </div>
          </SincronizacaoProvider>
        </QueryClientProvider>
      );
    },
  ],
};
export default meta;

type Story = StoryObj<typeof GradeFrequencia>;

const INSCRICOES: InscricaoOut[] = [
  {
    id: "insc-1",
    acao_coletiva_id: "ac1",
    person_id: "p1",
    family_id: null,
    data_inscricao: "2026-02-05T14:00:00Z",
    status: "ATIVA",
    motivo_desligamento: null,
    created_at: "2026-02-05T14:00:00Z",
  },
  {
    id: "insc-2",
    acao_coletiva_id: "ac1",
    person_id: "p2",
    family_id: null,
    data_inscricao: "2026-02-05T14:05:00Z",
    status: "ATIVA",
    motivo_desligamento: null,
    created_at: "2026-02-05T14:05:00Z",
  },
  {
    id: "insc-3",
    acao_coletiva_id: "ac1",
    person_id: "p3",
    family_id: null,
    data_inscricao: "2026-02-06T09:00:00Z",
    status: "LISTA_ESPERA",
    motivo_desligamento: null,
    created_at: "2026-02-06T09:00:00Z",
  },
];

const NOMES = new Map<string, string>([
  ["insc-1", "Maria da Silva Souza"],
  ["insc-2", "João Souza"],
  ["insc-3", "Antônia Pereira"],
]);

export const Padrao: Story = {
  args: {
    acaoId: "ac1",
    encontroId: "enc-atual",
    inscricoes: INSCRICOES,
    nomePorInscricao: NOMES,
    encontroAnteriorId: "enc-anterior",
  },
};

export const SemParticipantes: Story = {
  args: {
    acaoId: "ac1",
    encontroId: "enc-atual",
    inscricoes: [],
    nomePorInscricao: new Map(),
    encontroAnteriorId: null,
  },
};
