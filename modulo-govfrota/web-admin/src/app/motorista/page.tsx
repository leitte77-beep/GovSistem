"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Fuel, AlertTriangle, LogOut } from "lucide-react";
import { driverApi } from "@/lib/api";

interface AbastecimentoRecente {
  id: string;
  data: string;
  veiculo_id: string;
  litros: number;
  km: number;
}

export default function InicioMotoristaPage() {
  const router = useRouter();
  const [nome, setNome] = useState<string>("");
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [ultimos, setUltimos] = useState<AbastecimentoRecente[]>([]);

  useEffect(() => {
    driverApi
      .me()
      .then((m) => {
        setNome(m.nome.split(" ")[0]);
        setOrgNome(m.organization_name);
      })
      .catch(() => router.replace("/motorista/login"));
    driverApi.meusAbastecimentos().then(setUltimos).catch(() => {});
  }, [router]);

  function sair() {
    driverApi.logout();
    router.replace("/motorista/login");
  }

  return (
    <main className="min-h-screen bg-[#F6F7F9] p-6">
      <div className="mx-auto max-w-md">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-title">Olá, {nome || "…"}</h1>
            <p className="text-sm text-text-subtle">{orgNome || "O que deseja fazer?"}</p>
          </div>
          <button onClick={sair} className="rounded-full p-3 text-text-body hover:bg-white" aria-label="Sair">
            <LogOut size={22} />
          </button>
        </header>

        <div className="space-y-4">
          <Link
            href="/motorista/abastecer"
            className="flex items-center justify-center gap-3 rounded-2xl bg-[#1D4ED8] py-6 text-xl font-semibold text-white shadow-card active:bg-[#1E40AF]"
          >
            <Fuel size={26} /> ABASTECER VEÍCULO
          </Link>

          <Link
            href="/motorista/problema"
            className="flex items-center justify-center gap-3 rounded-2xl border-2 border-surface-border bg-white py-5 text-lg font-medium text-text-title active:bg-surface-bg"
          >
            <AlertTriangle size={22} className="text-[#B54708]" /> INFORMAR PROBLEMA
          </Link>
        </div>

        {ultimos.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-2 text-sm font-medium text-text-subtle">Últimos abastecimentos</h2>
            <ul className="divide-y divide-surface-border overflow-hidden rounded-xl bg-white">
              {ultimos.slice(0, 5).map((a) => (
                <li key={a.id} className="flex justify-between px-4 py-3 text-body-sm">
                  <span className="text-text-subtle">
                    {new Date(a.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <span className="font-medium">{a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
