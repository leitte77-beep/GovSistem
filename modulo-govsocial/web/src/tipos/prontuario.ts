export type TimelineItem = {
  attendance_id: string;
  data_atendimento: string;
  tipo: string;
  service_type_code: string;
  sigiloso_reforcado: boolean;
  pode_ler_evolucao: boolean;
  unit_id?: string;
  registrado_por_id?: string;
  registrado_por_nome?: string;
  situacao?: string;
  evolution_text?: string;
  member_ids?: string[];
};
