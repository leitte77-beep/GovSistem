/**
 * Validações e máscaras brasileiras — espelham EXATAMENTE o backend
 * (modulo-govsocial/api/app/core/br_validators.py). Algoritmos de dígito
 * verificador (não regex). Usados por <CampoCPF>/<CampoNIS> (Fase 2) e testados
 * já na Fase 1 (regra §16).
 */

export function apenasDigitos(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor.replace(/\D/g, "");
}

export function validarCpf(cpf: string | null | undefined): boolean {
  const d = apenasDigitos(cpf);
  if (d.length !== 11) return false;
  if (d === d[0].repeat(11)) return false;

  for (let i = 9; i < 11; i++) {
    let soma = 0;
    for (let num = 0; num < i; num++) {
      soma += Number(d[num]) * (i + 1 - num);
    }
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[i])) return false;
  }
  return true;
}

export function validarNis(nis: string | null | undefined): boolean {
  const d = apenasDigitos(nis);
  if (d.length !== 11) return false;
  if (d === d[0].repeat(11)) return false;

  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * pesos[i];
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(d[10]);
}

export function validarCep(cep: string | null | undefined): boolean {
  return apenasDigitos(cep).length === 8;
}

// ── Máscaras de exibição (LGPD) — iguais ao backend ──────────────────
export function mascararCpf(cpf: string | null | undefined): string | null {
  const d = apenasDigitos(cpf);
  if (d.length !== 11) return null;
  return `***.***.***-${d.slice(-2)}`;
}

export function mascararNis(nis: string | null | undefined): string | null {
  const d = apenasDigitos(nis);
  if (d.length !== 11) return null;
  return `********${d.slice(-3)}`;
}

// ── Formatação completa (apenas telas de edição autorizadas) ─────────
export function formatarCpf(cpf: string | null | undefined): string | null {
  const d = apenasDigitos(cpf);
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Máscara progressiva para digitação de CPF (000.000.000-00). */
export function formatarCpfParcial(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
  let saida = p[0];
  if (p[1]) saida += "." + p[1];
  if (p[2]) saida += "." + p[2];
  if (p[3]) saida += "-" + p[3];
  return saida;
}

/** Máscara progressiva para digitação de CEP (00000-000). */
export function formatarCepParcial(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
