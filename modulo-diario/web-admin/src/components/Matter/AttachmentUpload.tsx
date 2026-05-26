"use client";

import { useState, useRef } from "react";
import { Upload, X, FileText, Paperclip, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Attachment } from "@/types/matter";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface AttachmentUploadProps {
  matterId: string;
  attachments: Attachment[];
  onAttachmentsChange: () => void;
  disabled?: boolean;
}

export default function AttachmentUpload({
  matterId,
  attachments,
  onAttachmentsChange,
  disabled,
}: AttachmentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`Formato não permitido: ${ext}. Use: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 50MB.`);
      return;
    }
    setUploading(true);
    try {
      await api.uploadAttachment(matterId, file);
      onAttachmentsChange();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Remover anexo?")) return;
    try {
      await api.deleteAttachment(matterId, attachmentId);
      onAttachmentsChange();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <Paperclip size={15} />
        Anexos
        {attachments.length > 0 && (
          <span className="text-xs font-normal text-slate-400">({attachments.length})</span>
        )}
      </label>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-blue-500" />
            <p className="text-sm text-slate-500">Enviando arquivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
              <Upload size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              Arraste um arquivo ou clique para selecionar
            </p>
            <p className="text-xs text-slate-400">
              PDF, DOCX, XLSX, CSV, JPG, PNG
            </p>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-100 group hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={15} className="text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 truncate">{att.title}</span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleDelete(att.id)}
                  className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
