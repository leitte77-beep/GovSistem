"use client";
import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Sparkles, CheckCircle2, Wrench } from "lucide-react";
import { moduleVisual } from "@/components/module-card";
import { MODULE_NEWS } from "@/lib/novidades";

export default function NovidadesPage() {
  const { slug } = useParams<{ slug: string }>();
  const key = Array.isArray(slug) ? slug[0] : slug;
  const data = MODULE_NEWS[key];
  const visual = moduleVisual(key);
  const Icon = visual.icon;

  if (!data) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold text-on-surface">Novidades não encontradas</h1>
        <p className="text-sm text-on-surface-variant">Este módulo não possui uma página de novidades cadastrada.</p>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline">
          <ArrowLeft size={15} /> Voltar ao dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary-700">
        <ArrowLeft size={15} /> Voltar ao dashboard
      </Link>

      <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${visual.gradient} p-6 text-white`}>
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
        />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/20 bg-white/10 backdrop-blur-md">
            <Icon size={26} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">{data.version ? "Novidades" : "Novidades"}</h2>
              <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider font-semibold">
                v{data.version}
              </span>
            </div>
            <p className="text-sm text-white/85">Novidades e correções desta versão do módulo.</p>
          </div>
        </div>
      </div>

      <section>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
          <Sparkles size={16} className="text-primary-700" /> Novidades desta versão
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.items.map((n) => (
            <div key={n.title} className="flex gap-3 rounded-xl border bg-surface-container-lowest p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${visual.gradient} text-white`}>
                <Sparkles size={16} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-on-surface">{n.title}</h4>
                <p className="mt-0.5 text-sm leading-relaxed text-on-surface-variant">{n.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
          <Wrench size={16} className="text-green-600" /> Correções e melhorias
        </h3>
        <div className="divide-y divide-gray-100 rounded-xl border bg-surface-container-lowest">
          {data.fixes.map((c, i) => (
            <div key={i} className="flex items-start gap-3 p-4">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600" />
              <p className="text-sm text-on-surface-variant">{c}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
