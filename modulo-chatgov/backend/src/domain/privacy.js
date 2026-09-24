export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function maskCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return value ? '***.***.***-**' : null;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function maskPhone(value) {
  const digits = onlyDigits(value);
  if (digits.length < 8) return value ? '********' : null;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function protectSensitiveFields(record, canViewSensitive) {
  if (!record || canViewSensitive) return record;
  return {
    ...record,
    cpf: maskCpf(record.cpf),
    contato_cpf: maskCpf(record.contato_cpf),
    email: record.email ? record.email.replace(/(^.).*(@.*$)/, '$1***$2') : record.email,
  };
}
