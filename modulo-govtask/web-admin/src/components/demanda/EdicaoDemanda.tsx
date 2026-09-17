"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import type { DemandaV2 } from "@/types/govtask";

/** Campos textuais com edição direta e autosave (§121, §203).
 *
 * O texto extenso não pode se perder por falha de rede nem por esquecimento: a
 * cada pausa de digitação o componente salva só o que mudou, enviando a versão
 * que leu (`versao_esperada`). Se outra pessoa alterou a demanda nesse meio
 * tempo, o servidor responde 409 e a tela recarrega em vez de sobrescrever.
 */

const CAMPOS = ["titulo", "objeto", "descricao", "resumo_executivo"] as const;
type Campo = (typeof CAMPOS)[number];

const ROTULOS: Record<Campo, { label: string; ajuda?: string; linhas: number }> = {
  titulo: { label: "Título", linhas: 1 },
  objeto: { label: "Objeto", ajuda: "O que precisa ser entregue, em uma frase.", linhas: 2 },
  descricao: { label: "Descrição detalhada", linhas: 5 },
  resumo_executivo: {
    label: "Resumo executivo",
    ajuda: "Síntese da situação atual, pronta para relatório.",
    linhas: 3,
  },
};

function extrair(demanda: DemandaV2): Record<Campo, string> {
  return {
    titulo: demanda.titulo ?? "",
    objeto: demanda.objeto ?? "",
    descricao: demanda.descricao ?? "",
    resumo_executivo: demanda.resumo_executivo ?? "",
  };
}

export function EdicaoDemanda({
  demanda,
  podeEditar,
  onAtualizada,
}: {
  demanda: DemandaV2;
  podeEditar: boolean;
  onAtualizada: (demanda: DemandaV2) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<Campo, string>>(() => extrair(demanda));
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo" | "erro">("parado");
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendentes = useRef<Partial<Record<Campo, string>>>({});
  const baseline = useRef<Record<Campo, string>>(extrair(demanda));
  const demandaRef = useRef(demanda);
  demandaRef.current = demanda;

  // A versão muda quando o servidor confirma um salvamento ou quando outra
  // pessoa alterou a demanda. Sem edição local pendente, seguimos o servidor.
  useEffect(() => {
    if (Object.keys(pendentes.current).length === 0) {
      const v = extrair(demandaRef.current);
      baseline.current = v;
      setValores(v);
    }
  }, [demanda.versao, demanda.id]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    // Não descarta texto pendente ao desmontar (§203): dispara o salvamento.
    if (Object.keys(pendentes.current).length > 0) void salvar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agendar = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!podeEditar) return;
    timer.current = setTimeout(() => void salvar(), 1000);
  };

  const alterar = (campo: Campo, valor: string) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    if (valor === baseline.current[campo]) delete pendentes.current[campo];
    else pendentes.current[campo] = valor;
    if (estado === "salvo") setEstado("parado");
    agendar();
  };

  async function salvar() {
    const campos = { ...pendentes.current };
    const chaves = Object.keys(campos) as Campo[];
    if (chaves.length === 0) return;

    const payload: Record<string, unknown> = {};
    for (const chave of chaves) payload[chave] = campos[chave];
    payload.versao_esperada = demandaRef.current.versao;

    setEstado("salvando");
    try {
      const atualizada = await api.atualizarDemandaV2(demandaRef.current.id, payload);
      for (const chave of chaves) {
        if (pendentes.current[chave] === campos[chave]) delete pendentes.current[chave];
      }
      for (const chave of chaves) baseline.current[chave] = campos[chave] ?? "";
      onAtualizada(atualizada);
      setEstado("salvo");
      setSalvoEm(new Date());
      if (Object.keys(pendentes.current).length > 0) agendar();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setEstado("erro");
        notify.error("A demanda mudou enquanto você editava. Recarregando os dados atuais…");
        const fresca = await api.getDemandaV2(demandaRef.current.id).catch(() => null);
        pendentes.current = {};
        if (fresca) {
          const v = extrair(fresca);
          baseline.current = v;
          setValores(v);
          onAtualizada(fresca);
        }
      } else {
        setEstado("erro");
        notify.error(e instanceof Error ? e.message : "Não foi possível salvar a demanda");
      }
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
      >
        <Pencil className="h-3 w-3" />
        {podeEditar ? "Editar dados" : "Ver dados completos"}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">Dados da demanda</h3>
        <div className="flex items-center gap-2 text-xs">
          {estado === "salvando" && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
            </span>
          )}
          {estado === "salvo" && salvoEm && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Check className="h-3 w-3" /> Salvo às{" "}
              {salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {estado === "erro" && <span className="font-semibold text-red-700">Não salvo</span>}
          {podeEditar && (
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={Object.keys(pendentes.current).length === 0 && estado !== "erro"}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 disabled:opacity-40"
            >
              Salvar agora
            </button>
          )}
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="font-semibold text-slate-500 hover:text-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>

      {CAMPOS.map((campo) => (
        <label key={campo} className="block">
          <span className="text-xs font-semibold text-slate-600">{ROTULOS[campo].label}</span>
          {ROTULOS[campo].ajuda && (
            <span className="ml-2 text-xs text-slate-400">{ROTULOS[campo].ajuda}</span>
          )}
          {ROTULOS[campo].linhas === 1 ? (
            <input
              value={valores[campo]}
              readOnly={!podeEditar}
              onChange={(e) => alterar(campo, e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
            />
          ) : (
            <textarea
              value={valores[campo]}
              readOnly={!podeEditar}
              rows={ROTULOS[campo].linhas}
              onChange={(e) => alterar(campo, e.target.value)}
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
            />
          )}
        </label>
      ))}

      {podeEditar && (
        <p className="text-xs text-slate-400">
          O texto é salvo automaticamente enquanto você digita. Se outra pessoa alterar a
          demanda antes de você, o sistema avisa e recarrega.
        </p>
      )}
    </div>
  );
}
