"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { api, ResultadoBusca } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";

export default function BuscaPage() {
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [procurando, setProcurando] = useState(false);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setResultado(null);
      return;
    }
    setProcurando(true);
    const timer = setTimeout(() => {
      api.busca(termo).then(setResultado).catch(() => setResultado(null)).finally(() => setProcurando(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const total = resultado
    ? resultado.veiculos.length + resultado.motoristas.length + resultado.fornecedores.length + resultado.oficinas.length
    : 0;

  return (
    <RequirePermission perms="vehicle.view">
      <div className="max-w-2xl space-y-4">
        <h1 className="text-h2 text-text-title">Pesquisa global</h1>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-2.5 text-text-subtle" />
          <input
            autoFocus
            placeholder="Buscar por placa, veículo, motorista, fornecedor, oficina, nota…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-btn border border-surface-border bg-white py-2 pl-10 pr-3 text-body-sm"
          />
        </div>

        {procurando && <p className="animate-pulse text-meta text-text-subtle">Procurando…</p>}
        {!procurando && resultado && total === 0 && (
          <p className="text-body-sm text-text-subtle">Nenhum resultado para “{q}”.</p>
        )}

        {resultado && (
          <div className="space-y-4">
            {resultado.veiculos.length > 0 && (
              <section>
                <h2 className="mb-2 text-label font-semibold text-text-title">Veículos ({resultado.veiculos.length})</h2>
                <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
                  {resultado.veiculos.map((v) => (
                    <li key={v.id} className="px-4 py-3">
                      <Link href={`/veiculos/${v.id}`} className="font-medium text-[#1D4ED8] hover:underline">{v.placa}</Link>
                      <span className="text-meta text-text-subtle"> · {[v.modelo].filter(Boolean).join(" ")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {resultado.motoristas.length > 0 && (
              <section>
                <h2 className="mb-2 text-label font-semibold text-text-title">Motoristas ({resultado.motoristas.length})</h2>
                <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
                  {resultado.motoristas.map((m) => (
                    <li key={m.id} className="px-4 py-3">
                      <Link href={`/motoristas/${m.id}`} className="font-medium text-[#1D4ED8] hover:underline">{m.nome}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {resultado.fornecedores.length > 0 && (
              <section>
                <h2 className="mb-2 text-label font-semibold text-text-title">Fornecedores ({resultado.fornecedores.length})</h2>
                <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
                  {resultado.fornecedores.map((f) => (
                    <li key={f.id} className="px-4 py-3 text-body-sm">{f.nome}</li>
                  ))}
                </ul>
              </section>
            )}

            {resultado.oficinas.length > 0 && (
              <section>
                <h2 className="mb-2 text-label font-semibold text-text-title">Oficinas ({resultado.oficinas.length})</h2>
                <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
                  {resultado.oficinas.map((o) => (
                    <li key={o.id} className="px-4 py-3 text-body-sm">{o.nome}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
