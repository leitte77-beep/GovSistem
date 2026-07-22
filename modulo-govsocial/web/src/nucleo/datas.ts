/** Formatação de datas — API em ISO 8601 UTC; exibição local (§15). */

/** Ponto centralizado de "agora" para facilitar testes. */
export function agora(): Date {
  return new Date();
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Idade em anos a partir de uma data de nascimento (ISO). */
export function idade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = agora();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos >= 0 ? anos : null;
}

const DIAS_SEMANA: Record<string, string> = {
  Sun: "domingo",
  Mon: "segunda",
  Tue: "terça",
  Wed: "quarta",
  Thu: "quinta",
  Fri: "sexta",
  Sat: "sábado",
};

const MESES: Record<string, string> = {
  Jan: "jan",
  Feb: "fev",
  Mar: "mar",
  Apr: "abr",
  May: "mai",
  Jun: "jun",
  Jul: "jul",
  Aug: "ago",
  Sep: "set",
  Oct: "out",
  Nov: "nov",
  Dec: "dez",
};

/** Data por extenso curta, em pt-BR: "quarta, 22 de jul. de 2026" */
export function dataPorExtensoCurta(data: Date = agora()): string {
  const diaSemana = data.toDateString().slice(0, 3);
  const mes = data.toDateString().slice(4, 7);
  const nomeMes = MESES[mes] ?? mes.toLowerCase();
  return `${DIAS_SEMANA[diaSemana] ?? diaSemana}, ${data.getDate()} de ${nomeMes}. de ${data.getFullYear()}`;
}

/** Competência no formato "jul/2026" */
export function competenciaAtual(data: Date = agora()): string {
  const mes = data.toDateString().slice(4, 7);
  return `${(MESES[mes] ?? mes.toLowerCase())}/${data.getFullYear()}`;
}
