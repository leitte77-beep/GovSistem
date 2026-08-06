import { Link } from "react-router-dom";
import { Modal } from "@/ui/Modal";
import { Botao } from "@/ui/Botao";
import { Skeleton } from "@/ui/Skeleton";
import { formatarData } from "@/nucleo/datas";
import type { RmaDrillDown } from "@/tipos/rma";

/**
 * Drill-down do RMA (§4.8): a lupa abre a lista EXATA de registros que compõem
 * o número, com link para cada origem. Não expõe PII — apenas referências
 * (nº da família, território, data).
 */
export function ModalDrillDown({
  aberto,
  titulo,
  carregando,
  dados,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  carregando: boolean;
  dados: RmaDrillDown | null;
  aoFechar: () => void;
}) {
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      descricao={
        dados
          ? `${dados.valor} registro(s) compõem este número.`
          : "Registros que compõem o número."
      }
      tamanho="lg"
      rodape={
        <Botao variante="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      {carregando ? (
        <Skeleton variante="tabela" linhas={4} />
      ) : !dados || dados.registros.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nenhum registro detalhado disponível para este número.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <caption className="apenas-leitor">
            Registros que compõem o número {titulo}
          </caption>
          <thead>
            <tr className="border-b border-ink-soft/20 text-left text-ink-soft">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Referência
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Território
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Data
              </th>
              <th scope="col" className="py-2 font-semibold">
                Origem
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.registros.map((r, i) => (
              <tr key={`${r.referencia}-${i}`} className="border-b border-ink-soft/10">
                <td className="py-2 pr-4 font-semibold text-ink">{r.referencia}</td>
                <td className="py-2 pr-4 text-ink-soft">{r.descricao}</td>
                <td className="py-2 pr-4 text-ink-soft">{formatarData(r.data)}</td>
                <td className="py-2">
                  {r.href ? (
                    <Link
                      to={r.href}
                      className="text-primary hover:underline focus-visible:outline-focus"
                    >
                      Abrir registro
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
