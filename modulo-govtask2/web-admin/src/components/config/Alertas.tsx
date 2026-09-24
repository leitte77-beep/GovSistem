"use client";

/**
 * Alertas da prefeitura: a partir de quantos dias um pedido parado fica
 * vermelho no painel, e se o Prefeito recebe o resumo diário no sino.
 */

import { BellRing, Hourglass } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api, type Ajustes } from "@/lib/api";

export function Alertas() {
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [dias, setDias] = useState(15);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .ajustes()
      .then((a) => {
        setAjustes(a);
        setDias(a.dias_alerta_parado);
      })
      .catch((e) => toast.error(e.message));
  }, []);

  async function salvar(dados: Partial<Ajustes>) {
    setSalvando(true);
    try {
      const a = await api.salvarAjustes(dados);
      setAjustes(a);
      setDias(a.dias_alerta_parado);
      toast.success("Ajuste salvo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!ajustes) return <div className="esqueleto h-48 rounded-card" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="cartao p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-estado-atrasado/10 text-estado-atrasado">
            <Hourglass size={19} aria-hidden />
          </span>
          <div>
            <h2 className="font-medium text-ink">Quando um pedido está parado</h2>
            <p className="text-sm text-ink-muted">
              A partir deste número de dias no mesmo lugar, o pedido fica vermelho no painel do
              Prefeito e entra na lista de parados.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            type="range"
            min={3}
            max={60}
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="flex-1 accent-[rgb(var(--c-brand))]"
            aria-label="Dias para considerar parado"
          />
          <span className="w-20 text-right font-display text-2xl tabular-nums text-ink">
            {dias}
            <span className="ml-1 font-sans text-sm text-ink-muted">dias</span>
          </span>
        </div>
        <button
          className="botao-primario mt-4"
          disabled={salvando || dias === ajustes.dias_alerta_parado}
          onClick={() => salvar({ dias_alerta_parado: dias })}
        >
          Salvar
        </button>
      </section>

      <section className="cartao p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand">
            <BellRing size={19} aria-hidden />
          </span>
          <div>
            <h2 className="font-medium text-ink">Resumo diário do Prefeito</h2>
            <p className="text-sm text-ink-muted">
              Todo dia, a partir das 7h, o Prefeito recebe no sino quanto está andando, quantos
              estão parados e qual está parado há mais tempo.
            </p>
          </div>
        </div>
        <label className="mt-5 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-line text-brand focus:ring-brand"
            checked={ajustes.resumo_diario}
            disabled={salvando}
            onChange={(e) => salvar({ resumo_diario: e.target.checked })}
          />
          <span className="text-sm text-ink-soft">Enviar o resumo diário</span>
        </label>
        {ajustes.resumo_diario && (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              A partir das
              <select
                className="campo h-8 w-24"
                value={ajustes.resumo_hora}
                disabled={salvando}
                onChange={(e) => salvar({ resumo_hora: Number(e.target.value) })}
              >
                {Array.from({ length: 17 }, (_, i) => i + 5).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              (horário de Brasília)
            </label>
            <div>
              <p className="mb-1.5 text-sm text-ink-soft">Quem recebe</p>
              <div className="flex flex-wrap gap-2">
                {(["PREFEITO", "ASSESSOR", "DEPARTAMENTO", "CONSULTA"] as const).map((perfil) => {
                  const marcado = ajustes.resumo_perfis.includes(perfil);
                  return (
                    <label
                      key={perfil}
                      className={
                        marcado
                          ? "flex cursor-pointer items-center gap-1.5 rounded-pill border border-brand bg-brand-50 px-3 py-1 text-xs font-medium text-brand"
                          : "flex cursor-pointer items-center gap-1.5 rounded-pill border border-line px-3 py-1 text-xs text-ink-soft"
                      }
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={marcado}
                        disabled={salvando || (marcado && ajustes.resumo_perfis.length === 1)}
                        onChange={() =>
                          salvar({
                            resumo_perfis: marcado
                              ? ajustes.resumo_perfis.filter((p) => p !== perfil)
                              : [...ajustes.resumo_perfis, perfil],
                          })
                        }
                      />
                      {perfil[0] + perfil.slice(1).toLowerCase()}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
