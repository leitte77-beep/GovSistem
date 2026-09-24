import { T } from '../../theme';

// Cores da prioridade. Usadas em faixa lateral / etiqueta / ponto — nunca para
// pintar o card inteiro, que transformaria a lista num semáforo ilegível.
export const PRIORIDADES = {
  baixa:   { label: 'Baixa',   cor: T.textMuted, fundo: T.surfaceMuted },
  normal:  { label: 'Normal',  cor: T.primary,   fundo: T.primarySoft },
  alta:    { label: 'Alta',    cor: T.warning,   fundo: T.warningSoft },
  urgente: { label: 'Urgente', cor: T.danger,    fundo: T.dangerSoft },
};

export const TIPOS = {
  compromisso: { label: 'Compromisso', ajuda: 'Tem data e horário definidos.' },
  tarefa:      { label: 'Tarefa',      ajuda: 'Tem prazo, mas não necessariamente horário.' },
  lembrete:    { label: 'Lembrete',    ajuda: 'É apenas um aviso simples.' },
};

// Opções de antecedência do lembrete, em minutos.
export const OPCOES_LEMBRETE = [
  { min: 0,    label: 'No horário' },
  { min: 5,    label: '5 minutos antes' },
  { min: 15,   label: '15 minutos antes' },
  { min: 30,   label: '30 minutos antes' },
  { min: 60,   label: '1 hora antes' },
  { min: 1440, label: '1 dia antes' },
];

export const OPCOES_ADIAR = [
  { min: 5,    label: '5 min' },
  { min: 10,   label: '10 min' },
  { min: 30,   label: '30 min' },
  { min: 60,   label: '1 hora' },
  { min: 1440, label: 'Amanhã' },
];

export function formatarHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatarData(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function meiaNoite(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Rótulo curto do dia: "Hoje", "Amanhã", "Ontem", o dia da semana dentro da
 * próxima semana, e a data quando estiver mais longe que isso.
 */
export function rotuloDia(iso, base = new Date()) {
  if (!iso) return '';
  const dias = Math.round((meiaNoite(iso) - meiaNoite(base)) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  if (dias === -1) return 'Ontem';
  if (dias > 1 && dias < 7) {
    const nome = new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }
  return formatarData(iso);
}

/** Horário exibido na linha do item. Item de dia inteiro não mostra hora. */
export function horarioDoItem(item) {
  if (!item) return '';
  if (item.dia_todo) return 'Dia inteiro';
  const ini = formatarHora(item.inicio);
  return item.fim ? `${ini}–${formatarHora(item.fim)}` : ini;
}

/**
 * Atraso é sempre derivado, nunca lido de um campo. Item de dia inteiro só
 * atrasa depois que o dia acaba — senão apareceria como atrasado às 00h01.
 */
export function estaAtrasado(item, agora = Date.now()) {
  if (!item || item.status === 'concluida' || item.status === 'cancelada') return false;
  const inicio = new Date(item.inicio);
  if (item.dia_todo) {
    const fimDoDia = meiaNoite(inicio);
    fimDoDia.setDate(fimDoDia.getDate() + 1);
    return fimDoDia.getTime() <= agora;
  }
  return inicio.getTime() < agora;
}

/** "Faltam 30 minutos" / "Começou há 5 minutos", para o popup de lembrete. */
export function tempoAte(iso, agora = Date.now()) {
  if (!iso) return '';
  const diffMin = Math.round((new Date(iso).getTime() - agora) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'Agora';
  const texto = abs < 60
    ? `${abs} minuto${abs === 1 ? '' : 's'}`
    : abs < 1440
      ? `${Math.round(abs / 60)} hora${Math.round(abs / 60) === 1 ? '' : 's'}`
      : `${Math.round(abs / 1440)} dia${Math.round(abs / 1440) === 1 ? '' : 's'}`;
  return diffMin > 0 ? `Faltam ${texto}` : `Há ${texto}`;
}

/** Saudação do modal de login, pelo horário local de quem abre. */
export function saudacao(base = new Date()) {
  const h = base.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Primeiro nome — "Bom dia, Alisson" lê melhor que o nome completo. */
export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

/** Junta data (yyyy-mm-dd) e hora (hh:mm) do formulário num ISO local. */
export function montarISO(data, hora) {
  if (!data) return null;
  const [ano, mes, dia] = data.split('-').map(Number);
  const [h, m] = (hora || '00:00').split(':').map(Number);
  const d = new Date(ano, (mes || 1) - 1, dia || 1, h || 0, m || 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Inverso de `montarISO`, para preencher o formulário na edição. */
export function partesDoISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return {
    data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}
