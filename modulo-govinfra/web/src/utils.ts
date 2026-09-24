/** Utilidades de formatação e apoio das telas. */

export function iniciais(nome?: string | null): string {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function formatarData(valor?: string | null): string {
  if (!valor) return '—';
  const data = new Date(valor.length <= 10 ? `${valor}T00:00:00` : valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString('pt-BR');
}

export function formatarDataHora(valor?: string | null): string {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatarNumero(valor?: number | null, casas = 0): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarDinheiro(valor?: number | null): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarCpf(cpf?: string | null): string {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatarTelefone(telefone?: string | null): string {
  if (!telefone) return '—';
  const d = telefone.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return telefone;
}

export function formatarPlaca(placa?: string | null): string {
  if (!placa) return '—';
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p.length === 7) return `${p.slice(0, 3)}-${p.slice(3)}`;
  return p;
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function adicionarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function primeiraLetraMaiuscula(texto?: string | null): string {
  if (!texto) return '';
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function tempoDecorrido(dataISO?: string | null): string {
  if (!dataISO) return '—';
  const inicio = new Date(dataISO).getTime();
  const agora = Date.now();
  const dias = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24));
  if (dias <= 0) {
    const horas = Math.max(0, Math.floor((agora - inicio) / (1000 * 60 * 60)));
    return horas > 0 ? `${horas}h` : 'hoje';
  }
  return `${dias} dia(s)`;
}

/** Cores dos chips por situação — texto sempre acompanha a cor (acessibilidade). */
export function corSituacao(situacao: string): string {
  const mapa: Record<string, string> = {
    disponivel: 'verde',
    em_uso: 'azul',
    em_operacao: 'azul',
    aguardando_entrega: 'laranja',
    aguardando_retirada: 'laranja',
    aguardando_agendamento: 'laranja',
    aguardando_aprovacao: 'laranja',
    aguardando_vistoria: 'laranja',
    aguardando_documentos: 'laranja',
    reservada: 'roxo',
    em_analise: 'roxo',
    em_limpeza: 'roxo',
    em_transporte: 'roxo',
    em_transporte_entrega: 'roxo',
    em_transporte_retorno: 'roxo',
    em_deslocamento: 'roxo',
    pendente: 'amarelo',
    protocolada: 'amarelo',
    rascunho: 'cinza',
    inativa: 'cinza',
    vistoria_agendada: 'amarelo',
    vistoria_realizada: 'roxo',
    aguardando_parecer: 'roxo',
    emitida: 'amarelo',
    em_execucao: 'azul',
    em_abastecimento: 'roxo',
    parada: 'amarelo',
    pausada: 'amarelo',
    em_manutencao: 'vermelho',
    em_manutencao_preventiva: 'vermelho',
    em_manutencao_corretiva: 'vermelho',
    em_vistoria: 'roxo',
    indisponivel: 'vermelho',
    aprovada: 'verde',
    agendada: 'verde',
    concluida: 'verde',
    ativo: 'verde',
    ativa: 'verde',
    aberta: 'vermelho',
    em_execucao_2: 'amarelo',
    reprovada: 'vermelho',
    cancelada: 'vermelho',
    baixada: 'cinza',
    suspenso: 'vermelho',
    encerrado: 'cinza',
  };
  return mapa[situacao] || 'cinza';
}

export function rotulosSituacao(entidade: 'solicitacao' | 'cacamba' | 'servico' | 'ordem' | 'equipamento' | 'manutencao'): Record<string, string> {
  const comuns: Record<string, string> = {
    disponivel: 'Disponível',
    reservada: 'Reservada',
    em_uso: 'Em uso',
    em_limpeza: 'Em limpeza',
    em_vistoria: 'Em vistoria',
    em_manutencao: 'Em manutenção',
    em_manutencao_preventiva: 'Manutenção preventiva',
    em_manutencao_corretiva: 'Manutenção corretiva',
    em_abastecimento: 'Em abastecimento',
    em_deslocamento: 'Em deslocamento',
    em_operacao: 'Em operação',
    indisponivel: 'Indisponível',
    inativa: 'Inativa',
    baixada: 'Baixada',
    parada: 'Parada',
  };
  if (entidade === 'solicitacao' || entidade === 'cacamba') {
    return {
      ...comuns,
      rascunho: 'Rascunho',
      pendente: 'Pendente',
      em_analise: 'Em análise',
      aguardando_documentos: 'Aguardando documentos',
      aprovada: 'Aprovada',
      reprovada: 'Reprovada',
      aguardando_agendamento: 'Aguardando agendamento',
      agendada: 'Agendada',
      aguardando_entrega: 'Aguardando entrega',
      em_transporte: 'Em transporte',
      em_transporte_entrega: 'Em transporte (entrega)',
      em_transporte_retorno: 'Em transporte (retorno)',
      aguardando_retirada: 'Aguardando retirada',
      em_retirada: 'Em retirada',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
    };
  }
  if (entidade === 'servico') {
    return {
      ...comuns,
      rascunho: 'Rascunho',
      protocolada: 'Protocolada',
      aguardando_documentos: 'Aguardando documentos',
      em_analise: 'Em análise',
      aguardando_vistoria: 'Aguardando vistoria',
      vistoria_agendada: 'Vistoria agendada',
      vistoria_realizada: 'Vistoria realizada',
      aguardando_parecer: 'Aguardando parecer',
      aguardando_aprovacao: 'Aguardando aprovação',
      aprovada: 'Aprovada',
      reprovada: 'Reprovada',
      aguardando_agendamento: 'Aguardando agendamento',
      agendada: 'Agendada',
      em_execucao: 'Em execução',
      pausada: 'Pausada',
      aguardando_horas_adicionais: 'Aguardando horas adicionais',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
    };
  }
  if (entidade === 'ordem') {
    return {
      emitida: 'Emitida',
      em_execucao: 'Em execução',
      pausada: 'Pausada',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
    };
  }
  if (entidade === 'manutencao') {
    return {
      aberta: 'Aberta',
      aguardando_peca: 'Aguardando peça',
      em_execucao: 'Em execução',
      concluida: 'Concluída',
      cancelada: 'Cancelada',
    };
  }
  return comuns;
}

export function rotuloSituacao(entidade: string, valor: string): string {
  return rotulosSituacao(entidade as any)[valor] || valor.replaceAll('_', ' ');
}

/** Nome do ícone lucide-react para cada situação de caçamba. */
export function iconeSituacao(situacao: string): string {
  const mapa: Record<string, string> = {
    disponivel: 'CheckCircle2',
    reservada: 'Calendar',
    aguardando_entrega: 'Clock',
    em_transporte_entrega: 'Truck',
    em_uso: 'HardHat',
    aguardando_retirada: 'Clock',
    em_transporte_retorno: 'Truck',
    em_limpeza: 'Droplets',
    em_vistoria: 'ClipboardCheck',
    em_manutencao: 'Wrench',
    indisponivel: 'AlertTriangle',
    inativa: 'Archive',
    baixada: 'ArchiveX',
  };
  return mapa[situacao] || 'Circle';
}

/** Categoria visual (cor de cartão) para cada situação. */
export function categoriaSituacao(situacao: string): string {
  const mapa: Record<string, string> = {
    disponivel: 'verde',
    reservada: 'roxo',
    aguardando_entrega: 'laranja',
    em_transporte_entrega: 'roxo',
    em_uso: 'azul',
    aguardando_retirada: 'amarelo',
    em_transporte_retorno: 'roxo',
    em_limpeza: 'roxo',
    em_vistoria: 'roxo',
    em_manutencao: 'vermelho',
    indisponivel: 'vermelho',
    inativa: 'cinza',
    baixada: 'cinza',
  };
  return mapa[situacao] || 'cinza';
}

/** Rótulo curto (uma ou duas palavras) para uso em chips e listas compactas. */
export function rotuloCurto(situacao: string): string {
  const mapa: Record<string, string> = {
    disponivel: 'Disponível',
    reservada: 'Reservada',
    aguardando_entrega: 'Ag. entrega',
    em_transporte_entrega: 'Em trânsito',
    em_uso: 'Em uso',
    aguardando_retirada: 'Ag. retirada',
    em_transporte_retorno: 'Retornando',
    em_limpeza: 'Limpeza',
    em_vistoria: 'Vistoria',
    em_manutencao: 'Manutenção',
    indisponivel: 'Indisponível',
    inativa: 'Inativa',
    baixada: 'Baixada',
  };
  return mapa[situacao] || situacao.replaceAll('_', ' ');
}

/** Dias entre duas datas ISO, positivo se a primeira for mais antiga. */
export function diasEntre(inicio?: string | null, fim?: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio.length <= 10 ? `${inicio}T00:00:00` : inicio);
  const b = new Date(fim.length <= 10 ? `${fim}T00:00:00` : fim);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Situações consideradas "em atraso" para alertas. */
export const SITUACOES_ATRASADAS = ['aguardando_retirada', 'aguardando_entrega'];
