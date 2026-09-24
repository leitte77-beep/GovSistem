"use client";

import { X } from "lucide-react";

interface HtmlPreviewProps {
  open: boolean;
  onClose: () => void;
  html: string;
}

export default function HtmlPreview({ open, onClose, html }: HtmlPreviewProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-lg">Preview HTML</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-500 flex justify-between">
          <span>Pré-visualização do HTML renderizado</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(html)}
            className="text-blue-600 hover:underline"
          >
            Copiar HTML
          </button>
        </div>
      </div>
    </div>
  );
}
