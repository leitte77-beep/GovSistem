/**
 * DTO da fila de recepção/triagem (Fase 7) — espelha ReceptionOut de
 * app/schemas/prontuario.py. A recepção NÃO é atendimento (regra do RMA); o
 * motivo é texto curto e não sensível (§4.6).
 */
export type ReceptionOut = {
  id: string;
  unit_id: string;
  data: string;
  person_id: string | null;
  family_id: string | null;
  nome_informado: string | null;
  motivo: string | null;
  status: string; // AGUARDANDO | EM_ATENDIMENTO | ATENDIDO | DESISTIU | ENCAMINHADO
  senha: string | null;
  atendido_em: string | null;
  created_at: string;
};
