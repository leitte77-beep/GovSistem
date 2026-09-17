"use client";

/**
 * Cadastro de autoridades, parlamentares e instituições (§7).
 *
 * É um cadastro de contato: quem procuramos, por qual gabinete, com quem falar.
 * O acompanhamento por autoridade fica na página de detalhe.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import type { Autoridade } from "@/types/govtask";

const TIPOS = [
  "DEPUTADO_FEDERAL", "DEPUTADO_ESTADUAL", "SENADOR", "VEREADOR", "MINISTRO",
  "SECRETARIO_ESTADUAL", "ORGAO", "MINISTERIO", "INSTITUICAO", "EMPRESA", "OUTRO",
];
const ESFERAS = ["MUNICIPAL", "ESTADUAL", "FEDERAL", "PROPRIO", "OUTRO"];

function rotulo(valor: string): string {
  return valor.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export default function AutoridadesPage() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission(PERM.CREATE, PERM.ADMIN);
  const [autoridades, setAutoridades] = useState<Autoridade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    nome: "", tipo: "DEPUTADO_ESTADUAL", cargo: "", instituicao: "",
    partido: "", esfera: "ESTADUAL", telefone: "", email: "",
    assessor_nome: "", assessor_telefone: "",
  });

  const carregar = useCallback(async (termo?: string) => {
    setCarregando(true);
    try {
      setAutoridades(await api.listarAutoridades(termo ? { busca: termo } : undefined));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar as autoridades");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const criar = async () => {
    if (form.nome.trim().length < 2) return notify.error("Informe o nome");
    setSalvando(true);
    try {
      const dados: Record<string, unknown> = { nome: form.nome.trim(), tipo: form.tipo, esfera: form.esfera };
      for (const campo of ["cargo", "instituicao", "partido", "telefone", "email", "assessor_nome", "assessor_telefone"] as const) {
        const valor = form[campo].trim();
        if (valor) dados[campo] = valor;
      }
      await api.criarAutoridade(dados);
      notify.success("Autoridade cadastrada");
      setNovo(false);
      setForm({ nome: "", tipo: "DEPUTADO_ESTADUAL", cargo: "", instituicao: "", partido: "", esfera: "ESTADUAL", telefone: "", email: "", assessor_nome: "", assessor_telefone: "" });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível cadastrar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cadastros"
        title="Autoridades e instituições"
        description="Parlamentares, órgãos e parceiros relacionados às demandas do Município."
        breadcrumbs={[{ label: "Autoridades" }]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); carregar(busca); }}
          className="relative max-w-md flex-1"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, cargo ou instituição…"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-800"
          />
        </form>
        {podeCriar && (
          <button onClick={() => setNovo((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus className="h-4 w-4" />Nova autoridade
          </button>
        )}
      </div>

      {novo && (
        <Card padding="p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
            <label className="text-xs font-semibold text-slate-600">
              Tipo
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800">
                {TIPOS.map((t) => <option key={t} value={t}>{rotulo(t)}</option>)}
              </select>
            </label>
            <Campo label="Cargo" value={form.cargo} onChange={(v) => setForm({ ...form, cargo: v })} />
            <Campo label="Instituição" value={form.instituicao} onChange={(v) => setForm({ ...form, instituicao: v })} />
            <Campo label="Partido" value={form.partido} onChange={(v) => setForm({ ...form, partido: v })} />
            <label className="text-xs font-semibold text-slate-600">
              Esfera
              <select value={form.esfera} onChange={(e) => setForm({ ...form, esfera: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800">
                {ESFERAS.map((t) => <option key={t} value={t}>{rotulo(t)}</option>)}
              </select>
            </label>
            <Campo label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
            <Campo label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Campo label="Assessor" value={form.assessor_nome} onChange={(v) => setForm({ ...form, assessor_nome: v })} />
            <Campo label="Telefone do assessor" value={form.assessor_telefone} onChange={(v) => setForm({ ...form, assessor_telefone: v })} />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button onClick={() => setNovo(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
              <button onClick={criar} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {salvando ? "Salvando…" : "Cadastrar"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {carregando ? (
        <Skeleton variant="card" className="h-48" />
      ) : !autoridades.length ? (
        <Card padding="p-8">
          <EmptyState icon="search" title="Nenhuma autoridade cadastrada" description="Cadastre os parlamentares e órgãos com quem o Município trata." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {autoridades.map((a) => (
            <Link key={a.id} href={`/autoridades/${a.id}`} className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-400">
              <div className="flex items-start gap-3">
                <Landmark className="h-5 w-5 shrink-0 text-blue-700" />
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">{a.nome}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[a.cargo, a.partido].filter(Boolean).join(" · ") || rotulo(a.tipo)}
                  </p>
                  {a.instituicao && <p className="mt-1 truncate text-sm text-slate-600">{a.instituicao}</p>}
                  {a.telefone && <p className="mt-2 text-xs text-slate-500">{a.telefone}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" />
    </label>
  );
}
