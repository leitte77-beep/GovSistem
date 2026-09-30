"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { api, Combustivel, ContratoPosto } from "@/lib/api";
import { ConfirmarModal, Drawer, Label } from "@/components/tanque/Drawer";

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function litros(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
}

function dataBr(d: string | null): string | null {
  return d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : null;
}

/** Aceita "6,19", "20.000,50" (pt-BR) ou "6.19". */
function decimal(v: string): string {
  const t = v.trim();
  return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
}

const FORM_VAZIO = {
  combustivel_id: "",
  numero: "",
  preco_litro: "",
  litros_contratados: "",
  data_inicio: "",
  data_fim: "",
  observacoes: "",
  ativo: true,
};

/**
 * Contratos do posto credenciado: o preço por litro cobrado nos abastecimentos
 * (o motorista não informa valor) e o saldo de litros contratados.
 */
export function ContratosPosto({
  fornecedorId,
  podeGerenciar,
  onAlterado,
}: {
  fornecedorId: string;
  podeGerenciar: boolean;
  onAlterado?: () => void;
}) {
  const [contratos, setContratos] = useState<ContratoPosto[]>([]);
  const [combustiveis, setCombustiveis] = useState<Combustivel[]>([]);
  const [editando, setEditando] = useState<ContratoPosto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [excluir, setExcluir] = useState<ContratoPosto | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setContratos(await api.listContratosPosto(fornecedorId));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [fornecedorId]);

  useEffect(() => {
    carregar();
    api.listCombustiveis(true).then(setCombustiveis).catch(() => setCombustiveis([]));
  }, [carregar]);

  const abrir = (c: ContratoPosto | null) => {
    setEditando(c);
    setForm(
      c
        ? {
            combustivel_id: c.combustivel_id,
            numero: c.numero ?? "",
            preco_litro: Number(c.preco_litro).toLocaleString("pt-BR", { maximumFractionDigits: 4 }),
            litros_contratados: Number(c.litros_contratados).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
            data_inicio: c.data_inicio ?? "",
            data_fim: c.data_fim ?? "",
            observacoes: c.observacoes ?? "",
            ativo: c.ativo,
          }
        : FORM_VAZIO
    );
    setAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const dados: Record<string, unknown> = {
      numero: form.numero.trim() || null,
      preco_litro: decimal(form.preco_litro),
      litros_contratados: decimal(form.litros_contratados),
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      observacoes: form.observacoes.trim() || null,
      ativo: form.ativo,
    };
    setSalvando(true);
    try {
      if (editando) {
        await api.updateContratoPosto(fornecedorId, editando.id, dados);
        toast.success("Contrato atualizado.");
      } else {
        await api.createContratoPosto(fornecedorId, { ...dados, combustivel_id: form.combustivel_id });
        toast.success("Contrato cadastrado.");
      }
      setAberto(false);
      await carregar();
      onAlterado?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const campo = (k: "numero" | "preco_litro" | "litros_contratados" | "data_inicio" | "data_fim" | "observacoes") => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "input",
  });

  return (
    <div className="rounded-card border border-surface-border bg-white shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-text-subtle" />
          <h2 className="text-label font-semibold text-text-title">Contratos de combustível</h2>
        </div>
        {podeGerenciar && (
          <button className="btn btn-secondary btn-sm" onClick={() => abrir(null)}>
            <Plus size={16} /> Novo contrato
          </button>
        )}
      </div>

      <ul className="divide-y divide-surface-border">
        {contratos.length === 0 && (
          <li className="px-4 py-6 text-center text-body-sm text-text-subtle">
            Nenhum contrato cadastrado. Sem contrato, os abastecimentos do app ficam sem valor e com alerta para conferência.
          </li>
        )}
        {contratos.map((c) => {
          const contratado = Number(c.litros_contratados);
          const saldo = Number(c.saldo_litros);
          const usado = contratado > 0 ? Math.min(100, (Number(c.litros_consumidos) / contratado) * 100) : 0;
          const vigencia = [dataBr(c.data_inicio), dataBr(c.data_fim)];
          return (
            <li key={c.id} className="space-y-2 px-4 py-3 text-body-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-text-title">
                    {c.combustivel_nome ?? "Combustível"} · {reais(Number(c.preco_litro))}/L
                    {c.numero && <span className="text-text-subtle"> · {c.numero}</span>}
                  </p>
                  <p className="text-meta text-text-subtle">
                    {vigencia[0] || vigencia[1]
                      ? `Vigência: ${vigencia[0] ?? "—"} a ${vigencia[1] ?? "sem prazo"}`
                      : "Sem prazo de vigência"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!c.ativo && (
                    <span className="rounded-pill bg-surface-bg px-2 py-0.5 text-meta font-medium text-text-subtle">Inativo</span>
                  )}
                  {podeGerenciar && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => abrir(c)} aria-label="Editar contrato">
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-[#B42318]"
                        onClick={() => setExcluir(c)}
                        aria-label="Excluir contrato"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-bg" aria-hidden>
                <div
                  className={`h-full rounded-full ${saldo <= 0 ? "bg-[#BA1A1A]" : usado >= 80 ? "bg-[#B25E09]" : "bg-[#1D4ED8]"}`}
                  style={{ width: `${usado}%` }}
                />
              </div>
              <p className="flex flex-wrap justify-between gap-2 text-meta tabular-nums">
                <span className="text-text-subtle">
                  Usado {litros(Number(c.litros_consumidos))} de {litros(contratado)}
                </span>
                <span className={saldo <= 0 ? "font-medium text-[#BA1A1A]" : "font-medium text-text-title"}>
                  Saldo: {litros(saldo)} · {reais(Number(c.saldo_valor))}
                </span>
              </p>
            </li>
          );
        })}
      </ul>

      <Drawer
        aberto={aberto}
        onClose={() => setAberto(false)}
        titulo={editando ? "Editar contrato" : "Novo contrato"}
        largura="max-w-lg"
        rodape={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" form="form-contrato-posto" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar contrato"}
            </button>
          </>
        }
      >
        <form id="form-contrato-posto" onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
          <Label texto="Combustível" classe="sm:col-span-2">
            <select
              required
              className="input"
              value={form.combustivel_id}
              disabled={!!editando}
              onChange={(e) => setForm((f) => ({ ...f, combustivel_id: e.target.value }))}
            >
              <option value="">Selecione…</option>
              {combustiveis.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Label>
          <Label texto="Preço por litro (R$)">
            <input required inputMode="decimal" placeholder="Ex.: 6,19" {...campo("preco_litro")} />
          </Label>
          <Label texto="Litros contratados">
            <input required inputMode="decimal" placeholder="Ex.: 20000" {...campo("litros_contratados")} />
          </Label>
          <Label texto="Nº do contrato / ata" classe="sm:col-span-2">
            <input placeholder="Opcional — ex.: Ata 12/2026" maxLength={50} {...campo("numero")} />
          </Label>
          <Label texto="Início da vigência">
            <input type="date" {...campo("data_inicio")} />
          </Label>
          <Label texto="Fim da vigência">
            <input type="date" {...campo("data_fim")} />
          </Label>
          <Label texto="Observações" classe="sm:col-span-2">
            <textarea rows={3} {...campo("observacoes")} />
          </Label>
          <label className="flex items-center gap-2 text-body-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
            />
            Contrato ativo (usado para o preço dos abastecimentos)
          </label>
        </form>
      </Drawer>

      <ConfirmarModal
        aberto={!!excluir}
        onClose={() => setExcluir(null)}
        titulo="Excluir contrato"
        descricao="Os abastecimentos já registrados mantêm o preço; novos lançamentos deixam de usar este contrato."
        confirmarLabel="Excluir"
        perigo
        onConfirmar={async () => {
          if (!excluir) return;
          await api.excluirContratoPosto(fornecedorId, excluir.id);
          toast.success("Contrato excluído.");
          setExcluir(null);
          await carregar();
          onAlterado?.();
        }}
      />
    </div>
  );
}
