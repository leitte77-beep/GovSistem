"use client";

/**
 * Preferências de notificação (§41).
 *
 * O canal in-app é sempre gravado — não há como desligá-lo. Aqui o usuário
 * decide se quer *também* receber e-mail e para quais tipos. Os tipos
 * obrigatórios aparecem marcados e travados para não dar a impressão de que
 * foram desativados.
 */

import { useEffect, useState } from "react";
import { Mail, Save } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import type { PreferenciaNotificacao } from "@/types/govtask";

const ROTULOS: Record<string, string> = {
  TAREFA_ATRIBUIDA: "Nova tarefa atribuída a mim",
  TAREFA_ENTREGUE: "Tarefa entregue para revisão",
  TAREFA_DEVOLVIDA: "Tarefa devolvida para correção",
  PRAZO_PROXIMO: "Prazo se aproximando",
  PRAZO_VENCIDO: "Prazo vencido",
  ATRASO_ESCALADO: "Atraso escalado",
  COMENTARIO_MENCAO: "Fui mencionado em um comentário",
  PROTOCOLO_ATUALIZADO: "Protocolo externo atualizado",
  CONTESTACAO_ABERTA: "Contestação de prazo aberta",
  CONTESTACAO_DECIDIDA: "Contestação decidida",
  DILIGENCIA_RECEBIDA: "Diligência recebida",
  DILIGENCIA_RESPONDIDA: "Diligência respondida",
  PRESTACAO_ENVIADA: "Prestação de contas enviada",
  REPASSE_RECEBIDO: "Repasse recebido",
};

export function PreferenciasNotificacao() {
  const [pref, setPref] = useState<PreferenciaNotificacao | null>(null);
  const [emailAtivo, setEmailAtivo] = useState(false);
  const [tipos, setTipos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.preferenciasNotificacao()
      .then((p) => {
        setPref(p);
        setEmailAtivo(p.email_ativo);
        setTipos(p.tipos_email);
      })
      .catch(() => setPref(null));
  }, []);

  const alternarTipo = (tipo: string) =>
    setTipos((atual) => (atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]));

  const salvar = async () => {
    setSalvando(true);
    try {
      const p = await api.atualizarPreferenciasNotificacao({ email_ativo: emailAtivo, tipos_email: tipos });
      setPref(p);
      notify.success("Preferências de notificação salvas");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível salvar as preferências");
    } finally {
      setSalvando(false);
    }
  };

  if (!pref) return null;

  const obrigatorios = new Set(pref.tipos_obrigatorios);

  return (
    <section className="rounded-card border border-surface-border bg-surface-card p-5">
      <header className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-[#2563EB]" />
        <h2 className="text-body font-semibold text-text-title">Canais de notificação</h2>
      </header>

      <p className="mt-1 text-meta text-text-subtle">
        As notificações dentro do sistema são sempre registradas. O e-mail é opcional.
      </p>

      <label className="mt-4 flex items-center gap-3">
        <input
          type="checkbox"
          checked={emailAtivo}
          onChange={(e) => setEmailAtivo(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-body-sm text-text-body">Receber também por e-mail</span>
      </label>

      {emailAtivo && !pref.canal_configurado && (
        <p className="mt-2 rounded-card bg-[#FFFAEB] px-3 py-2 text-meta text-[#B54708]">
          O envio de e-mail ainda não está configurado neste ambiente. Suas preferências ficam salvas
          e passam a valer quando o serviço for configurado.
        </p>
      )}

      {emailAtivo && (
        <fieldset className="mt-4">
          <legend className="text-meta font-medium text-text-subtle">
            Quais avisos devem sair por e-mail
          </legend>
          <p className="text-meta text-text-subtle">
            Sem nenhum marcado, você recebe e-mail de todos os tipos.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {pref.tipos_disponiveis.map((tipo) => {
              const fixo = obrigatorios.has(tipo);
              return (
                <label key={tipo} className="flex items-center gap-2 text-body-sm text-text-body">
                  <input
                    type="checkbox"
                    checked={fixo || tipos.includes(tipo)}
                    disabled={fixo}
                    onChange={() => alternarTipo(tipo)}
                    className="h-4 w-4"
                  />
                  <span className={fixo ? "text-text-subtle" : ""}>
                    {ROTULOS[tipo] ?? tipo}
                    {fixo && " (obrigatório)"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="primary" size="sm" icon={Save} onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar preferências"}
        </Button>
      </div>
    </section>
  );
}
