"use client";

import { useCallback, useEffect, useState } from "react";
import type { SelectHTMLAttributes } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Archive,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileCode2,
  FileText,
  FileX2,
  Fuel,
  Info,
  MoreVertical,
  Search,
  User,
  Wallet,
  X,
} from "lucide-react";
import { api, FiltroNotasFiscais, Fornecedor, ListaNotasFiscais, NotaFiscalItem, Unidade } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function periodo(k: string): [string, string] {
  const h = new Date();
  if (k === "mes") return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)];
  if (k === "mesPassado") return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))];
  if (k === "7d") return [iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), iso(h)];
  return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)];
}
const ATALHOS = [["7d", "7 dias"], ["mes", "Este mês"], ["mesPassado", "Mês passado"], ["ano", "Este ano"]] as const;
const SITUACOES = [["COM_NOTA", "Com nota"], ["SEM_NOTA", "Sem nota"], ["", "Todos"]] as const;
const LOTE = 100;

const dataHora = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const nomePosto = (f: Fornecedor) => f.nome_fantasia || f.razao_social;
const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDoc = (v?: string | null) => {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v;
};

function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`input appearance-none pr-9 ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
    </div>
  );
}

export default function NotasFiscaisPage() {
  const [[inicio, fim], setPeriodo] = useState<[string, string]>(periodo("mes"));
  const [fornecedor, setFornecedor] = useState("");
  const [unidade, setUnidade] = useState("");
  const [situacao, setSituacao] = useState("COM_NOTA");
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [tipos, setTipos] = useState("NFE_XML,DANFE");
  const [dados, setDados] = useState<ListaNotasFiscais | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [baixandoZip, setBaixandoZip] = useState(false);
  const [postos, setPostos] = useState<Fornecedor[]>([]);
  const [secretarias, setSecretarias] = useState<Unidade[]>([]);

  useEffect(() => {
    api.listFornecedores({ posto_credenciado: true, limit: 200 }).then((r) => setPostos(r.itens)).catch(() => setPostos([]));
    api.listUnidades(true).then(setSecretarias).catch(() => setSecretarias([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const filtro: FiltroNotasFiscais = { inicio, fim, fornecedor_id: fornecedor, unidade_id: unidade, busca: buscaAtiva };

  const carregar = useCallback(async (mais = false) => {
    setCarregando(true);
    try {
      const r = await api.listNotasFiscais({ ...filtro, situacao, skip: mais ? dados?.itens.length ?? 0 : 0, limit: LOTE });
      setDados((d) => (mais && d ? { ...r, itens: [...d.itens, ...r.itens] } : r));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, fornecedor, unidade, situacao, buscaAtiva]);

  useEffect(() => { carregar(); }, [carregar]);

  const baixarZip = async () => {
    setBaixandoZip(true);
    try {
      await api.baixarNotasZip({ ...filtro, tipos });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBaixandoZip(false);
    }
  };

  const baixar = (item: NotaFiscalItem, id: string, ext: string) =>
    api.baixarAnexo({ url: api.urlNotaFiscal(id), nome: `${item.placa}_NF${item.nota?.numero ?? ""}.${ext}` }).catch((e) => toast.error((e as Error).message));

  const r = dados?.resumo;
  const ativo = ATALHOS.find(([k]) => { const [i, f] = periodo(k); return i === inicio && f === fim; })?.[0];
  const pct = r && r.abastecimentos ? Math.round((r.com_nota / r.abastecimentos) * 100) : 0;
  const volumeExibido = dados?.itens.reduce((s, a) => s + a.litros, 0) ?? 0;
  const cnpjPorPosto = new Map(postos.filter((p) => p.cpf_cnpj).map((p) => [nomePosto(p), p.cpf_cnpj!]));

  const contagem = (v: string) => (v === "COM_NOTA" ? r?.com_nota : v === "SEM_NOTA" ? r?.sem_nota : r?.abastecimentos) ?? 0;

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-6">
        {/* Cabeçalho da página */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-h1 text-text-title">Faturamento</h1>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-[#E7F8EC] px-2.5 py-0.5 text-meta font-medium text-[#106D34] ring-1 ring-inset ring-[#106D34]/20">
                <span className="h-1.5 w-1.5 rounded-full bg-[#106D34]" /> Período Aberto
              </span>
            </div>
            <p className="mt-1 text-body-sm text-text-subtle">
              Notas fiscais enviadas pelos postos credenciados para validação de cada abastecimento.
            </p>
          </div>
        </section>

        {/* Cartões de resumo */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
            <div className="flex items-center justify-between">
              <p className="text-meta font-medium uppercase tracking-wider text-text-subtle">Abastecimentos no período</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFF4FF] text-primary">
                <Fuel size={18} />
              </span>
            </div>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-h2 tabular-nums text-text-title">{r?.abastecimentos ?? "—"}</span>
              <span className="text-meta font-medium text-text-subtle">registro(s)</span>
            </p>
            <p className="mt-3 text-meta text-text-subtle">Total auditado em tempo real</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-meta font-medium uppercase tracking-wider text-text-body">
                <span className="flex h-2 w-2 rounded-full bg-[#106D34]" /> Com nota fiscal
              </p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E7F8EC] text-[#106D34]">
                <CheckCircle2 size={18} />
              </span>
            </div>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-h2 tabular-nums text-text-title">{r?.com_nota ?? "—"}</span>
              <span className="inline-flex items-center rounded-md bg-[#E7F8EC] px-2 py-0.5 text-meta font-semibold text-[#106D34] ring-1 ring-inset ring-[#106D34]/20">
                {pct}% de conformidade
              </span>
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-[#EEF0F4]">
              <div className="h-full rounded-pill bg-[#106D34]" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSituacao("SEM_NOTA")}
            className={`rounded-2xl p-5 text-left shadow-card ring-1 transition ${
              r?.sem_nota ? "bg-[#FFFBEF] ring-[#F5D98B]" : "bg-white ring-surface-border hover:ring-[#F5D98B]"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-meta font-medium uppercase tracking-wider text-text-subtle">Sem nota fiscal</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#805600]">
                <FileX2 size={18} />
              </span>
            </div>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-h2 tabular-nums text-text-title">{r?.sem_nota ?? "—"}</span>
              <span className="text-meta text-text-subtle">pendência(s)</span>
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-meta text-text-subtle">
              {r?.sem_nota ? (
                <>Ver postos com pendência</>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-[#106D34]" /> Nenhum posto atrasado
                </>
              )}
            </p>
          </button>

          <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
            <div className="flex items-center justify-between">
              <p className="text-meta font-medium uppercase tracking-wider text-text-subtle">Valor total faturado</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFF4FF] text-primary">
                <Wallet size={18} />
              </span>
            </div>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-body-sm font-semibold text-text-subtle">R$</span>
              <span className="text-h2 tabular-nums text-text-title">{num(r?.valor_filtrado ?? 0)}</span>
            </p>
            <p className="mt-3 text-meta text-text-subtle">Soma das notas no período</p>
          </div>
        </section>

        {/* Filtros e ações */}
        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
          <div className="flex flex-col gap-4 border-b border-surface-border pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex max-w-fit rounded-xl bg-[#F3F4F6] p-1" role="group" aria-label="Presets de período">
              {ATALHOS.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPeriodo(periodo(k))}
                  className={`rounded-lg px-3.5 py-1.5 text-meta transition ${
                    ativo === k ? "bg-primary font-semibold text-white shadow-sm" : "font-medium text-text-subtle hover:bg-white/60 hover:text-text-title"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="De"
                className="input !w-auto !py-1.5 !text-meta"
                value={inicio}
                max={fim}
                onChange={(e) => e.target.value && setPeriodo([e.target.value, fim])}
              />
              <span className="text-meta font-medium text-text-subtle">até</span>
              <input
                type="date"
                aria-label="Até"
                className="input !w-auto !py-1.5 !text-meta"
                value={fim}
                min={inicio}
                onChange={(e) => e.target.value && setPeriodo([inicio, e.target.value])}
              />
              <button
                type="button"
                onClick={() => carregar()}
                title="Aplicar filtros"
                aria-label="Aplicar filtros"
                className="rounded-lg border border-surface-border bg-white p-2 text-text-body transition hover:bg-surface-bg hover:text-text-title"
              >
                <Search size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <Select aria-label="Posto" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                <option value="">Todos os postos</option>
                {postos.map((p) => <option key={p.id} value={p.id}>{nomePosto(p)}</option>)}
              </Select>
            </div>
            <div className="md:col-span-3">
              <Select aria-label="Secretaria" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                <option value="">Todas as secretarias</option>
                {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </Select>
            </div>
            <div className="md:col-span-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
                <input
                  className="input !pl-10 !pr-9"
                  placeholder="Buscar por placa, nº da nota, chave de acesso ou motorista…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                {busca && (
                  <button aria-label="Limpar" onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-title">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" className="inline-flex rounded-xl bg-[#F3F4F6] p-1">
              {SITUACOES.map(([v, l]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={situacao === v}
                  onClick={() => setSituacao(v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-meta transition ${
                    situacao === v ? "bg-white font-semibold text-text-title shadow-sm" : "font-medium text-text-subtle hover:text-text-title"
                  }`}
                >
                  {l}
                  <span className={`rounded-pill px-1.5 text-[10px] font-bold ${situacao === v && v === "COM_NOTA" ? "bg-[#E7F8EC] text-[#106D34]" : "bg-[#E4E7EC] text-text-body"}`}>
                    {contagem(v)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Select
                aria-label="Arquivos do ZIP"
                className="!w-auto !py-2"
                value={tipos}
                onChange={(e) => setTipos(e.target.value)}
              >
                <option value="NFE_XML,DANFE">XML + PDF</option>
                <option value="NFE_XML">Só XML</option>
                <option value="DANFE">Só PDF</option>
              </Select>
              <button
                className="btn btn-primary !rounded-xl !px-4 !py-2 !text-meta"
                onClick={baixarZip}
                disabled={baixandoZip || !r?.com_nota}
              >
                <Archive size={16} />
                {baixandoZip ? "Gerando ZIP…" : `Baixar todas do período (${r?.com_nota ?? 0})`}
              </button>
            </div>
          </div>
        </section>

        {/* Tabela de notas fiscais */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-surface-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-body-sm">
              <thead>
                <tr className="border-b border-surface-border bg-[#F9FAFB] text-meta font-semibold uppercase tracking-wider text-text-subtle">
                  <th className="py-3.5 pl-6 pr-3">Abastecimento</th>
                  <th className="px-3 py-3.5">Posto</th>
                  <th className="px-3 py-3.5">Veículo</th>
                  <th className="px-3 py-3.5">Secretaria / Motorista</th>
                  <th className="px-3 py-3.5 text-right">Litros</th>
                  <th className="px-3 py-3.5 text-right">Valor</th>
                  <th className="px-3 py-3.5 text-center">Nota fiscal</th>
                  <th className="py-3.5 pl-3 pr-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {carregando && !dados && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6">
                      <div className="h-6 animate-pulse rounded bg-[#F3F4F6]" />
                    </td>
                  </tr>
                )}
                {dados?.itens.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-text-subtle">
                      {situacao === "SEM_NOTA" ? "Todos os abastecimentos do período têm nota." : "Nenhuma nota fiscal no período e filtros escolhidos."}
                    </td>
                  </tr>
                )}
                {dados?.itens.map((a) => {
                  const n = a.nota;
                  const divergente = n?.valor != null && a.valor != null && Math.abs(n.valor - a.valor) > 0.05;
                  const doc = a.posto ? cnpjPorPosto.get(a.posto) : null;
                  return (
                    <tr key={a.id} className="group transition-colors hover:bg-[#F9FAFB]">
                      <td className="whitespace-nowrap py-4 pl-6 pr-3">
                        <Link href={`/abastecimentos/${a.id}`} className="font-semibold text-primary hover:underline">
                          {dataHora(a.data)}
                        </Link>
                        <p className="mt-1">
                          <span className="inline-flex items-center rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-body ring-1 ring-inset ring-surface-border">
                            {a.combustivel}
                          </span>
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F4F6] text-text-subtle">
                            <Building2 size={14} />
                          </span>
                          <div>
                            <p className="font-medium text-text-title">{a.posto ?? "—"}</p>
                            {doc && <p className="text-meta text-text-subtle">CNPJ: {fmtDoc(doc)}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center rounded border-[1.5px] border-[#0F172A] bg-[#FEF9C3] px-2 py-0.5 font-mono text-meta font-bold tracking-wider text-[#0F172A]">
                            {a.placa}
                          </span>
                          <span className="text-meta font-medium text-text-subtle">
                            {[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        <p className="font-medium text-text-title">{a.secretaria ?? "—"}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-meta text-text-subtle">
                          <User size={12} className="text-text-subtle" /> {a.motorista ?? "—"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">
                        <span className="font-mono text-body-sm font-semibold tabular-nums text-text-title">{num(a.litros)}</span>
                        <span className="ml-0.5 text-meta text-text-subtle">L</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">
                        <span className="text-meta text-text-subtle">R$</span>
                        <span className="ml-0.5 font-mono text-body-sm font-bold tabular-nums text-text-title">{a.valor == null ? "—" : num(a.valor)}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-center">
                        {n ? (
                          <div title={n.chave ? `Chave ${n.chave}` : undefined} className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1.5 rounded-pill bg-[#F3F4F6] px-2.5 py-1 text-meta font-medium text-text-body ring-1 ring-inset ring-surface-border">
                              {n.numero ? (
                                <>
                                  <FileText size={13} className="text-[#BA1A1A]" /> NF {n.numero}{n.serie ? `/${n.serie}` : ""}
                                </>
                              ) : (
                                <>
                                  <FileText size={13} className="text-[#BA1A1A]" /> Só PDF
                                </>
                              )}
                              {n.avisos.length > 0 && (
                                <span title={n.avisos.join("\n")}><AlertTriangle size={13} className="text-[#B54708]" /></span>
                              )}
                            </span>
                            {n.valor != null && (
                              <span className={`text-[10px] tabular-nums ${divergente ? "font-semibold text-[#BA1A1A]" : "text-text-subtle"}`}>
                                nota {num(n.valor)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="rounded-pill bg-[#FFF4D6] px-2.5 py-1 text-meta font-medium text-[#805600]">Aguardando posto</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-4 pl-3 pr-6">
                        <div className="flex items-center justify-center gap-2">
                          {n?.xml_id && (
                            <button
                              className="rounded-lg border border-surface-border p-2 text-primary transition hover:border-primary/30 hover:bg-[#EFF4FF]"
                              title="Baixar XML"
                              onClick={() => baixar(a, n.xml_id!, "xml")}
                            >
                              <FileCode2 size={16} />
                            </button>
                          )}
                          {n?.pdf_id && (
                            <button
                              className="rounded-lg border border-surface-border p-2 text-[#BA1A1A] transition hover:border-rose-200 hover:bg-[#FFEBEE]"
                              title="Baixar PDF da NF"
                              onClick={() => baixar(a, n.pdf_id!, "pdf")}
                            >
                              <FileText size={16} />
                            </button>
                          )}
                          <Link
                            href={`/abastecimentos/${a.id}`}
                            title="Mais opções"
                            className="rounded-lg p-2 text-text-subtle transition hover:bg-[#F3F4F6] hover:text-text-body"
                          >
                            <MoreVertical size={16} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rodapé de totais */}
          {r && (r.total_filtrado > 0 || dados?.itens.length) && (
            <div className="border-t border-surface-border bg-[#F9FAFB] px-6 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-meta font-semibold text-text-body">{dados?.itens.length ?? 0} exibido(s)</span>
                  <span className="text-meta text-text-subtle">(de {r.total_filtrado} encontrado(s) no período)</span>
                </div>
                <div className="flex items-center gap-6 self-end sm:self-auto">
                  <div className="text-right">
                    <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">Volume exibido:</span>
                    <span className="ml-1.5 font-mono text-body-sm font-bold tabular-nums text-text-title">{num(volumeExibido)} L</span>
                  </div>
                  <div className="border-l border-surface-border pl-6 text-right">
                    <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">Subtotal geral:</span>
                    <span className="ml-1.5 font-mono text-body-sm font-bold tabular-nums text-text-title">R$ {num(r.valor_filtrado)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {dados && r && dados.itens.length < r.total_filtrado && (
          <div className="text-center">
            <button className="btn btn-secondary" disabled={carregando} onClick={() => carregar(true)}>
              Carregar mais ({r.total_filtrado - dados.itens.length} restantes)
            </button>
          </div>
        )}

        {/* Aviso de auditoria */}
        <section className="rounded-2xl border border-[#D6E4FF] bg-[#EFF4FF]/60 p-4">
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-meta leading-relaxed text-text-body">
              <span className="font-semibold text-text-title">Auditoria Automática SEFAZ:</span> todas as notas fiscais recebidas são
              verificadas periodicamente contra o banco de dados oficial da Secretaria da Fazenda Estadual. Notas em formato apenas PDF
              são submetidas a OCR para posterior extração automática do arquivo XML.
            </p>
          </div>
        </section>
      </div>
    </RequirePermission>
  );
}
