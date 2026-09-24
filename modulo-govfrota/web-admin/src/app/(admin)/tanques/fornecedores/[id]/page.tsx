"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Building2, Mail, MapPin, Phone, Pencil, X } from "lucide-react";
import { api, Fornecedor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequirePermission } from "@/components/RequirePermission";
import { FotoCombustivel } from "@/components/tanque/FotoCombustivel";
import { FornecedorFormDrawer } from "@/components/tanque/FornecedorFormDrawer";
import { ConfirmarModal } from "@/components/tanque/Drawer";
import { categoriaFornecedor, mascaraCpfCnpj } from "@/lib/combustiveis";

interface EntradaHistItem {
  id: string;
  data: string;
  litros: number;
  valor: number | null;
  nota: string | null;
  cancelada: boolean;
}

export default function PaginaFornecedor() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerenciar = hasPermission("fuel.manage");

  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [historico, setHistorico] = useState<EntradaHistItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [inativar, setInativar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const data = await api.getFornecedor(id);
      setFornecedor(data);
      setHistorico(data.historico_entradas ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]);

  if (carregando || !fornecedor) {
    return <div className="space-y-4"><div className="h-40 animate-pulse rounded-card bg-surface-bg" /><div className="h-40 animate-pulse rounded-card bg-surface-bg" /></div>;
  }

  const endereco = [fornecedor.logradouro, fornecedor.numero, fornecedor.complemento, fornecedor.bairro, fornecedor.cidade, fornecedor.uf]
    .filter(Boolean).join(", ");

  const indicadores = [
    { rotulo: "Total de entradas", valor: String(fornecedor.total_entradas ?? 0) },
    { rotulo: "Litros fornecidos", valor: `${(fornecedor.litros_fornecidos ?? 0).toLocaleString("pt-BR")} L` },
    { rotulo: "Valor total", valor: fornecedor.valor_total ? `R$ ${fornecedor.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
    { rotulo: "Última compra", valor: fornecedor.ultima_compra ? new Date(fornecedor.ultima_compra.data + "T12:00").toLocaleDateString("pt-BR") : "—" },
  ];

  return (
    <RequirePermission perms="refueling.view">
      <div className="space-y-5">
        <Link href="/tanques" className="inline-flex items-center gap-1 text-body-sm text-text-subtle hover:text-[#1D4ED8]">
          <ArrowLeft size={16} /> Combustíveis
        </Link>

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 rounded-card border border-surface-border bg-white p-5 shadow-card sm:flex-row sm:items-center">
          <FotoCombustivel
            src={fornecedor.foto_url}
            alt={`Logo ${fornecedor.razao_social}`}
            className="h-20 w-20 flex-shrink-0 rounded-full object-cover"
            rounded="rounded-full"
            fallback={
              <span className="flex h-full w-full items-center justify-center bg-[#EFF6FF] text-h2 font-bold text-[#1D4ED8]">
                {(fornecedor.nome_fantasia || fornecedor.razao_social).charAt(0).toUpperCase()}
              </span>
            }
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h1 text-text-title">{fornecedor.nome_fantasia || fornecedor.razao_social}</h1>
              <span className="rounded-pill bg-[#EFF6FF] px-2.5 py-1 text-meta font-medium text-[#1D4ED8]">{categoriaFornecedor(fornecedor.categoria)}</span>
              <span className={`rounded-pill px-2.5 py-1 text-meta font-medium ${fornecedor.ativo ? "bg-[#9DF6B3] text-[#106D34]" : "bg-surface-bg text-text-subtle"}`}>
                {fornecedor.ativo ? "Ativo" : "Inativo"}
              </span>
            </div>
            {fornecedor.nome_fantasia && <p className="text-body-sm text-text-subtle">{fornecedor.razao_social}</p>}
            <p className="mt-1 text-body-sm text-text-body tabular-nums">{mascaraCpfCnpj(fornecedor.cpf_cnpj)}</p>
          </div>
          {podeGerenciar && (
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setDrawer(true)}><Pencil size={16} /> Editar</button>
              <button className="btn btn-ghost text-[#B42318]" onClick={() => setInativar(true)}><X size={16} /> Inativar</button>
            </div>
          )}
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {indicadores.map((ind) => (
            <div key={ind.rotulo} className="rounded-card border border-surface-border bg-white p-4 shadow-card">
              <div className="text-meta text-text-subtle">{ind.rotulo}</div>
              <div className="mt-1 text-h3 text-text-title tabular-nums">{ind.valor}</div>
            </div>
          ))}
        </div>

        {/* Dados de contato e endereço */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="text-label font-semibold text-text-title">Contato</h2>
            <ul className="mt-3 space-y-2 text-body-sm text-text-body">
              <li className="flex items-center gap-2"><Phone size={15} className="text-text-subtle" /> {fornecedor.telefone || "—"}</li>
              <li className="flex items-center gap-2"><Mail size={15} className="text-text-subtle" /> {fornecedor.email || "—"}</li>
              <li className="flex items-center gap-2"><Building2 size={15} className="text-text-subtle" /> {fornecedor.contato || "—"}</li>
              {fornecedor.site && <li className="flex items-center gap-2"><span className="text-text-subtle">Web</span> {fornecedor.site}</li>}
            </ul>
          </div>
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="text-label font-semibold text-text-title">Endereço</h2>
            <p className="mt-3 flex items-start gap-2 text-body-sm text-text-body">
              <MapPin size={15} className="mt-0.5 flex-shrink-0 text-text-subtle" />
              {endereco ? endereco : (fornecedor.endereco || "Não informado")}
            </p>
            {fornecedor.cep && <p className="mt-2 pl-6 text-meta text-text-subtle tabular-nums">CEP: {fornecedor.cep}</p>}
          </div>
        </div>

        {fornecedor.observacoes && (
          <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
            <h2 className="text-label font-semibold text-text-title">Observações</h2>
            <p className="mt-2 whitespace-pre-line text-body-sm text-text-body">{fornecedor.observacoes}</p>
          </div>
        )}

        {/* Histórico de entradas */}
        <div className="rounded-card border border-surface-border bg-white shadow-card">
          <div className="border-b border-surface-border px-4 py-3">
            <h2 className="text-label font-semibold text-text-title">Histórico de entradas</h2>
          </div>
          <ul className="divide-y divide-surface-border">
            {historico.length === 0 && <li className="px-4 py-6 text-center text-body-sm text-text-subtle">Nenhuma entrada registrada para este fornecedor.</li>}
            {historico.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-body-sm">
                <div>
                  <p className="font-medium text-text-title">
                    {new Date(e.data + "T12:00").toLocaleDateString("pt-BR")} {e.nota && <span className="text-text-subtle">· NF {e.nota}</span>}
                  </p>
                  <p className="text-meta text-text-subtle">{e.litros.toLocaleString("pt-BR")} L</p>
                </div>
                <div className="flex items-center gap-3">
                  {e.valor != null && <span className="font-medium text-text-title tabular-nums">R$ {e.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                  {e.cancelada && <span className="rounded-pill bg-[#FFDAD6] px-2 py-0.5 text-meta font-medium text-[#BA1A1A]">Cancelada</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <FornecedorFormDrawer aberto={drawer} onClose={() => setDrawer(false)} fornecedor={fornecedor} onSalvo={carregar} />
        <ConfirmarModal
          aberto={inativar}
          onClose={() => setInativar(false)}
          titulo="Inativar fornecedor"
          descricao={`Deseja inativar "${fornecedor.razao_social}"? O histórico é preservado.`}
          confirmarLabel="Inativar"
          perigo
          onConfirmar={async () => {
            await api.updateFornecedor(fornecedor.id, { ativo: false });
            toast.success("Fornecedor inativado.");
            carregar();
          }}
        />
      </div>
    </RequirePermission>
  );
}
