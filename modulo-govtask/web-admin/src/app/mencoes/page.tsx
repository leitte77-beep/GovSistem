"use client";

/**
 * Onde fui citado (§42).
 *
 * A menção é um fato gravado, não o resultado de varrer texto a cada abertura —
 * por isso esta lista tem índice e marca de leitura própria.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AtSign, Check } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import type { Mencao } from "@/types/govtask";

export default function MencoesPage() {
  const [mencoes, setMencoes] = useState<Mencao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [apenasNaoLidas, setApenasNaoLidas] = useState(true);

  const carregar = useCallback(async (naoLidas: boolean) => {
    setCarregando(true);
    try {
      setMencoes(await api.minhasMencoes(naoLidas));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar as menções");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(apenasNaoLidas); }, [carregar, apenasNaoLidas]);

  const marcarLida = async (mencaoId: string) => {
    try {
      await api.marcarMencaoLida(mencaoId);
      await carregar(apenasNaoLidas);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível marcar como lida");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comunicação"
        title="Onde fui citado"
        description="Comentários em que alguém te mencionou com @."
        breadcrumbs={[{ label: "Menções" }]}
      />

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={apenasNaoLidas}
          onChange={(e) => setApenasNaoLidas(e.target.checked)}
          className="h-4 w-4"
        />
        Mostrar somente as não lidas
      </label>

      {carregando ? (
        <Skeleton variant="card" className="h-48" />
      ) : !mencoes.length ? (
        <Card padding="p-8">
          <EmptyState
            icon="search"
            title={apenasNaoLidas ? "Nenhuma menção pendente" : "Nenhuma menção"}
            description="Você está em dia com as conversas em que foi citado."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {mencoes.map((m) => (
            <li key={m.mencao_id} className={`rounded-xl border bg-white p-5 ${m.lido_em ? "border-slate-200" : "border-blue-300"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <AtSign className="h-3.5 w-3.5 text-blue-700" />
                    {formatDateTime(m.criado_em)}
                    {!m.lido_em && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-700">NOVA</span>}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{m.texto}</p>
                  <Link href={`/demandas/${m.demanda_id}`} className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline">
                    Abrir a demanda
                  </Link>
                </div>
                {!m.lido_em && (
                  <button
                    onClick={() => marcarLida(m.mencao_id)}
                    title="Marcar como lida"
                    className="shrink-0 rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-blue-500 hover:text-blue-700"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
