"use client";

/**
 * Visões salvas: combinações de filtro com nome. Presets prontos para o
 * comum e visões pessoais no navegador. Não são dado oficial — some se
 * limpar o navegador, e tudo certo.
 */

import { Bookmark, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  PRESETS,
  carregarVisoes,
  salvarVisoes,
  type Filtros,
  type VisaoSalva,
} from "@/lib/visoes";

export function VisoesSalvas({
  filtros,
  aoAplicar,
}: {
  filtros: Filtros;
  aoAplicar: (f: Filtros) => void;
}) {
  const [salvas, setSalvas] = useState<VisaoSalva[]>([]);
  const [selecionada, setSelecionada] = useState("");

  useEffect(() => setSalvas(carregarVisoes()), []);

  function escolher(nome: string) {
    setSelecionada(nome);
    const visao =
      PRESETS.find((p) => p.nome === nome) ?? salvas.find((v) => v.nome === nome);
    if (visao) aoAplicar(visao.filtros);
  }

  function salvarAtual() {
    const nome = window.prompt("Nome da visão (ex.: Emendas federais 2026)");
    if (!nome?.trim()) return;
    const limpo = nome.trim();
    const semDuplicata = salvas.filter((v) => v.nome !== limpo);
    const proximas = [...semDuplicata, { nome: limpo, filtros }];
    salvarVisoes(proximas);
    setSalvas(proximas);
    setSelecionada(limpo);
    toast.success("Visão salva neste navegador.");
  }

  function removerSelecionada() {
    const proximas = salvas.filter((v) => v.nome !== selecionada);
    salvarVisoes(proximas);
    setSalvas(proximas);
    setSelecionada("");
  }

  const ehSalva = salvas.some((v) => v.nome === selecionada);

  return (
    <div className="flex items-center gap-1.5">
      <Bookmark size={15} className="text-ink-faint" aria-hidden />
      <select
        className="campo w-auto"
        value={selecionada}
        onChange={(e) => escolher(e.target.value)}
        aria-label="Visões salvas"
      >
        <option value="">Visão: padrão</option>
        <optgroup label="Atalhos">
          {PRESETS.map((p) => (
            <option key={p.nome} value={p.nome}>
              {p.nome}
            </option>
          ))}
        </optgroup>
        {salvas.length > 0 && (
          <optgroup label="Minhas visões">
            {salvas.map((v) => (
              <option key={v.nome} value={v.nome}>
                {v.nome}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button
        className="botao-fantasma px-2"
        onClick={salvarAtual}
        title="Salvar os filtros atuais"
        aria-label="Salvar visão"
      >
        <Plus size={15} aria-hidden />
      </button>
      {ehSalva && (
        <button
          className="botao-fantasma px-2 text-estado-atrasado hover:bg-estado-atrasado/5"
          onClick={removerSelecionada}
          title="Remover esta visão"
          aria-label="Remover visão"
        >
          <Trash2 size={15} aria-hidden />
        </button>
      )}
    </div>
  );
}
