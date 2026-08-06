/**
 * DTOs de agenda, fila do dia e visitas domiciliares (Fase 7).
 * Espelham app/schemas/agenda.py e app/schemas/prontuario.py (ReceptionOut).
 */

export type AppointmentOut = {
  id: string;
  unit_id: string;
  professional_id: string | null;
  person_id: string | null;
  family_id: string | null;
  tipo: string; // ATENDIMENTO | VISITA_DOMICILIAR | GRUPO
  status: string; // AGENDADO | AGUARDANDO | EM_ATENDIMENTO | CONCLUIDO | FALTOU | CANCELADO
  data_hora_inicio: string;
  data_hora_fim: string | null;
  observacoes: string | null;
  senha: string | null;
  lembrete_enviado: boolean;
  opt_in_lembrete: boolean;
  created_at: string;
  updated_at: string;
};

export type AppointmentCreate = {
  unit_id: string;
  professional_id?: string | null;
  person_id?: string | null;
  family_id?: string | null;
  tipo?: string;
  data_hora_inicio: string;
  data_hora_fim?: string | null;
  observacoes?: string | null;
  opt_in_lembrete?: boolean;
};

export type AppointmentUpdate = {
  professional_id?: string | null;
  status?: string;
  data_hora_inicio?: string;
  data_hora_fim?: string | null;
  observacoes?: string | null;
};

export type VisitaOut = {
  id: string;
  family_id: string;
  unit_id: string;
  professional_id: string | null;
  attendance_id: string | null;
  data_planejada: string;
  data_realizada: string | null;
  status: string;
  endereco_confirmado: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};
