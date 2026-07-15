import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useFamilia } from "@/nucleo/api/hooks";
import { Skeleton } from "@/ui/Skeleton";
import { Botao } from "@/ui/Botao";
import { formatarData } from "@/nucleo/datas";
import { rotuloDe, PARENTESCO, FAIXA_RENDA } from "@/i18n/dominios";

/**
 * Impressão A4 do Prontuário SUAS (visualização) — renderiza dentro do
 * LayoutImpressao (com brasão do tenant). A evolução técnica NÃO é impressa
 * nesta visão do front (respeita o sigilo — §4.2); o PDF numerado/oficial é
 * gerado pelo backend em GET /case-files/{id}/pdf.
 */
export default function ProntuarioImpressao() {
  const { familiaId } = useParams<{ familiaId: string }>();
  const { data: familia, isLoading } = useFamilia(familiaId);

  useEffect(() => {
    if (familia) {
      const t = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(t);
    }
  }, [familia]);

  if (isLoading || !familia) return <Skeleton variante="cartao" />;

  const ativos = familia.membros.filter((m) => m.status === "ATIVO");

  return (
    <article>
      <div className="nao-imprimir mb-4 flex justify-end">
        <Botao variante="secundario" tamanho="sm" onClick={() => window.print()}>
          Imprimir
        </Botao>
      </div>

      <h1 className="text-lg">Prontuário SUAS — Família nº {familia.codigo}</h1>
      <p className="text-sm text-ink-soft">
        {familia.territorio ?? familia.bairro ?? ""} · Emitido em{" "}
        {formatarData(new Date().toISOString())}
      </p>

      <section className="mt-4">
        <h2 className="text-base">Responsável familiar</h2>
        <p className="text-sm">
          {familia.responsavel_nome ?? "—"}{" "}
          {familia.nis_responsavel_mascarado && (
            <span className="fonte-mono">· NIS {familia.nis_responsavel_mascarado}</span>
          )}
        </p>
      </section>

      <section className="mt-4">
        <h2 className="text-base">Endereço</h2>
        <p className="text-sm">
          {[familia.logradouro, familia.numero, familia.bairro, familia.municipio, familia.uf]
            .filter(Boolean)
            .join(", ") || "Não informado"}
        </p>
      </section>

      <section className="mt-4">
        <h2 className="text-base">Situação</h2>
        <ul className="text-sm">
          <li>Faixa de renda: {rotuloDe(FAIXA_RENDA, familia.faixa_renda) || "—"}</li>
          <li>Inscrita no CadÚnico: {familia.no_cadunico ? "Sim" : "Não"}</li>
          <li>Bolsa Família: {familia.beneficiaria_pbf ? "Sim" : "Não"}</li>
          <li>BPC na família: {familia.possui_bpc ? "Sim" : "Não"}</li>
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="text-base">Composição familiar ({ativos.length})</h2>
        <table className="mt-1 w-full border-collapse text-sm">
          <caption className="apenas-leitor">Membros ativos da família</caption>
          <thead>
            <tr className="border-b border-ink-soft/30 text-left">
              <th scope="col" className="py-1">Nome</th>
              <th scope="col" className="py-1">Parentesco</th>
              <th scope="col" className="py-1">Desde</th>
            </tr>
          </thead>
          <tbody>
            {ativos.map((m) => (
              <tr key={m.membership_id} className="border-b border-ink-soft/15">
                <td className="py-1">{m.nome_exibicao}</td>
                <td className="py-1">{rotuloDe(PARENTESCO, m.parentesco)}</td>
                <td className="py-1">{formatarData(m.data_entrada)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-6 text-xs text-ink-soft">
        A evolução técnica é sigilosa e não consta nesta via de visualização. O
        prontuário oficial numerado é emitido pelo sistema mediante auditoria.
      </p>
    </article>
  );
}
