"use client";

import { useEffect, useRef } from "react";

export interface Localizacao {
  latitude: number;
  longitude: number;
}

/**
 * Acompanha a posição do celular enquanto a tela está aberta (GPS funciona sem
 * internet). Na hora de enviar, `atual()` devolve a última leitura — ou null
 * se o motorista negou a permissão ou o GPS ainda não respondeu: a
 * localização é complemento, nunca impede o registro.
 */
export function useLocalizacao(): () => Localizacao | null {
  const ultima = useRef<Localizacao | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        ultima.current = {
          latitude: Number(p.coords.latitude.toFixed(6)),
          longitude: Number(p.coords.longitude.toFixed(6)),
        };
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return () => ultima.current;
}
