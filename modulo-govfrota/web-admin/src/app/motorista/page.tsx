"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fuel, AlertTriangle, LogOut, Droplets } from "lucide-react";
import { driverApi, AbastecimentoRecenteMotorista } from "@/lib/api";

export default function InicioMotoristaPage() {
  const router = useRouter();
  const [nome, setNome] = useState<string>("");
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [ultimos, setUltimos] = useState<AbastecimentoRecenteMotorista[]>([]);

  useEffect(() => {
    let cancelado = false;
    driverApi
      .me()
      .then((m) => {
        if (cancelado) return;
        setNome(m.nome.split(" ")[0]);
        setOrgNome(m.organization_name);
      })
      .catch(() => router.replace("/motorista/login?expirado=1"));
    driverApi
      .meusAbastecimentos()
      .then((lista) => {
        if (!cancelado) setUltimos(lista.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [router]);

  function sair() {
    driverApi.logout();
    router.replace("/motorista/login");
  }

  function dataRecente(iso: string) {
    const d = new Date(iso);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (mesmoDia) return `Hoje • ${hora}`;
    if (d.toDateString() === ontem.toDateString()) return `Ontem • ${hora}`;
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} • ${hora}`;
  }

  return (
    <main
      className="min-h-screen bg-[#F8F9FF] p-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
    >
      <div className="mx-auto max-w-[480px]">
        <header className="mb-8 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#181C22]">Olá, {nome || "…"}</h1>
            <p className="mt-0.5 truncate text-sm text-[#424750]" title={orgNome || undefined}>
              {orgNome || "O que deseja fazer?"}
            </p>
          </div>
          <button
            onClick={sair}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[#424750] hover:bg-white"
            aria-label="Sair"
          >
            <LogOut size={24} />
          </button>
        </header>

        <div className="space-y-4">
          <Link
            href="/motorista/abastecer"
            className="flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-[#1D5BD6] py-6 text-xl font-bold text-white shadow-card active:bg-[#1E40AF]"
          >
            <Fuel size={28} /> ABASTECER VEÍCULO
          </Link>

          <Link
            href="/motorista/problema"
            className="flex min-h-20 items-center justify-center gap-3 rounded-2xl border-2 border-[#C3C6D1] bg-white py-5 text-lg font-medium text-[#181C22] active:bg-[#EFF4FF]"
          >
            <AlertTriangle size={24} className="text-[#805600]" /> INFORMAR PROBLEMA
          </Link>
        </div>

        <section className="mt-10">
          <h2 className="mb-2 text-sm font-medium text-[#737781]">Últimos abastecimentos</h2>
          {ultimos.length === 0 ? (
            <div className="rounded-xl border border-[#C3C6D1]/40 bg-white px-4 py-6 text-center text-sm text-[#737781]">
              Nenhum abastecimento registrado ainda.
            </div>
          ) : (
            <ul className="divide-y divide-[#C3C6D1]/30 overflow-hidden rounded-xl bg-white shadow-card">
              {ultimos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#737781]">{dataRecente(a.data)}</div>
                    <div className="mt-0.5 font-mono text-base font-bold text-[#1D5BD6]">{a.placa || "—"}</div>
                    <div className="truncate text-sm text-[#424750]">
                      {[a.marca, a.modelo].filter(Boolean).join(" ") || "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold text-[#181C22]">
                      {a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L
                    </div>
                    {a.combustivel && <div className="text-xs text-[#737781]">{a.combustivel}</div>}
                    <div className="flex items-center justify-end gap-1 text-xs text-[#737781]">
                      <Droplets size={12} /> {a.km.toLocaleString("pt-BR")} km
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
