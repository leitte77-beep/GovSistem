import { type ReactNode } from "react";
import { Download } from "lucide-react";

type Linha = Record<string, unknown>;

function paraLinhaCSV(dados: Linha[], colunas: string[]): string {
  const cabecalho = colunas.join(",");
  const linhas = dados.map((d) =>
    colunas
      .map((c) => {
        const valor = String(d[c] ?? "");
        if (valor.includes(",") || valor.includes('"') || valor.includes("\n")) {
          return `"${valor.replace(/"/g, '""')}"`;
        }
        return valor;
      })
      .join(","),
  );
  return [cabecalho, ...linhas].join("\n");
}

export function ExportarCSV({
  dados,
  colunas,
  nomeArquivo,
  rotulo,
  icone,
}: {
  dados: Linha[];
  colunas: string[];
  nomeArquivo: string;
  rotulo?: string;
  icone?: ReactNode;
}) {
  function exportar() {
    const csv = paraLinhaCSV(dados, colunas);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (dados.length === 0) return null;

  return (
    <button
      type="button"
      onClick={exportar}
      className="inline-flex items-center gap-1.5 rounded-input border border-ink-soft/20 bg-surface px-3 py-1.5 text-sm hover:border-primary focus-visible:outline-focus"
      aria-label={rotulo ?? "Exportar CSV"}
    >
      {icone ?? <Download className="h-4 w-4" aria-hidden />}
      {rotulo ?? "Exportar CSV"}
    </button>
  );
}
