"use client";

/**
 * Financeiro gerencial da demanda (§59, §60, §61).
 *
 * Os totais são derivados dos lançamentos no servidor; a tela não soma nada por
 * conta própria — é o que garante que o card e a lista contem a mesma história.
 * "—" significa "sem lançamento", que é diferente de R$ 0,00.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { FinanceiroDemanda, TipoRegistroFinanceiro } from "@/types/govtask";

const TIPOS: { valor: TipoRegistroFinanceiro; rotulo: string }[] = [
  { valor: "PREVISAO", rotulo: "Previsão" },
  { valor: "APROVACAO", rotulo: "Aprovação" },
  { valor: "CONTRAPARTIDA", rotulo: "Contrapartida" },
  { valor: "LICITADO", rotulo: "Licitado" },
  { valor: "CONTRATADO", rotulo: "Contratado" },
  { valor: "EMPENHO", rotulo: "Empenho" },
  { valor: "LIQUIDACAO", rotulo: "Liquidação" },
  { valor: "PAGAMENTO", rotulo: "Pagamento" },
  { valor: "NOTA_FISCAL", rotulo: "Nota fiscal" },
  { valor: "REPASSE_RECEBIDO", rotulo: "Repasse recebido" },
  { valor: "DEVOLUCAO", rotulo: "Devolução" },
  { valor: "OUTRO", rotulo: "Outro" },
];

function rotuloTipo(tipo: string): string {
  return TIPOS.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

export function FinanceiroDemandaTab({ demandaId, podeLancar }: { demandaId: string; podeLancar: boolean }) {
  const [dados, setDados] = useState<FinanceiroDemanda>();
  const [carregando, setCarregando] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);
  const [novo, setNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    tipo: "PAGAMENTO" as TipoRegistroFinanceiro,
    valor: "", data_registro: "", numero_documento: "", favorecido: "", descricao: "",
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await api.financeiroDemanda(demandaId));
      setSemPermissao(false);
    } catch (e) {
      // 403 aqui não é erro de operação: é a permissão financeira fazendo o
      // que deve. Mostrar um toast vermelho só confundiria o servidor.
      if (e instanceof Error && /permiss/i.test(e.message)) setSemPermissao(true);
      else notify.error(e instanceof Error ? e.message : "Não foi possível carregar o financeiro");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const lancar = async () => {
    if (!form.valor || Number(form.valor) <= 0) return notify.error("Informe um valor maior que zero");
    if (!form.data_registro) return notify.error("Informe a data do lançamento");
    setSalvando(true);
    try {
      await api.lancarFinanceiro(demandaId, {
        tipo: form.tipo,
        valor: form.valor,
        data_registro: form.data_registro,
        numero_documento: form.numero_documento.trim() || undefined,
        favorecido: form.favorecido.trim() || undefined,
        descricao: form.descricao.trim() || undefined,
      });
      notify.success("Lançamento registrado");
      setNovo(false);
      setForm({ tipo: "PAGAMENTO", valor: "", data_registro: "", numero_documento: "", favorecido: "", descricao: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível lançar");
    } finally {
      setSalvando(false);
    }
  };

  const estornar = async (registroId: string) => {
    const motivo = window.prompt("Motivo do estorno (mínimo 5 caracteres):");
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) notify.error("Informe um motivo com ao menos 5 caracteres");
      return;
    }
    try {
      await api.estornarFinanceiro(demandaId, registroId, motivo.trim());
      notify.success("Lançamento estornado");
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível estornar");
    }
  };

  if (semPermissao) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-600">
        Você não tem permissão para ver os valores desta demanda.
      </p>
    );
  }
  if (carregando || !dados) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  const totais: [string, number | null][] = [
    ["Previsto", dados.valor_previsto],
    ["Aprovado", dados.valor_aprovado],
    ["Contrapartida", dados.valor_contrapartida],
    ["Licitado", dados.valor_licitado],
    ["Contratado", dados.valor_contratado],
    ["Empenhado", dados.valor_empenhado],
    ["Liquidado", dados.valor_liquidado],
    ["Pago", dados.valor_pago],
  ];

  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totais.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{rotulo}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{valor == null ? "—" : formatCurrency(valor)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div>
          <p className="text-xs text-blue-800">Saldo (aprovado menos pago)</p>
          <p className="text-2xl font-bold text-blue-900">{formatCurrency(dados.saldo)}</p>
          <p className="mt-1 text-xs text-blue-800">
            {dados.fonte_recurso || "Fonte não informada"}
            {dados.orgao_concedente ? ` · ${dados.orgao_concedente}` : ""}
          </p>
        </div>
        {podeLancar && (
          <button onClick={() => setNovo((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus className="h-4 w-4" />Novo lançamento
          </button>
        )}
      </div>

      {novo && (
        <div className="grid gap-3 rounded-xl border border-blue-200 bg-white p-5 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Tipo
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoRegistroFinanceiro })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800">
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Valor (R$) *
            <input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Data *
            <input type="date" value={form.data_registro} onChange={(e) => setForm({ ...form, data_registro: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Nº do documento
            <input value={form.numero_documento} onChange={(e) => setForm({ ...form, numero_documento: e.target.value })} placeholder="Empenho 1234" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
            Favorecido
            <input value={form.favorecido} onChange={(e) => setForm({ ...form, favorecido: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Este acompanhamento é gerencial e não substitui o sistema contábil.
          </p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button onClick={() => setNovo(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
            <button onClick={lancar} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {salvando ? "Lançando…" : "Lançar"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Data</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Documento</th>
              <th className="px-5 py-3">Favorecido</th>
              <th className="px-5 py-3 text-right">Valor</th>
              {podeLancar && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dados.registros.length ? dados.registros.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-slate-600">{formatDate(r.data_registro)}</td>
                <td className="px-5 py-3 font-semibold text-slate-800">{rotuloTipo(r.tipo)}</td>
                <td className="px-5 py-3 text-slate-600">{r.numero_documento || "—"}</td>
                <td className="px-5 py-3 text-slate-600">{r.favorecido || "—"}</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(Number(r.valor))}</td>
                {podeLancar && (
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => estornar(r.id)} title="Estornar com motivo" className="text-slate-400 hover:text-red-700">
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            )) : (
              <tr><td colSpan={podeLancar ? 6 : 5} className="px-5 py-10 text-center text-slate-500">Nenhum lançamento registrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
