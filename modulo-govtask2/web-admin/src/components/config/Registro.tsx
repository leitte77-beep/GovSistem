"use client";

/** Registro das alterações de configuração: quem mudou o quê, e quando. */

import { Building2, History, SlidersHorizontal, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api, type RegistroAuditoria } from "@/lib/api";
import { dataHora } from "@/lib/formato";

const CAMPO: Record<string, string> = {
  perfil: "perfil",
  setor: "setor",
  acesso: "acesso",
  nome: "nome",
  ativo: "situação",
  prazo_dias: "prazo sugerido (dias)",
  responsavel_id: "responsável",
  dias_alerta_parado: "dias para considerar parado",
  resumo_diario: "resumo diário",
  resumo_hora: "hora do resumo",
  resumo_perfis: "quem recebe o resumo",
};
const ICONE = { USUARIO: UserRound, SETOR: Building2, AJUSTES: SlidersHorizontal };

export function Registro() {
  const [itens, setItens] = useState<RegistroAuditoria[] | null>(null);
  useEffect(() => {
    api.auditoria(100).then(setItens).catch((e) => toast.error(e.message));
  }, []);

  if (!itens) return <div className="esqueleto h-40 rounded-card" />;
  if (itens.length === 0) {
    return (
      <div className="cartao flex flex-col items-center gap-2 p-10 text-center">
        <History size={22} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">Nenhuma alteração registrada ainda.</p>
      </div>
    );
  }
  return (
    <ul className="cartao divide-y divide-line">
      {itens.map((r) => {
        const Icone = ICONE[r.alvo_tipo] ?? History;
        const mostrarValor = r.campo !== "responsavel_id";
        return (
          <li key={r.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
              <Icone size={15} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">
                <strong className="font-medium">{r.autor_nome}</strong> alterou {CAMPO[r.campo] ?? r.campo} de{" "}
                <strong className="font-medium">{r.alvo_nome}</strong>
              </p>
              {mostrarValor && (
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-estado-atrasado/10 px-1.5 text-estado-atrasado line-through">{r.antes ?? "vazio"}</span>
                  <span className="text-ink-faint">→</span>
                  <span className="rounded bg-estado-concluido/10 px-1.5 text-estado-concluido">{r.depois ?? "vazio"}</span>
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs text-ink-faint">{dataHora(r.created_at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
