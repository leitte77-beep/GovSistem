"use client";

import toast from "react-hot-toast";
import { Download, ExternalLink, FileText, FileCode2, Image as ImageIcon, PackagePlus } from "lucide-react";
import { api, Entrada } from "@/lib/api";
import { Modal } from "@/components/tanque/Drawer";

function IconeAnexo(mime: string | null | undefined, nome: string) {
  const n = (nome || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(n)) return <ImageIcon size={16} />;
  if (m.includes("xml") || n.endsWith(".xml")) return <FileCode2 size={16} />;
  if (m.includes("pdf") || n.endsWith(".pdf")) return <FileText size={16} />;
  return <PackagePlus size={16} />;
}

/** Modal com os detalhes da entrada e ações de visualizar/baixar a NF. */
export function VerEntradaModal({ entrada, onClose }: { entrada: Entrada; onClose: () => void }) {
  const anexos = entrada.anexos ?? [];

  const visualizar = async (anexo: NonNullable<Entrada["anexos"]>[number]) => {
    try {
      await api.abrirAnexo(anexo);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const baixar = async (anexo: NonNullable<Entrada["anexos"]>[number]) => {
    try {
      await api.baixarAnexo(anexo);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const detalhes: [string, string][] = [
    ["Nº NF", entrada.numero_nota ?? "—"],
    ["Data", new Date(entrada.data_entrada + "T12:00").toLocaleDateString("pt-BR")],
    ["Tanque", entrada.tanque_nome ?? "—"],
    ["Combustível", entrada.combustivel_nome ?? "—"],
    ["Fornecedor", entrada.fornecedor_nome ?? "—"],
    ["Quantidade", `${Number(entrada.quantidade_litros).toLocaleString("pt-BR")} L`],
    ["Valor total", entrada.valor_total ? `R$ ${Number(entrada.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"],
    ["Valor por litro", entrada.valor_por_litro ? `R$ ${Number(entrada.valor_por_litro).toFixed(4)}` : "—"],
  ];

  return (
    <Modal aberto onClose={onClose} titulo={entrada.numero_nota ? `Entrada · NF ${entrada.numero_nota}` : "Detalhes da entrada"}>
      <div className="space-y-4 text-body-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-card border border-surface-border bg-surface-bg p-4">
          {detalhes.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-meta text-text-subtle">{k}</dt>
              <dd className="font-medium text-text-title">{v}</dd>
            </div>
          ))}
          <div className="col-span-2 flex flex-col">
            <dt className="text-meta text-text-subtle">Status</dt>
            <dd>
              <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${entrada.cancelada ? "bg-[#FFDAD6] text-[#BA1A1A]" : "bg-[#9DF6B3] text-[#106D34]"}`}>
                {entrada.cancelada ? "Cancelada" : "Confirmada"}
              </span>
            </dd>
          </div>
        </dl>

        {entrada.observacoes && <p className="whitespace-pre-line text-text-body">{entrada.observacoes}</p>}

        {entrada.cancelada && entrada.motivo_cancelamento && (
          <p className="rounded-btn bg-[#FFDAD6] px-3 py-2 text-meta text-[#BA1A1A]">Motivo do cancelamento: {entrada.motivo_cancelamento}</p>
        )}

        <div>
          <h4 className="mb-2 text-label font-semibold text-text-title">
            Documentos da NF ({anexos.length})
          </h4>
          {anexos.length === 0 ? (
            <p className="text-meta text-text-subtle">Nenhum documento anexado a esta entrada.</p>
          ) : (
            <ul className="space-y-2">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-btn border border-surface-border p-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-[#EFF6FF] text-[#1D4ED8]">
                    {IconeAnexo(a.mime, a.nome)}
                  </span>
                  <span className="flex-1 truncate text-body-sm text-text-body" title={a.nome}>{a.nome}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => visualizar(a)} title="Visualizar">
                    <ExternalLink size={16} /> Ver
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => baixar(a)} title="Baixar">
                    <Download size={16} /> Baixar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
