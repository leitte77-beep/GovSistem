import { useState, useCallback, useEffect, useLayoutEffect } from 'react';

// Altura do campo de digitação: uma linha no repouso, crescendo com o conteúdo
// até um teto. O teto também respeita a altura da janela para que colar um texto
// longo não engula o histórico da conversa em telas baixas (notebook, tablet).
export const COMPOSER_ALTURA_MIN = 40;
export const COMPOSER_ALTURA_MAX = 220;

export function tetoComposer() {
  const alturaJanela = typeof window !== 'undefined' ? window.innerHeight : 900;
  return Math.max(88, Math.min(COMPOSER_ALTURA_MAX, Math.round(alturaJanela * 0.32)));
}

/**
 * Faz um <textarea> crescer conforme o conteúdo e rolar depois do teto.
 * `deps` são os valores que mudam o conteúdo (texto, preview de anexo, etc.).
 * Retorna a altura atual, útil para posicionar popovers ancorados no campo.
 */
export function useAlturaComposer(ref, deps = []) {
  const [altura, setAltura] = useState(COMPOSER_ALTURA_MIN);

  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const teto = tetoComposer();
    el.style.height = 'auto';
    // com box-sizing: border-box o scrollHeight não inclui as bordas
    const bordas = el.offsetHeight - el.clientHeight;
    const conteudo = el.scrollHeight + bordas;
    const alvo = Math.min(Math.max(conteudo, COMPOSER_ALTURA_MIN), teto);
    el.style.height = `${alvo}px`;
    el.style.overflowY = conteudo > teto ? 'auto' : 'hidden';
    setAltura(alvo);
  }, [ref]);

  useLayoutEffect(() => { ajustar(); }, [ajustar, ...deps]);

  useEffect(() => {
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [ajustar]);

  return altura;
}
