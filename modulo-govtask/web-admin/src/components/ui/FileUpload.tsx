"use client";

import { useState, useRef } from "react";
import { Upload, File, X, AlertCircle, Check, Loader2 } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";

type FileUploadProps = {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  className?: string;
};

type UploadItem = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function FileUpload({
  onUpload,
  accept,
  multiple = false,
  maxSizeMB = 10,
  className,
}: FileUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  const processFile = async (file: File) => {
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      setItems((prev) => [
        { id: String(++idCounter.current), file, status: "error", error: `Excede ${maxSizeMB}MB` },
        ...prev,
      ]);
      return;
    }

    const itemId = String(++idCounter.current);
    setItems((prev) => [{ id: itemId, file, status: "uploading" }, ...prev]);

    try {
      await onUpload(file);
      setItems((prev) => prev.map((p) => (p.id === itemId ? { ...p, status: "done" } : p)));
    } catch (e: any) {
      setItems((prev) => prev.map((p) => (p.id === itemId ? { ...p, status: "error", error: e.message || "Erro no upload" } : p)));
    }
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(processFile);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "border-2 border-dashed rounded-card p-8 text-center cursor-pointer transition-colors",
          isDragging ? "border-[#1D4ED8] bg-[#1D4ED8]/5" : "border-[#E4E7EC] hover:border-[#98A2B3]"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => handleFiles(e.target.files)} />
        <Upload className="w-10 h-10 text-[#98A2B3] mx-auto mb-3" />
        <p className="text-body-sm text-[#475467] mb-1">
          Arraste arquivos ou <span className="text-[#1D4ED8] font-medium">clique para selecionar</span>
        </p>
        <p className="text-meta text-[#98A2B3]">
          {accept ? `Formatos: ${accept}` : "Todos os formatos"} — Máx. {maxSizeMB}MB
        </p>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-3 p-3 rounded-btn border",
            item.status === "error" ? "border-[#B42318] bg-[#FEE4E2]" :
            item.status === "done" ? "border-[#067647] bg-[#067647]/5" :
            "border-[#E4E7EC] bg-white"
          )}
        >
          {item.status === "error" ? <AlertCircle className="w-5 h-5 text-[#B42318] shrink-0" /> :
           item.status === "done" ? <Check className="w-5 h-5 text-[#067647] shrink-0" /> :
           <Loader2 className="w-5 h-5 text-[#1D4ED8] animate-spin shrink-0" />}

          <div className="flex-1 min-w-0">
            <p className="text-body-sm text-[#101828] truncate">{item.file.name}</p>
            <p className="text-meta text-[#98A2B3]">
              {item.error || (item.status === "done" ? "Enviado" : "Enviando...")} — {formatFileSize(item.file.size)}
            </p>
          </div>

          <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} className="text-[#98A2B3] hover:text-[#B42318] transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
