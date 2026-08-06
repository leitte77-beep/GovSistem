import type { ReactNode } from "react";

/**
 * Destaca (com <mark>) as ocorrências do termo dentro do texto, tolerante a
 * acentos e caixa. Usado no typeahead da busca global.
 */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function DestaqueTermo({
  texto,
  termo,
}: {
  texto: string;
  termo: string;
}): ReactNode {
  const t = termo.trim();
  if (!t) return texto;

  const alvo = normalizar(texto);
  const busca = normalizar(t);
  const partes: ReactNode[] = [];
  let i = 0;
  let chave = 0;

  while (i < texto.length) {
    const idx = alvo.indexOf(busca, i);
    if (idx === -1) {
      partes.push(texto.slice(i));
      break;
    }
    if (idx > i) partes.push(texto.slice(i, idx));
    partes.push(
      <mark key={chave++} className="rounded bg-amber/20 px-0.5 text-ink">
        {texto.slice(idx, idx + t.length)}
      </mark>,
    );
    i = idx + t.length;
  }
  return <>{partes}</>;
}
