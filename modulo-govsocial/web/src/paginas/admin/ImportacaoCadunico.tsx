import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import { avisar } from "@/ui/Toast";
import { servicoAdmin } from "@/nucleo/api/admin";
import { queryClient } from "@/nucleo/query/queryClient";
import { formatarDataHora } from "@/nucleo/datas";
import type { ErroApi } from "@/nucleo/http/problemDetails";
import type { ImportResultOut } from "@/tipos/admin";
import { resumoConciliacao } from "./wizardModelo";

/**
 * Etapa 6 do wizard — Importação CadÚnico (§4.10). Upload do CSV → prévia da
 * conciliação (novos/atualizados/conflitos/erros) → concluir. Mostra o log da
 * amostra (NIS/CPF mascarados). O CSV nunca vai para a URL nem para o console.
 */
export function ImportacaoCadunico({ aoConcluir }: { aoConcluir: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ImportResultOut | null>(null);

  const uploadMut = useMutation({
    mutationFn: (f: File) => servicoAdmin.uploadCadunico(f),
    onSuccess: (r) => {
      setResultado(r);
      void queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["onboarding", "status"] });
      avisar.sucesso("Importação processada. Confira a conciliação.");
    },
    onError: (e) =>
      avisar.erro((e as ErroApi).problema?.detail ?? "Não foi possível importar o arquivo."),
  });

  const resumo = resultado ? resumoConciliacao(resultado.job) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-cartao border border-ink-soft/15 bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="arquivo-cadunico" className="text-sm font-semibold text-ink">
            Arquivo do CadÚnico (CSV)
          </label>
          <input
            ref={inputRef}
            id="arquivo-cadunico"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setResultado(null);
            }}
            className="text-sm text-ink file:mr-3 file:rounded-input file:border file:border-ink-soft/30 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary focus-visible:outline-focus"
          />
          <p className="text-xs text-ink-soft">
            A base é conciliada com o cadastro. Nada é gravado até você concluir a
            revisão.
          </p>
        </div>

        <div className="mt-3">
          <Botao
            iconeInicio={<FileUp aria-hidden className="h-4 w-4" />}
            onClick={() => arquivo && uploadMut.mutate(arquivo)}
            carregando={uploadMut.isPending}
            bloqueiaDuploSubmit
            disabled={!arquivo}
          >
            Enviar e conciliar
          </Botao>
        </div>
      </div>

      {uploadMut.isPending && <Skeleton variante="tabela" linhas={3} />}

      {resumo && resultado && (
        <div className="space-y-3">
          <div
            role="status"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            aria-label="Prévia da conciliação"
          >
            <Contador rotulo="Novos" valor={resumo.novos} cor="text-primary" />
            <Contador rotulo="Atualizados" valor={resumo.atualizados} cor="text-ink" />
            <Contador rotulo="Conflitos" valor={resumo.conflitos} cor="text-amber" />
            <Contador rotulo="Erros" valor={resumo.erros} cor="text-danger" />
          </div>

          {resultado.logs.length > 0 && (
            <div className="rounded-cartao border border-ink-soft/15 bg-surface p-3">
              <h3 className="mb-2 text-sm font-semibold text-ink">Amostra do log</h3>
              <table className="w-full border-collapse text-sm">
                <caption className="apenas-leitor">Amostra das linhas processadas</caption>
                <thead>
                  <tr className="border-b border-ink-soft/20 text-left text-ink-soft">
                    <th scope="col" className="py-1 pr-4 font-semibold">
                      Linha
                    </th>
                    <th scope="col" className="py-1 pr-4 font-semibold">
                      NIS
                    </th>
                    <th scope="col" className="py-1 pr-4 font-semibold">
                      Situação
                    </th>
                    <th scope="col" className="py-1 font-semibold">
                      Observação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.logs.map((l) => (
                    <tr key={l.id} className="border-b border-ink-soft/10">
                      <td className="py-1 pr-4 fonte-mono">{l.linha}</td>
                      <td className="py-1 pr-4 fonte-mono">{l.nis ?? "—"}</td>
                      <td className="py-1 pr-4">{l.status}</td>
                      <td className="py-1 text-ink-soft">{l.mensagem ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="flex items-center gap-2 text-xs text-ink-soft">
            {resumo.erros > 0 ? (
              <AlertTriangle aria-hidden className="h-4 w-4 text-amber" />
            ) : (
              <CheckCircle2 aria-hidden className="h-4 w-4 text-primary" />
            )}
            Job {resultado.job.status.toLowerCase()} em{" "}
            {formatarDataHora(resultado.job.created_at)} · {resumo.total} linha(s).
          </p>
        </div>
      )}

      <div className="flex justify-end border-t border-ink-soft/15 pt-4">
        <Botao onClick={aoConcluir} disabled={!resultado}>
          Concluir implantação
        </Botao>
      </div>
    </div>
  );
}

function Contador({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number;
  cor: string;
}) {
  return (
    <div className="rounded-input border border-ink-soft/15 bg-surface p-3 text-center">
      <p className={`font-titulo text-2xl tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs text-ink-soft">{rotulo}</p>
    </div>
  );
}
