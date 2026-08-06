import { useState } from "react";
import { AlertTriangle, MapPin } from "lucide-react";
import { Chip } from "@/ui/Chip";
import type { MapItem } from "@/tipos/dashboard";
import { projetarMapa } from "./graficos";

/**
 * Mapa territorial em SVG (§4.9) — sem dependência de mapas (MapLibre evitado
 * pelo orçamento de bundle; ver README). Camada padrão = calor agregado por
 * território (bolhas proporcionais). A camada de "pinos identificados" só é
 * oferecida a quem tem `vigilancia.pinos`; ativá-la mostra AVISO DE AUDITORIA.
 * O dado acessível é a tabela abaixo do mapa (o SVG é decoração).
 */
const LARGURA = 320;
const ALTURA = 220;

export function MapaTerritorial({
  itens,
  podePinos,
}: {
  itens: MapItem[];
  podePinos: boolean;
}) {
  const [pinos, setPinos] = useState(false);
  const pontos = projetarMapa(itens, LARGURA, ALTURA);
  const maxFam = Math.max(...itens.map((i) => i.total_familias), 1);

  return (
    <section
      aria-labelledby="titulo-mapa"
      className="rounded-cartao border border-ink-soft/15 bg-surface p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-mapa" className="text-base">
          Distribuição territorial
        </h2>
        {podePinos && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={pinos}
              onChange={(e) => setPinos(e.target.checked)}
              className="h-4 w-4 accent-[var(--ga-primary)] focus-visible:outline-focus"
            />
            Mostrar pinos identificados
          </label>
        )}
      </div>

      {pinos && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-input border border-sensitive/30 bg-sensitive/10 p-3 text-sm text-ink"
        >
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sensitive" />
          <span>
            A camada de pinos exibe localizações identificadas. Sua visualização
            será registrada em auditoria.
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
        <div
          role="img"
          aria-label={`Mapa de calor por território. ${itens
            .map((i) => `${i.territorio}: ${i.total_familias} famílias`)
            .join("; ")}.`}
        >
          <svg
            viewBox={`0 0 ${LARGURA} ${ALTURA}`}
            className="h-56 w-full max-w-sm rounded-input bg-primary-soft/40"
            aria-hidden="true"
          >
            {pontos.map((p) => (
              <circle
                key={p.item.territorio}
                cx={p.x}
                cy={p.y}
                r={p.raio}
                fill="var(--ga-primary)"
                fillOpacity={0.18 + 0.5 * (p.item.total_familias / maxFam)}
                stroke="var(--ga-primary)"
                strokeOpacity={0.5}
              />
            ))}
            {pinos &&
              pontos.map((p) => (
                <g key={`pino-${p.item.territorio}`}>
                  <circle cx={p.x} cy={p.y} r={3} fill="var(--ga-sensitive)" />
                </g>
              ))}
          </svg>
        </div>

        {/* Tabela acessível — a verdadeira fonte de dados do mapa. */}
        <table className="w-full border-collapse text-sm">
          <caption className="apenas-leitor">Famílias por território</caption>
          <thead>
            <tr className="border-b border-ink-soft/20 text-left text-ink-soft">
              <th scope="col" className="py-1 pr-4 font-semibold">
                Território
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Famílias
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.territorio} className="border-b border-ink-soft/10">
                <td className="py-1.5 pr-4">
                  <span className="flex items-center gap-1.5">
                    <MapPin aria-hidden className="h-3.5 w-3.5 text-ink-soft" />
                    {i.territorio}
                  </span>
                </td>
                <td className="py-1.5 text-right fonte-mono font-semibold text-ink">
                  {i.total_familias}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-soft">
        <Chip cor="primario">Calor</Chip> mostra a concentração agregada por
        território. {podePinos ? "" : "Pinos identificados exigem perfil autorizado."}
      </p>
    </section>
  );
}
