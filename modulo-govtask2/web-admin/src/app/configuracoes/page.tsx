"use client";

/**
 * Configurações — a administração do módulo em duas abas.
 *
 * Usuários (lotação) e Setores (cadastro da prefeitura). O fluxo não se
 * configura: é sempre o Assessor que encaminha, e o setor devolve.
 */

import clsx from "clsx";
import { BellRing, Building2, History, Users } from "lucide-react";
import { useState } from "react";

import { Alertas } from "@/components/config/Alertas";
import { Registro } from "@/components/config/Registro";
import { Setores } from "@/components/config/Setores";
import { Usuarios } from "@/components/config/Usuarios";
import { useSessao } from "@/lib/sessao";

type Aba = "usuarios" | "setores" | "alertas" | "registro";

const ABAS: { chave: Aba; rotulo: string; icone: typeof Users }[] = [
  { chave: "usuarios", rotulo: "Pessoas", icone: Users },
  { chave: "setores", rotulo: "Setores", icone: Building2 },
  { chave: "alertas", rotulo: "Alertas", icone: BellRing },
  { chave: "registro", rotulo: "Registro", icone: History },
];

export default function Configuracoes() {
  const { eu } = useSessao();
  const [aba, setAba] = useState<Aba>("usuarios");

  if (eu && !eu.pode_gerir_usuarios) {
    return (
      <p className="cartao p-6 text-sm text-ink-muted">
        Você não tem permissão para administrar o módulo.
      </p>
    );
  }

  return (
    <div className="animate-fade-subir space-y-6">
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          Configurações
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Quem é quem no GovTask, os setores da prefeitura, os alertas e o registro de alterações.
        </p>
      </header>

      <nav className="inline-flex flex-wrap gap-1 rounded-btn border border-line bg-canvas p-1">
        {ABAS.map(({ chave, rotulo, icone: Icone }) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-[7px] px-3.5 py-2 text-sm transition-colors",
              aba === chave
                ? "bg-paper font-medium text-ink shadow-card"
                : "text-ink-muted hover:text-ink"
            )}
          >
            <Icone
              size={16}
              className={aba === chave ? "text-brand" : "text-ink-faint"}
              aria-hidden
            />
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === "usuarios" && <Usuarios />}
      {aba === "setores" && <Setores />}
      {aba === "alertas" && <Alertas />}
      {aba === "registro" && <Registro />}
    </div>
  );
}
