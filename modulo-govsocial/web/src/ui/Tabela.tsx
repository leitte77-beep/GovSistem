import clsx from "clsx";
import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export type Coluna<T> = {
  chave: string;
  titulo: string;
  alinhamento?: "esquerda" | "direita" | "centro";
  ordenavel?: boolean;
  render?: (linha: T) => ReactNode;
};

export type Ordenacao = {
  chave: string;
  direcao: "asc" | "desc";
};

export type TabelaProps<T> = {
  colunas: Coluna<T>[];
  dados: T[];
  chaveLinha: (linha: T) => string;
  caption: string;
  vazio?: ReactNode;
  carregando?: boolean;
  ordenacao?: Ordenacao | null;
  aoOrdenar?: (ordem: Ordenacao | null) => void;
  totalRegistros?: number;
};

const ALINHA: Record<NonNullable<Coluna<unknown>["alinhamento"]>, string> = {
  esquerda: "text-left",
  direita: "text-right",
  centro: "text-center",
};

function ordenarDados<T>(dados: T[], chave: string, direcao: "asc" | "desc"): T[] {
  return [...dados].sort((a, b) => {
    const va = (a as Record<string, unknown>)[chave] ?? "";
    const vb = (b as Record<string, unknown>)[chave] ?? "";
    const cmp = String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });
    return direcao === "asc" ? cmp : -cmp;
  });
}

export function Tabela<T>({
  colunas,
  dados,
  chaveLinha,
  caption,
  vazio,
  carregando,
  ordenacao: ordenacaoControlada,
  aoOrdenar,
  totalRegistros,
}: TabelaProps<T>) {
  const [ordemInterna, setOrdemInterna] = useState<Ordenacao | null>(null);

  const ordemAtiva = ordenacaoControlada !== undefined ? ordenacaoControlada : ordemInterna;
  const setOrdem = aoOrdenar ?? setOrdemInterna;
  const temControleExterno = ordenacaoControlada !== undefined;

  const dadosExibidos = useMemo(() => {
    if (temControleExterno || !ordemAtiva) return dados;
    return ordenarDados(dados, ordemAtiva.chave, ordemAtiva.direcao);
  }, [dados, ordemAtiva, temControleExterno]);

  function aoClicarCabecalho(chave: string, ordenavel: boolean | undefined) {
    if (!ordenavel) return;
    if (ordemAtiva?.chave === chave && ordemAtiva?.direcao === "asc") {
      setOrdem({ chave, direcao: "desc" });
    } else if (ordemAtiva?.chave === chave && ordemAtiva?.direcao === "desc") {
      setOrdem(null);
    } else {
      setOrdem({ chave, direcao: "asc" });
    }
  }

  function aoTeclarCabecalho(e: React.KeyboardEvent, chave: string, ordenavel: boolean | undefined) {
    if (!ordenavel) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      aoClicarCabecalho(chave, ordenavel);
    }
  }

  return (
    <div className="overflow-x-auto rounded-cartao border border-ink-soft/15 bg-surface shadow-um">
      <table className="w-full border-collapse text-sm">
        <caption className="apenas-leitor">{caption}</caption>
        <thead>
          <tr className="border-b border-ink-soft/15 bg-paper">
            {colunas.map((c) => {
              const ativa = ordemAtiva?.chave === c.chave;
              const direcao = ativa ? ordemAtiva.direcao : null;
              return (
                <th
                  key={c.chave}
                  scope="col"
                  className={clsx(
                    "px-3 py-2 font-titulo text-xs font-semibold uppercase tracking-wide text-ink-soft",
                    c.ordenavel && "cursor-pointer select-none hover:text-ink",
                    ALINHA[c.alinhamento ?? "esquerda"],
                  )}
                  onClick={() => aoClicarCabecalho(c.chave, c.ordenavel)}
                  onKeyDown={(e) => aoTeclarCabecalho(e, c.chave, c.ordenavel)}
                  tabIndex={c.ordenavel ? 0 : undefined}
                  role={c.ordenavel ? "columnheader button" : "columnheader"}
                  aria-sort={direcao === "asc" ? "ascending" : direcao === "desc" ? "descending" : undefined}
                  aria-label={c.ordenavel ? `${c.titulo} — clique para ordenar` : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.titulo}
                    {c.ordenavel && (
                      direcao === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> :
                      direcao === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden /> :
                      <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {carregando ? (
            <tr>
              <td colSpan={colunas.length} className="px-3 py-6 text-center text-ink-soft">
                Carregando…
              </td>
            </tr>
          ) : dadosExibidos.length === 0 ? (
            <tr>
              <td colSpan={colunas.length} className="px-3 py-6">
                {vazio ?? <span className="text-ink-soft">Nenhum registro.</span>}
              </td>
            </tr>
          ) : (
            dadosExibidos.map((linha) => (
              <tr
                key={chaveLinha(linha)}
                className="border-b border-ink-soft/10 last:border-0 hover:bg-primary-soft/40"
              >
                {colunas.map((c) => (
                  <td
                    key={c.chave}
                    className={clsx("px-3 py-2 text-ink", ALINHA[c.alinhamento ?? "esquerda"])}
                  >
                    {c.render
                      ? c.render(linha)
                      : String((linha as Record<string, unknown>)[c.chave] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totalRegistros !== undefined && (
          <tfoot>
            <tr className="border-t border-ink-soft/15 bg-paper">
              <td colSpan={colunas.length} className="px-3 py-1.5 text-xs text-ink-soft">
                {totalRegistros} registro{totalRegistros !== 1 ? "s" : ""}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
