"use client";

import { X, FileText } from "lucide-react";
import type { Edition } from "@/types/edition";

interface EditionPreviewProps {
  open: boolean;
  onClose: () => void;
  edition: Edition;
}

export default function EditionPreview({ open, onClose, edition }: EditionPreviewProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <FileText size={18} />
            Pré-visualização - {edition.year}/{edition.number}
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center border-b pb-4">
              <h1 className="text-xl font-bold mb-1">{edition.title}</h1>
              {edition.subtitle && <p className="text-gray-600">{edition.subtitle}</p>}
              <p className="text-sm text-gray-500 mt-2">
                Edição {edition.type === "normal" ? "Normal" : edition.type === "extra" ? "Extra" : "Suplementar"} • {edition.year}/{edition.number} • {new Date(edition.publication_date).toLocaleDateString("pt-BR")}
              </p>
            </div>

            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800">
                  <th className="text-left py-2 px-1 w-10">#</th>
                  <th className="text-left py-2 px-1">Matéria</th>
                  <th className="text-right py-2 px-1">Seção</th>
                </tr>
              </thead>
              <tbody>
                {edition.items.map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-200">
                    <td className="py-2 px-1 text-gray-400 text-sm">{i + 1}</td>
                    <td className="py-2 px-1">{item.matter_title || item.matter_id.slice(0, 8)}</td>
                    <td className="py-2 px-1 text-right text-sm text-gray-500">{item.section_title || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-500 text-right">
          {edition.item_count} matéria(s) • {edition.status}
        </div>
      </div>
    </div>
  );
}
