"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { BlocoAssinaturaDetalhe, BlocoAssinaturaOut } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import ConfirmModal from "@/components/ConfirmModal";
import { formatDateTime } from "@/lib/format";

export default function BlocosAssinaturaPage() {
  const [blocos, setBlocos] = useState<BlocoAssinaturaOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [aberto, setAberto] = useState<BlocoAssinaturaDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [confirmarAssinatura, setConfirmarAssinatura] = useState(false);
  const [assinando, setAssinando] = useState(false);

  const carregar = () =>
    api
      .listBlocosAssinatura()
      .then(setBlocos)
      .catch(() => toast.error("Falha ao carregar blocos de assinatura"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const criarBloco = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setCriando(true);
    try {
      await api.criarBlocoAssinatura(novoNome.trim());
      toast.success("Bloco criado");
      setNovoNome("");
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar bloco");
    } finally {
      setCriando(false);
    }
  };

  const abrirBloco = async (id: string) => {
    setCarregandoDetalhe(true);
    try {
      const detalhe = await api.detalharBlocoAssinatura(id);
      setAberto(detalhe);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir bloco");
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  const assinar = async () => {
    if (!aberto) return;
    setAssinando(true);
    try {
      await api.assinarBloco(aberto.id);
      toast.success("Documentos do bloco assinados");
      setConfirmarAssinatura(false);
      setAberto(null);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao assinar bloco");
    } finally {
      setAssinando(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Blocos de assinatura"
        subtitle="Reúna documentos pendentes e assine em lote. Você poderá conferir cada documento antes de assinar."
      />

      <div className="px-gutter max-w-container-max mx-auto">
        <form onSubmit={criarBloco} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 mb-4 flex gap-3">
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do novo bloco (ex.: Despachos da tarde)"
            className="flex-1 h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={criando}
            className="h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
          >
            {criando ? "Criando…" : "Criar bloco"}
          </button>
        </form>

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : blocos.length === 0 ? (
          <EmptyState
            icon="draw"
            title="Nenhum bloco de assinatura"
            description="Crie um bloco e adicione documentos pendentes a partir da tela do processo."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {blocos.map((b) => (
              <button
                key={b.id}
                onClick={() => abrirBloco(b.id)}
                className="text-left bg-surface-container-lowest rounded-lg border border-outline-variant p-5 hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-headline-sm font-headline-sm text-on-surface">{b.nome}</h3>
                  <Badge tone={b.total_documentos > 0 ? "primary" : "neutral"}>{b.total_documentos} doc.</Badge>
                </div>
                <p className="mt-2 text-body-sm text-on-surface-variant">Criado em {formatDateTime(b.created_at)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAberto(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-surface-container-lowest rounded-lg shadow-xl p-6">
            <h3 className="text-headline-sm font-headline-sm text-on-surface mb-1">{aberto.nome}</h3>
            <p className="text-body-sm text-on-surface-variant mb-4">
              {aberto.documentos.length} documento(s) neste bloco.
            </p>

            {aberto.documentos.length === 0 ? (
              <EmptyState icon="description" title="Bloco vazio" description="Adicione documentos a partir da tela do processo." />
            ) : (
              <ul className="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
                {aberto.documentos.map((d) => (
                  <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-md text-on-surface truncate">{d.titulo}</p>
                      <p className="text-body-sm text-on-surface-variant">Processo {d.processo_nup}</p>
                    </div>
                    <Badge tone={d.situacao === "ASSINADO" ? "success" : "neutral"}>{d.situacao}</Badge>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setAberto(null)}
                className="h-10 px-4 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={() => setConfirmarAssinatura(true)}
                disabled={aberto.documentos.length === 0 || carregandoDetalhe}
                className="h-10 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
              >
                Assinar todos
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmarAssinatura}
        title="Assinar bloco"
        message={`Você está prestes a assinar ${aberto?.documentos.length ?? 0} documento(s) de uma vez. Confirma?`}
        confirmLabel="Assinar"
        loading={assinando}
        onConfirm={assinar}
        onCancel={() => setConfirmarAssinatura(false)}
      />
    </div>
  );
}
