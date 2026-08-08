/** Formatação de datas — API em ISO 8601 UTC; exibição local (§15). */

/** Data/hora atual (relógio local do dispositivo). */
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
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos >= 0 ? anos : null;
}

/** Data por extenso curta: "quarta, 22 de jul. de 2026" (pt-BR). */
export function dataPorExtensoCurta(d: Date): string {
  const diaSemana = d
    .toLocaleDateString("pt-BR", { weekday: "long" })
    .replace("-feira", "");
  const mes = d.toLocaleDateString("pt-BR", { month: "short" });
  return `${diaSemana}, ${d.getDate()} de ${mes} de ${d.getFullYear()}`;
}
