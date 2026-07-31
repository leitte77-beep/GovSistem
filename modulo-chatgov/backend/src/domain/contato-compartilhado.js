function desescaparVCard(valor = '') {
  return String(valor)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim();
}

function extrairTelefoneVCard(vcard = '') {
  const linhas = String(vcard).replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  // O WhatsApp normalmente agrupa propriedades como `item1.TEL;waid=...`.
  // Também aceitamos o vCard convencional, cuja linha começa direto por TEL.
  const linhaTel = linhas.find((linha) => /^(?:[^:;.]+\.)?TEL(?:;|:)/i.test(linha));
  if (!linhaTel) return null;

  const waid = linhaTel.match(/(?:^|;)waid=([^;:]+)/i)?.[1];
  if (waid) return `+${waid.replace(/\D/g, '')}`;

  const valor = desescaparVCard(linhaTel.slice(linhaTel.indexOf(':') + 1));
  return valor || null;
}

function extrairNomeVCard(vcard = '') {
  const linhas = String(vcard).replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  const linhaNome = linhas.find((linha) => /^FN(?:;|:)/i.test(linha));
  if (!linhaNome) return null;
  return desescaparVCard(linhaNome.slice(linhaNome.indexOf(':') + 1)) || null;
}

function normalizarContato(contato = {}) {
  const vcard = contato.vcard || '';
  return {
    nome: contato.displayName || extrairNomeVCard(vcard) || 'Contato',
    telefone: extrairTelefoneVCard(vcard),
  };
}

export function extrairContatosCompartilhados(messageContent) {
  if (messageContent?.contactMessage) {
    return [normalizarContato(messageContent.contactMessage)];
  }

  const mensagem = messageContent?.contactsArrayMessage;
  if (!mensagem) return [];
  const contatos = Array.isArray(mensagem.contacts) ? mensagem.contacts : [];
  return contatos.map(normalizarContato);
}
