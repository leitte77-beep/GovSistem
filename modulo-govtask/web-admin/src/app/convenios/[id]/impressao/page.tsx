"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";

type Dossie = {
  gerado_em: string;
  gerado_por: { id: string; name: string };
  processo: Record<string, any>;
  etapas: { nome: string; ordem: number; natureza: string; status: string }[];
  tarefas: { titulo: string; status: string; prazo: string | null; prioridade: string }[];
  documentos: { nome: string; categoria: string; classificacao: string; versao: number; enviado_externo: boolean; data: string }[];
  repasses: { parcela: number; valor_previsto: number | null; valor_recebido: number | null; status: string }[];
  medicoes: { numero: number; valor: number | null; percentual_acumulado: number | null; status: string }[];
  movimentos: { tipo: string; numero: string | null; valor: number | null; data: string | null }[];
  contratos: { numero: string | null; fornecedor: string | null; valor: number | null; status: string }[];
  licitacoes: { numero: string | null; modalidade: string | null; situacao: string; vencedor: string | null }[];
  prestacoes: { titulo: string | null; status: string; protocolo: string | null; percentual: number }[];
  diligencias: { descricao: string; status: string; resposta: string | null; protocolo: string | null }[];
  obras: { nome: string | null; empresa: string | null; percentual_fisico: number | null; situacao: string }[];
  entregas: { identificacao: string | null; fornecedor: string | null; status: string }[];
  timeline: { descricao: string; tipo: string; data: string }[];
};

const LABELS: Record<string, string> = {
  OBRA: "Obra", AQUISICAO: "Aquisição", SERVICO: "Serviço", OUTRO: "Outro",
  EMENDA_PARLAMENTAR: "Emenda Parlamentar", CONVENIO: "Convênio", CONTRATO_REPASSE: "Contrato de Repasse",
  TRANSFERENCIA_ESPECIAL: "Transferência Especial", TRANSFERENCIA_VOLUNTARIA: "Transferência Voluntária",
  FUNDO_A_FUNDO: "Fundo a Fundo", PROGRAMA_ESTADUAL: "Programa Estadual", PROGRAMA_FEDERAL: "Programa Federal",
  CUSTEIO: "Custeio", INVESTIMENTO: "Investimento",
  FEDERAL: "Federal", ESTADUAL: "Estadual", MUNICIPAL: "Municipal",
  RASCUNHO: "Rascunho", EM_ANDAMENTO: "Em Andamento", SUSPENSO: "Suspenso", CONCLUIDO: "Concluído", CANCELADO: "Cancelado",
  INTERNA: "Interna", GOVERNO: "Governo", PENDENTE: "Pendente", AGUARDANDO_GOVERNO: "Aguardando Governo", CONCLUIDA: "Concluída",
  AGUARDANDO_ACEITE: "Aguardando Aceite", ENTREGUE: "Entregue", DEVOLVIDA: "Devolvida", CANCELADA: "Cancelada",
  BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente",
  EMPENHO: "Empenho", LIQUIDACAO: "Liquidação", PAGAMENTO: "Pagamento", REPASSE_RECEBIDO: "Repasse Recebido",
  RENDIMENTO: "Rendimento", DEVOLUCAO: "Devolução",
};

const label = (v: any) => (v == null ? "—" : LABELS[v] || String(v));

