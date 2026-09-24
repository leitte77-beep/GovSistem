"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 h-10 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">print</span>
      Imprimir / salvar em PDF
    </button>
  );
}
