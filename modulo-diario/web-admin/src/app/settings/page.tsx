"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

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
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-surface-container-high rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-surface-container-high rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-md font-bold text-on-surface">Configurações</h1>
        <p className="text-body-md text-on-surface-variant">
          Personalize a aparência do Diário Oficial da sua organização.
        </p>
      </div>

      {/* PDF Layout */}
      <section className="bg-surface rounded-xl border border-outline-variant p-6 space-y-5">
        <div>
          <h2 className="text-headline-sm font-bold text-on-surface">Layout do PDF</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Escolha o estilo visual do PDF gerado para as edições publicadas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {layouts.map((layout) => {
            const preview = LAYOUT_PREVIEWS[layout.id] || LAYOUT_PREVIEWS.classico;
            const isActive = currentLayout === layout.id;
            const isPreview = previewKey === layout.id;
            return (
              <button
                key={layout.id}
                onClick={() => handleSelect(layout.id)}
                disabled={saving}
                className={`relative rounded-xl border-2 p-0 overflow-hidden text-left transition-all duration-200 group ${
                  isActive
                    ? "border-primary ring-2 ring-primary/30 shadow-lg"
                    : "border-outline-variant hover:border-outline hover:shadow-md"
                } ${saving ? "opacity-60 cursor-wait" : ""}`}
              >
                {/* Mini preview */}
                <div
                  className="h-32 flex flex-col items-center justify-center p-3"
                  style={{ backgroundColor: preview.bg }}
                >
                  <div
                    className="w-8 h-8 rounded-full mb-2 border-2 flex items-center justify-center text-[8px] font-bold"
                    style={{ borderColor: preview.accent, color: preview.accent }}
                  >
                    DOE
                  </div>
                  <div
                    className="w-full h-1 rounded mb-1"
                    style={{ backgroundColor: preview.accent }}
                  />
                  <div
                    className="w-3/4 h-0.5 rounded mb-0.5 opacity-40"
                    style={{ backgroundColor: preview.accent }}
                  />
                  <div
                    className="w-2/3 h-0.5 rounded mb-0.5 opacity-25"
                    style={{ backgroundColor: preview.accent }}
                  />
                  <div
                    className="w-1/2 h-0.5 rounded opacity-15"
                    style={{ backgroundColor: preview.accent }}
                  />
                </div>

                {/* Info */}
                <div className="p-3 border-t border-outline-variant bg-surface">
                  <div className="flex items-center justify-between">
                    <span className="text-label-md font-semibold text-on-surface">
                      {layout.name}
                    </span>
                    {isActive && (
                      <span className="material-symbols-outlined text-primary text-lg">
                        check_circle
                      </span>
                    )}
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-1 line-clamp-2">
                    {layout.description}
                  </p>
                </div>

                {/* Active badge */}
                {isActive && (
                  <div className="absolute top-2 right-2 bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Ativo
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Info box */}
        <div className="flex items-start gap-3 p-4 bg-surface-container-low rounded-lg border border-outline-variant">
          <span className="material-symbols-outlined text-primary mt-0.5">info</span>
          <div>
            <p className="text-body-sm text-on-surface font-medium">
              Sobre o layout escolhido
            </p>
            <p className="text-body-sm text-on-surface-variant mt-1">
              {LAYOUT_DESCRIPTIONS[currentLayout] || LAYOUT_DESCRIPTIONS.classico}
            </p>
          </div>
        </div>

        {!isAdmin && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-body-sm">
            <span className="material-symbols-outlined text-lg">lock</span>
            Apenas usuários com papel de <strong>Administrador</strong> podem alterar o layout do PDF.
          </div>
        )}
      </section>

      {/* Other settings placeholder */}
      <section className="bg-surface rounded-xl border border-outline-variant p-6 space-y-4">
        <div>
          <h2 className="text-headline-sm font-bold text-on-surface">Outras Configurações</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Configurações adicionais do sistema.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="/settings/certificates"
            className="flex items-center gap-3 p-4 rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-primary text-2xl">verified_user</span>
            <div>
              <p className="text-label-md font-semibold text-on-surface">Certificados Digitais</p>
              <p className="text-body-sm text-on-surface-variant">Gerenciar certificados de assinatura</p>
            </div>
          </a>
          <a
            href="/operacoes"
            className="flex items-center gap-3 p-4 rounded-lg border border-outline-variant hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-primary text-2xl">settings_suggest</span>
            <div>
              <p className="text-label-md font-semibold text-on-surface">Operações</p>
              <p className="text-body-sm text-on-surface-variant">Backup, importação e ferramentas</p>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