export default function ImpressaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [dossie, setDossie] = useState<Dossie | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDossie((await api.dossieProcesso(id)) as unknown as Dossie);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const p = dossie?.processo;
  const brl = (v: number | null | undefined) => formatCurrency(v ?? 0);

  return (
    <div className="min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-page { box-shadow: none !important; border: none !important; }
          @page { margin: 18mm 16mm; }
        }
      `}</style>

      {/* Barra de ações */}
      <div className="no-print bg-surface-card border-b border-surface-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push(`/convenios/${id}`)}>{""}</Button>
          <span className="text-body font-medium text-text-title">Dossiê do Processo</span>
        </div>
        <Button icon={Printer} onClick={() => window.print()}>Imprimir / Salvar PDF</Button>
      </div>

      <div className="max-w-4xl mx-auto p-6 lg:p-10">
        {loading ? (
          <Skeleton variant="card" className="h-64" />
        ) : !dossie || !p ? (
          <p className="text-body-sm text-text-body">Não foi possível carregar o dossiê.</p>
        ) : (
          <div className="print-page bg-surface-card border border-surface-border rounded-card p-8 lg:p-12">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between border-b-2 border-[#1D4ED8] pb-6">
              <div>
                <h1 className="text-2xl font-bold text-text-title">{p.titulo}</h1>
                <p className="text-body-sm text-text-body mt-1">
                  {label(p.categoria)}{p.esfera ? ` · ${label(p.esfera)}` : ""} · {label(p.status)}
                </p>
                {p.numero_protocolo_governo && <p className="text-meta text-text-subtle mt-0.5 font-mono">Protocolo: {p.numero_protocolo_governo}</p>}
              </div>
              <div className="text-right text-meta text-text-subtle">
                <p>Gerado em {formatDate(dossie.gerado_em)}</p>
                <p>por {dossie.gerado_por.name}</p>
              </div>
            </div>

            {/* Identificação */}
            <section className="mt-6">
              <h2 className="text-h3 text-text-title mb-2">Identificação</h2>
              <table className="w-full text-body-sm print-table">
                <tbody>
                  {[
                    ["Tipo", label(p.tipo)],
                    ["Categoria", label(p.categoria)],
                    ["Situação", label(p.situacao)],
                    ["Esfera", label(p.esfera)],
                    ["Parlamentar", p.parlamentar],
                    ["Órgão Concedente", p.orgao_concedente],
                    ["Programa", p.programa],
                    ["Convênio", p.numero_convenio],
                    ["Emenda", p.numero_emenda],
                    ["Proposta", p.numero_proposta],
                  ].map(([k, v]) => (
                    <tr key={String(k)} className="border-b border-surface-border">
                      <td className="py-1.5 pr-4 font-medium text-text-subtle align-top">{k}</td>
                      <td className="py-1.5 text-text-title">{v || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Valores */}
            <section className="mt-6">
              <h2 className="text-h3 text-text-title mb-2">Valores</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Valor aprovado", brl(p.valor_aprovado)],
                  ["Valor recebido", brl(p.valor_recebido)],
                  ["Empenhado", brl(p.empenhado)],
                  ["Pago", brl(p.pago)],
                  ["Saldo", brl(p.saldo)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-[#F6F7F9] rounded-btn p-3">
                    <p className="text-meta text-text-subtle">{k}</p>
                    <p className="text-body font-semibold text-text-title tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              <p className="text-meta text-text-subtle mt-2">Vigência: {p.vigencia_inicio ? formatDate(p.vigencia_inicio) : "—"} a {p.vigencia_fim ? formatDate(p.vigencia_fim) : "—"} · Criado em {formatDate(p.created_at)}</p>
            </section>

            {/* Etapas */}
            {dossie.etapas.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Etapas</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">Etapa</th><th className="py-1 pr-3">Natureza</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.etapas.map((e) => (
                      <tr key={e.ordem} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{e.ordem}</td>
                        <td className="py-1.5 pr-3 text-text-title">{e.nome}</td>
                        <td className="py-1.5 pr-3">{label(e.natureza)}</td>
                        <td className="py-1.5">{label(e.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Tarefas */}
            {dossie.tarefas.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Tarefas</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Título</th><th className="py-1 pr-3">Prioridade</th><th className="py-1 pr-3">Prazo</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.tarefas.map((t, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3 text-text-title">{t.titulo}</td>
                        <td className="py-1.5 pr-3">{label(t.prioridade)}</td>
                        <td className="py-1.5 pr-3">{t.prazo ? formatDate(t.prazo) : "—"}</td>
                        <td className="py-1.5">{label(t.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Documentos */}
            {dossie.documentos.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Documentos</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Documento</th><th className="py-1 pr-3">Categoria</th><th className="py-1 pr-3">Versão</th><th className="py-1 pr-3">Externo</th><th className="py-1">Data</th></tr></thead>
                  <tbody>
                    {dossie.documentos.map((d, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3 text-text-title">{d.nome}</td>
                        <td className="py-1.5 pr-3">{d.categoria}</td>
                        <td className="py-1.5 pr-3">v{d.versao}</td>
                        <td className="py-1.5 pr-3">{d.enviado_externo ? "Sim" : "Não"}</td>
                        <td className="py-1.5">{formatDate(d.data)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Repasses */}
            {dossie.repasses.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Repasses</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Parcela</th><th className="py-1 pr-3">Previsto</th><th className="py-1 pr-3">Recebido</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.repasses.map((r) => (
                      <tr key={r.parcela} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{r.parcela}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{brl(r.valor_previsto)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{brl(r.valor_recebido)}</td>
                        <td className="py-1.5">{label(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Medições */}
            {dossie.medicoes.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Medições</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Nº</th><th className="py-1 pr-3">Valor</th><th className="py-1 pr-3">% Acumulado</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.medicoes.map((m) => (
                      <tr key={m.numero} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{m.numero}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{brl(m.valor)}</td>
                        <td className="py-1.5 pr-3">{m.percentual_acumulado ?? 0}%</td>
                        <td className="py-1.5">{label(m.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Movimentos financeiros */}
            {dossie.movimentos.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Movimentos Financeiros</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Tipo</th><th className="py-1 pr-3">Número</th><th className="py-1 pr-3">Data</th><th className="py-1">Valor</th></tr></thead>
                  <tbody>
                    {dossie.movimentos.map((m, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{label(m.tipo)}</td>
                        <td className="py-1.5 pr-3">{m.numero || "—"}</td>
                        <td className="py-1.5 pr-3">{m.data ? formatDate(m.data) : "—"}</td>
                        <td className="py-1.5 tabular-nums">{brl(m.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Contratos */}
            {dossie.contratos.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Contratos</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Número</th><th className="py-1 pr-3">Fornecedor</th><th className="py-1 pr-3">Valor</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.contratos.map((c, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{c.numero || "—"}</td>
                        <td className="py-1.5 pr-3">{c.fornecedor || "—"}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{brl(c.valor)}</td>
                        <td className="py-1.5">{label(c.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Licitações */}
            {dossie.licitacoes.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Licitações</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Número</th><th className="py-1 pr-3">Modalidade</th><th className="py-1 pr-3">Vencedor</th><th className="py-1">Situação</th></tr></thead>
                  <tbody>
                    {dossie.licitacoes.map((l, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{l.numero || "—"}</td>
                        <td className="py-1.5 pr-3">{l.modalidade || "—"}</td>
                        <td className="py-1.5 pr-3">{l.vencedor || "—"}</td>
                        <td className="py-1.5">{label(l.situacao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Prestações */}
            {dossie.prestacoes.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Prestações de Contas</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Título</th><th className="py-1 pr-3">Preparação</th><th className="py-1 pr-3">Protocolo</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.prestacoes.map((pr, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3 text-text-title">{pr.titulo || "Prestação de Contas"}</td>
                        <td className="py-1.5 pr-3">{pr.percentual}%</td>
                        <td className="py-1.5 pr-3">{pr.protocolo || "—"}</td>
                        <td className="py-1.5">{label(pr.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Diligências */}
            {dossie.diligencias.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Diligências</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Descrição</th><th className="py-1 pr-3">Resposta</th><th className="py-1 pr-3">Protocolo</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.diligencias.map((d, i) => (
                      <tr key={i} className="border-b border-surface-border align-top">
                        <td className="py-1.5 pr-3 text-text-title">{d.descricao}</td>
                        <td className="py-1.5 pr-3">{d.resposta || "—"}</td>
                        <td className="py-1.5 pr-3">{d.protocolo || "—"}</td>
                        <td className="py-1.5">{label(d.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Obras */}
            {dossie.obras.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Obras</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Nome</th><th className="py-1 pr-3">Empresa</th><th className="py-1 pr-3">Físico</th><th className="py-1">Situação</th></tr></thead>
                  <tbody>
                    {dossie.obras.map((o, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3 text-text-title">{o.nome || "Obra"}</td>
                        <td className="py-1.5 pr-3">{o.empresa || "—"}</td>
                        <td className="py-1.5 pr-3">{o.percentual_fisico ?? 0}%</td>
                        <td className="py-1.5">{label(o.situacao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Entregas */}
            {dossie.entregas.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Entregas</h2>
                <table className="w-full text-body-sm print-table">
                  <thead><tr className="text-left text-meta text-text-subtle border-b border-surface-border"><th className="py-1 pr-3">Identificação</th><th className="py-1 pr-3">Fornecedor</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {dossie.entregas.map((en, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="py-1.5 pr-3">{en.identificacao || "—"}</td>
                        <td className="py-1.5 pr-3">{en.fornecedor || "—"}</td>
                        <td className="py-1.5">{label(en.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Timeline */}
            {dossie.timeline.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3 text-text-title mb-2">Linha do Tempo</h2>
                <ol className="space-y-1.5">
                  {dossie.timeline.slice().reverse().map((ev, i) => (
                    <li key={i} className="flex items-start gap-2 text-body-sm">
                      <span className="text-meta text-text-subtle font-mono whitespace-nowrap pt-0.5">{formatDate(ev.data)}</span>
                      <span className="text-text-body">{ev.descricao}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Rodapé */}
            <div className="mt-10 pt-4 border-t border-surface-border text-meta text-text-subtle text-center">
              <p>{p.titulo} — Dossiê gerado pelo GovTask para fins de auditoria e consulta histórica.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
