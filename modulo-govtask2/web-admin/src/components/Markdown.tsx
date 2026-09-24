/**
 * Renderizador de Markdown mínimo e seguro.
 *
 * Suporta só o que a barra do editor produz: **negrito**, _itálico_, listas com
 * marcador e listas numeradas. Nada é interpretado como HTML — o texto vira
 * nós React, então não há risco de XSS nem necessidade de sanitizar.
 */

import { Fragment, type ReactNode } from "react";

function inline(linha: string, chave: string): ReactNode[] {
  const partes = linha.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return partes.filter(Boolean).map((parte, i) => {
    const k = `${chave}-${i}`;
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return <strong key={k}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("_") && parte.endsWith("_") && parte.length > 2) {
      return <em key={k}>{parte.slice(1, -1)}</em>;
    }
    return <Fragment key={k}>{parte}</Fragment>;
  });
}

type Bloco = { tipo: "p" | "ul" | "ol"; linhas: string[] };

function emBlocos(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let tipo: Bloco["tipo"] | null = null;
  let linhas: string[] = [];

  function fechar() {
    if (linhas.length && tipo) blocos.push({ tipo, linhas });
    tipo = null;
    linhas = [];
  }

  for (const linha of texto.replace(/\r\n/g, "\n").split("\n")) {
    if (linha.trim() === "") {
      fechar();
      continue;
    }
    const marcador = /^\s*[-*]\s+(.*)$/.exec(linha);
    const numerada = /^\s*\d+[.)]\s+(.*)$/.exec(linha);
    if (marcador) {
      if (tipo !== "ul") fechar();
      tipo = "ul";
      linhas.push(marcador[1]);
    } else if (numerada) {
      if (tipo !== "ol") fechar();
      tipo = "ol";
      linhas.push(numerada[1]);
    } else {
      if (tipo !== "p") fechar();
      tipo = "p";
      linhas.push(linha);
    }
  }
  fechar();
  return blocos;
}

export function Markdown({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={className}>
      {emBlocos(texto).map((bloco, bi) => {
        if (bloco.tipo === "ul") {
          return (
            <ul key={bi} className="ml-5 list-disc space-y-0.5">
              {bloco.linhas.map((linha, i) => (
                <li key={i}>{inline(linha, `${bi}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (bloco.tipo === "ol") {
          return (
            <ol key={bi} className="ml-5 list-decimal space-y-0.5">
              {bloco.linhas.map((linha, i) => (
                <li key={i}>{inline(linha, `${bi}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {bloco.linhas.map((linha, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(linha, `${bi}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
