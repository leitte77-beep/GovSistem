"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";

/**
 * Mapa (OpenStreetMap via Leaflet) com um ou mais pontos registrados pelo GPS
 * do celular. O Leaflet é carregado sob demanda do CDN — só quando há ponto
 * para mostrar. Sem coordenadas, não renderiza nada.
 */

export interface PontoMapa {
  lat: number | string | null | undefined;
  lng: number | string | null | undefined;
  rotulo: string;
  /** Cor do marcador (hex). */
  cor?: string;
}

type Leaflet = {
  map: (el: HTMLElement, o?: object) => LMap;
  tileLayer: (url: string, o?: object) => { addTo: (m: LMap) => void };
  circleMarker: (ll: [number, number], o?: object) => { addTo: (m: LMap) => { bindTooltip: (t: string, o?: object) => void } };
  polyline: (lls: [number, number][], o?: object) => { addTo: (m: LMap) => void };
  latLngBounds: (lls: [number, number][]) => unknown;
};
type LMap = { setView: (ll: [number, number], z: number) => void; fitBounds: (b: unknown, o?: object) => void; remove: () => void };

const VERSAO = "1.9.4";
let carregando: Promise<Leaflet> | null = null;

function carregarLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  if (carregando) return carregando;
  carregando = new Promise((ok, falha) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `https://unpkg.com/leaflet@${VERSAO}/dist/leaflet.css`;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = `https://unpkg.com/leaflet@${VERSAO}/dist/leaflet.js`;
    js.async = true;
    js.onload = () => (w.L ? ok(w.L) : falha(new Error("Leaflet indisponível")));
    js.onerror = () => { carregando = null; falha(new Error("Leaflet indisponível")); };
    document.head.appendChild(js);
  });
  return carregando;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? NaN : Number(v));

export default function MapaLocal({ titulo = "Localização", pontos, ligar = false, altura = 260 }: {
  titulo?: string;
  pontos: PontoMapa[];
  /** Liga os pontos com uma linha reta (ex.: saída → chegada). */
  ligar?: boolean;
  altura?: number;
}) {
  const validos = pontos
    .map((p) => ({ ...p, la: num(p.lat), ln: num(p.lng) }))
    .filter((p) => Number.isFinite(p.la) && Number.isFinite(p.ln) && !(p.la === 0 && p.ln === 0));
  const chave = validos.map((p) => `${p.la},${p.ln}`).join("|");
  const el = useRef<HTMLDivElement>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (!validos.length || !el.current) return;
    let mapa: LMap | null = null;
    let cancelado = false;
    carregarLeaflet()
      .then((L) => {
        if (cancelado || !el.current) return;
        mapa = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapa);
        const lls = validos.map((p) => [p.la, p.ln] as [number, number]);
        if (ligar && lls.length > 1) L.polyline(lls, { color: "#1D5BD6", weight: 3, dashArray: "6 6" }).addTo(mapa);
        validos.forEach((p) => {
          L.circleMarker([p.la, p.ln], { radius: 9, color: "#fff", weight: 3, fillColor: p.cor ?? "#1D5BD6", fillOpacity: 1 })
            .addTo(mapa!)
            .bindTooltip(p.rotulo, { direction: "top", offset: [0, -8] });
        });
        if (lls.length === 1) mapa.setView(lls[0], 16);
        else mapa.fitBounds(L.latLngBounds(lls), { padding: [36, 36], maxZoom: 16 });
      })
      .catch(() => !cancelado && setFalhou(true));
    return () => {
      cancelado = true;
      mapa?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ligar]);

  if (!validos.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h3 className="flex items-center gap-2 text-body-sm font-semibold text-text-title"><MapPin size={16} className="text-[#1D5BD6]" /> {titulo}</h3>
        <div className="flex flex-wrap gap-3">
          {validos.map((p) => (
            <a key={`${p.rotulo}-${p.la}`} href={`https://www.google.com/maps?q=${p.la},${p.ln}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-meta font-medium text-[#1D4ED8] hover:underline">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.cor ?? "#1D5BD6" }} />
              {validos.length > 1 ? p.rotulo : "Abrir no Google Maps"} <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </div>
      {falhou ? (
        <div className="space-y-1 border-t border-outline-variant/40 px-4 py-3 text-meta text-text-subtle">
          {validos.map((p) => <p key={p.rotulo}>{p.rotulo}: {p.la.toFixed(6)}, {p.ln.toFixed(6)}</p>)}
        </div>
      ) : (
        <div ref={el} className="relative z-0 w-full border-t border-outline-variant/40" style={{ height: altura }} />
      )}
    </section>
  );
}
