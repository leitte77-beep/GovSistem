// Ajuste de legibilidade para cores vindas do cadastro (cor do departamento).
//
// Um badge pinta o texto na cor do setor sobre um fundo de 8% da mesma cor.
// Cores claras — verde-água, salmão, azul-piscina — chegavam a 1.7:1 no tema
// claro. Aqui a cor do texto é puxada para preto (tema claro) ou para branco
// (tema escuro) até alcançar o contraste mínimo, preservando o matiz: o badge
// continua sendo "o vermelho da Informática", só que legível.

function paraRgb(hex) {
  var h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
}

function paraHex(rgb) {
  return '#' + rgb.map(function (c) {
    var v = Math.max(0, Math.min(255, Math.round(c))).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function canalLinear(c) {
  var v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminancia(rgb) {
  return 0.2126 * canalLinear(rgb[0]) + 0.7152 * canalLinear(rgb[1]) + 0.0722 * canalLinear(rgb[2]);
}

export function contraste(corA, corB) {
  var a = paraRgb(corA);
  var b = paraRgb(corB);
  if (!a || !b) return 21;
  var l1 = luminancia(a);
  var l2 = luminancia(b);
  var claro = Math.max(l1, l2);
  var escuro = Math.min(l1, l2);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Mistura `cor` com `alpha` (0–1) sobre `fundo`, devolvendo a cor resultante. */
export function sobrepor(cor, alpha, fundo) {
  var f = paraRgb(cor);
  var b = paraRgb(fundo);
  if (!f || !b) return fundo;
  return paraHex(f.map(function (c, i) { return c * alpha + b[i] * (1 - alpha); }));
}

/**
 * Devolve `cor` ajustada até atingir `minimo` de contraste contra `fundo`.
 * `paraEscuro` decide o sentido do ajuste (preto no tema claro, branco no escuro).
 */
export function corLegivel(cor, fundo, paraEscuro, minimo) {
  var base = paraRgb(cor);
  if (!base) return cor;
  var alvo = minimo || 4.5;
  if (contraste(cor, fundo) >= alvo) return cor;
  for (var passo = 0.02; passo <= 1.0001; passo += 0.02) {
    var candidata = paraHex(base.map(function (c) {
      return paraEscuro ? c * (1 - passo) : c + (255 - c) * passo;
    }));
    if (contraste(candidata, fundo) >= alvo) return candidata;
  }
  return paraEscuro ? '#000000' : '#ffffff';
}
