"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Building2, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Search, X } from "lucide-react";
import { api, Fornecedor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequirePermission } from "@/components/RequirePermission";
import { EmptyState } from "@/components/veiculo/EmptyState";
import { MenuAcoes } from "@/components/veiculo/MenuAcoes";
import { FotoCombustivel } from "@/components/tanque/FotoCombustivel";
import { FornecedorFormDrawer } from "@/components/tanque/FornecedorFormDrawer";
import { ConfirmarModal } from "@/components/tanque/Drawer";
import { categoriaFornecedor, mascaraCpfCnpj } from "@/lib/combustiveis";

/** Recortes do cadastro único de fornecedores (postos, oficinas, distribuidoras). */
type Recorte = "todos" | "postos" | "oficinas" | "combustivel";

const RECORTES: { chave: Recorte; label: string; params: Record<string, unknown> }[] = [
  { chave: "todos", label: "Todos", params: {} },
  { chave: "postos", label: "Postos credenciados", params: { posto_credenciado: true } },
  { chave: "oficinas", label: "Oficinas e serviços", params: { oficina: true } },
  { chave: "combustivel", label: "Combustível", params: { categoria: "COMBUSTIVEL" } },
];

function reais(v: number | undefined): string {
  return v ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

/** Resumo do movimento conforme o que o fornecedor faz para a frota. */
function movimento(f: Fornecedor): string {
  const partes: string[] = [];
  if (f.total_abastecimentos) partes.push(`${f.total_abastecimentos} abast. · ${reais(f.valor_abastecimentos)}`);
  if (f.total_entradas) partes.push(`${f.total_entradas} entrada(s) · ${reais(f.valor_total)}`);
  if (f.total_manutencoes) partes.push(`${f.total_manutencoes} manut. · ${reais(f.valor_manutencoes)}`);
  return partes.join("\n") || "—";
}

export default function FornecedoresPage() {
  const { hasPermission } = useAuth();
  const podeGerenciar = hasPermission("fuel.manage") || hasPermission("maintenance.manage");

  const [recorte, setRecorte] = useState<Recorte>("todos");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(50);
  const [itens, setItens] = useState<Fornecedor[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [drawer, setDrawer] = useState<{ aberto: boolean; item: Fornecedor | null }>({ aberto: false, item: null });
  const [inativar, setInativar] = useState<Fornecedor | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const carregar = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {
        ...RECORTES.find((r) => r.chave === recorte)!.params,
        skip,
        limit,
      };
      if (busca.trim()) params.search = busca.trim();
      if (status) params.ativo = status === "ativo";
      const r = await api.listFornecedores(params);
      setItens(r.itens);
      setTotal(r.total);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [recorte, busca, status, skip, limit]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(carregar, 250);
    return () => clearTimeout(debounce.current);
  }, [carregar]);

  const paginas = Math.max(Math.ceil(total / limit), 1);
  const pagina = Math.floor(skip / limit) + 1;

  return (
    <RequirePermission perms="vehicle.view">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h1 text-text-title">Fornecedores</h1>
            <p className="mt-1 text-body-sm text-text-subtle">
              Cadastro único: postos credenciados, oficinas, autopeças e distribuidoras de combustível.
            </p>
          </div>
          {podeGerenciar && (
            <button className="btn btn-primary" onClick={() => setDrawer({ aberto: true, item: null })}>
              <Plus size={16} /> Novo fornecedor
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1 border-b border-surface-border">
          {RECORTES.map((r) => (
            <button
              key={r.chave}
              onClick={() => { setRecorte(r.chave); setSkip(0); }}
              className={`px-4 py-2 text-body-sm ${recorte === r.chave ? "border-b-2 border-[#1D4ED8] font-medium text-[#1D4ED8]" : "text-text-body hover:text-text-title"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative max-w-xs flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setSkip(0); }}
              placeholder="Buscar por nome, CNPJ ou cidade…"
              className="input pl-9"
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setSkip(0); }} className="input w-auto">
            <option value="">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>

        {carregando ? (
          <div className="h-40 animate-pulse rounded-card bg-surface-bg" />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={<Building2 size={22} />}
            titulo={recorte === "postos" ? "Nenhum posto credenciado" : "Nenhum fornecedor encontrado"}
            descricao={
              recorte === "postos"
                ? "Cadastre o posto vencedor da licitação (categoria Combustível) e marque “Posto credenciado” para os motoristas abastecerem nele pelo app."
                : "Cadastre postos, oficinas e fornecedores para usar nos abastecimentos, entradas e manutenções."
            }
            acao={podeGerenciar ? { label: "Novo fornecedor", onClick: () => setDrawer({ aberto: true, item: null }) } : undefined}
            permissao={podeGerenciar}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-card border border-surface-border bg-white shadow-card">
              <table className="w-full min-w-200 text-body-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg text-left text-meta text-text-subtle">
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Movimento</th>
                    <th className="px-4 py-3">Status</th>
                    {podeGerenciar && <th className="px-4 py-3">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((f) => (
                    <tr key={f.id} className="border-b border-surface-border last:border-0 hover:bg-surface-bg/50">
                      <td className="px-4 py-3">
                        <Link href={`/fornecedores/${f.id}`} className="flex items-center gap-3">
                          <FotoCombustivel
                            src={f.foto_url}
                            alt={`Logo ${f.razao_social}`}
                            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                            rounded="rounded-full"
                            fallback={
                              <span className="flex h-full w-full items-center justify-center bg-[#EFF6FF] text-label font-semibold text-[#1D4ED8]">
                                {(f.nome_fantasia || f.razao_social).charAt(0).toUpperCase()}
                              </span>
                            }
                          />
                          <div>
                            <p className="font-medium text-text-title hover:text-[#1D4ED8]">{f.nome_fantasia || f.razao_social}</p>
                            {f.nome_fantasia && <p className="text-meta text-text-subtle">{f.razao_social}</p>}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{mascaraCpfCnpj(f.cpf_cnpj) || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span className="rounded-pill bg-[#EFF6FF] px-2 py-0.5 text-meta font-medium text-[#1D4ED8]">
                            {categoriaFornecedor(f.categoria)}
                          </span>
                          {f.posto_credenciado && (
                            <span className="rounded-pill bg-[#E7F8EC] px-2 py-0.5 text-meta font-medium text-[#106D34]">Posto credenciado</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-meta text-text-subtle">
                        {f.telefone || "—"}<br />{f.email || ""}
                      </td>
                      <td className="whitespace-pre-line px-4 py-3 text-meta text-text-body tabular-nums">{movimento(f)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${f.ativo ? "bg-[#9DF6B3] text-[#106D34]" : "bg-surface-bg text-text-subtle"}`}>
                          {f.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      {podeGerenciar && (
                        <td className="px-4 py-3">
                          <MenuAcoes
                            acoes={[
                              { key: "ver", label: "Ver fornecedor", icon: <Eye size={16} />, href: `/fornecedores/${f.id}` },
                              { key: "editar", label: "Editar", icon: <Pencil size={16} />, onClick: () => setDrawer({ aberto: true, item: f }) },
                              { key: "inativar", label: f.ativo ? "Inativar" : "Reativar", icon: <X size={16} />, cor: "danger", onClick: () => setInativar(f) },
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-body-sm text-text-subtle">
              <div className="flex items-center gap-2">
                <span className="text-meta">{total} registro(s)</span>
                <select className="input w-auto py-1" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setSkip(0); }}>
                  <option value={20}>20 / página</option>
                  <option value={50}>50 / página</option>
                  <option value={100}>100 / página</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => setSkip(Math.max(skip - limit, 0))} aria-label="Página anterior"><ChevronLeft size={16} /></button>
                <span className="px-2 text-meta">Página {pagina} de {paginas}</span>
                <button className="btn btn-ghost btn-sm" disabled={pagina >= paginas} onClick={() => setSkip(skip + limit)} aria-label="Próxima página"><ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}

        <FornecedorFormDrawer
          aberto={drawer.aberto}
          onClose={() => setDrawer({ aberto: false, item: null })}
          fornecedor={drawer.item}
          onSalvo={carregar}
          categoriaInicial={recorte === "oficinas" ? "MECANICA" : "COMBUSTIVEL"}
          postoInicial={recorte === "postos"}
        />
        <ConfirmarModal
          aberto={!!inativar}
          onClose={() => setInativar(null)}
          titulo={inativar?.ativo ? "Inativar fornecedor" : "Reativar fornecedor"}
          descricao={
            inativar?.ativo
              ? `Deseja inativar "${inativar?.razao_social}"? O histórico é preservado, mas ele não aparece em novos lançamentos.`
              : `Deseja reativar "${inativar?.razao_social}"?`
          }
          confirmarLabel={inativar?.ativo ? "Inativar" : "Reativar"}
          perigo={!!inativar?.ativo}
          onConfirmar={async () => {
            const f = inativar!;
            await api.updateFornecedor(f.id, { ativo: !f.ativo });
            toast.success(f.ativo ? "Fornecedor inativado." : "Fornecedor reativado.");
            carregar();
          }}
        />
      </div>
    </RequirePermission>
  );
}
