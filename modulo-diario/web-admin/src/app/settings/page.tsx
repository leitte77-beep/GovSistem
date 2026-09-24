"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import PageHeader from "@/components/PageHeader";

const LAYOUT_DESCRIPTIONS: Record<string, string> = {
  classico: "Layout tradicional com brasão centralizado, faixas cinza e tipografia serifada — ideal para órgãos que seguem o padrão governamental clássico.",
  moderno: "Design limpo com linhas azuis, cantos arredondados e tipografia sans-serif — ideal para quem quer uma apresentação mais contemporânea.",
  minimalista: "Preto e branco com linhas finas, sem decorações — máxima economia de tinta e espaço, ideal para impressoras simples.",
};

const LAYOUT_PREVIEWS: Record<string, { bg: string; accent: string; text: string; label: string }> = {
  classico: { bg: "#f5f3ee", accent: "#002b5c", text: "#001b3f", label: "Clássico" },
  moderno: { bg: "#f0f4ff", accent: "#003d80", text: "#1a1a2e", label: "Moderno" },
  minimalista: { bg: "#ffffff", accent: "#000000", text: "#000000", label: "Minimalista" },
};

const SHORTCUTS: { href: string; icon: string; title: string; description: string }[] = [
  {
    href: "/settings/institution",
    icon: "account_balance",
    title: "Identidade institucional",
    description: "Brasão, endereço, contato e padrão visual",
  },
  {
    href: "/settings/certificates",
    icon: "verified_user",
    title: "Certificados digitais",
    description: "Gerenciar certificados de assinatura",
  },
  {
    href: "/operacoes",
    icon: "settings_suggest",
    title: "Operações",
    description: "Backup, importação e ferramentas",
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [layouts, setLayouts] = useState<{ id: string; name: string; description: string }[]>([]);
  const [currentLayout, setCurrentLayout] = useState("classico");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState("");

  const isAdmin = user?.roles?.some((r) => r.name === "ADMIN") ?? false;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [layoutData, orgData] = await Promise.all([
        api.listPdfLayouts(),
        api.getOrgPdfLayout(),
      ]);
      setLayouts(layoutData.layouts);
      setCurrentLayout(orgData.layout);
    } catch (err: any) {
      console.error("Failed to load layout settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(layout: string) {
    setPreviewKey(layout);
    if (!isAdmin) {
      toast("Apenas administradores podem alterar o layout");
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateOrgPdfLayout(layout);
      setCurrentLayout(result.layout);
      toast.success(result.message);
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar layout");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-gutter py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 rounded bg-surface-container-high" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-surface-container-high" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-gutter py-8 animate-fade-up">
      <PageHeader
        eyebrow="Configurações"
        title="Aparência e preferências"
        description="Personalize a identidade visual do Diário Oficial da sua organização."
      />

      {/* Layout do PDF */}
      <section className="card p-6">
        <div className="border-b border-outline-variant pb-4">
          <p className="eyebrow">Documento publicado</p>
          <h2 className="mt-1 text-headline-sm text-on-surface">Layout do PDF</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Escolha o estilo visual do PDF gerado para as edições publicadas.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {layouts.map((layout) => {
            const preview = LAYOUT_PREVIEWS[layout.id] || LAYOUT_PREVIEWS.classico;
            const isActive = currentLayout === layout.id;
            const isPreview = previewKey === layout.id;
            return (
              <button
                key={layout.id}
                onClick={() => handleSelect(layout.id)}
                disabled={saving}
                aria-pressed={isActive}
                className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-200 ${
                  isActive
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-outline-variant hover:border-outline"
                } ${saving ? "cursor-wait opacity-60" : ""} ${
                  isPreview && !isActive ? "border-outline" : ""
                }`}
              >
                {/* Mini pré-visualização */}
                <div
                  className="flex h-32 flex-col items-center justify-center p-3"
                  style={{ backgroundColor: preview.bg }}
                >
                  <div
                    className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border-2 text-[8px] font-bold"
                    style={{ borderColor: preview.accent, color: preview.accent }}
                  >
                    DOE
                  </div>
                  <div
                    className="mb-1 h-1 w-full rounded"
                    style={{ backgroundColor: preview.accent }}
                  />
                  <div
                    className="mb-0.5 h-0.5 w-3/4 rounded opacity-40"
                    style={{ backgroundColor: preview.accent }}
                  />
                  <div
                    className="mb-0.5 h-0.5 w-2/3 rounded opacity-25"
                    style={{ backgroundColor: preview.accent }}
                  />
                  <div
                    className="h-0.5 w-1/2 rounded opacity-15"
                    style={{ backgroundColor: preview.accent }}
                  />
                </div>

                {/* Informações */}
                <div className="border-t border-outline-variant bg-surface-container-lowest p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-body-md font-semibold ${isActive ? "text-primary" : "text-on-surface"}`}>
                      {layout.name}
                    </span>
                    {isActive && (
                      <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">
                        check_circle
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-body-sm text-on-surface-variant">
                    {layout.description}
                  </p>
                </div>

                {isActive && (
                  <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-label-md text-on-primary">
                    Ativo
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <span className="material-symbols-outlined mt-0.5 text-primary" aria-hidden="true">info</span>
          <div>
            <p className="text-body-sm font-semibold text-on-surface">Sobre o layout selecionado</p>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              {LAYOUT_DESCRIPTIONS[currentLayout] || LAYOUT_DESCRIPTIONS.classico}
            </p>
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-warning-container bg-warning-container/60 p-3 text-body-sm text-on-warning-container">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">lock</span>
            Apenas usuários com o papel de <strong>Administrador</strong> podem alterar o layout do PDF.
          </div>
        )}
      </section>

      {/* Outras configurações */}
      <section className="card p-6">
        <div className="border-b border-outline-variant pb-4">
          <p className="eyebrow">Atalhos</p>
          <h2 className="mt-1 text-headline-sm text-on-surface">Mais configurações</h2>
        </div>
        <ul className="divide-y divide-outline-variant">
          {SHORTCUTS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="group flex items-center gap-4 py-4 transition-colors hover:bg-surface-container-low focus-visible:bg-surface-container-low"
              >
                <span className="material-symbols-outlined text-2xl text-primary" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-md font-semibold text-on-surface">{item.title}</span>
                  <span className="mt-0.5 block text-body-sm text-on-surface-variant">{item.description}</span>
                </span>
                <span
                  className="material-symbols-outlined text-lg text-outline transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
