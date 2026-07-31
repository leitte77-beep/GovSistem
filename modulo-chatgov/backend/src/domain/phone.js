export function normalizePhone(value, defaultCountry = '55') {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) throw new Error('Telefone obrigatório');
  if ((digits.length === 10 || digits.length === 11) && defaultCountry) {
    digits = `${defaultCountry}${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) throw new Error('Telefone inválido');

  const countryCode = digits.startsWith('55') ? '55' : digits.slice(0, Math.max(1, digits.length - 10));
  const national = digits.slice(countryCode.length);
  const areaCode = national.slice(0, 2);
  const localNumber = national.slice(2);
  const displayLocal = localNumber.length === 9
    ? `${localNumber.slice(0, 5)}-${localNumber.slice(5)}`
    : `${localNumber.slice(0, 4)}-${localNumber.slice(4)}`;

  return {
    phoneE164: `+${digits}`,
    phoneDisplay: `+${countryCode} (${areaCode}) ${displayLocal}`,
    countryCode,
    areaCode,
    localNumber,
  };
}
