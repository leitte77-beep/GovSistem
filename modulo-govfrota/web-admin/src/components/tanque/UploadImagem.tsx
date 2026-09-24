"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, Trash2, Upload } from "lucide-react";

/**
 * Campo de upload de imagem com preview, troca e remoção.
 *
 * Usado por tanque, tipo de combustível e fornecedor. O arquivo selecionado é
 * repassado via `onMudar`; o upload ao storage é feito no submit do drawer pai.
 * `valorInicial` é a URL já existente (ex.: foto_url atual).
 */
export function UploadImagem({
  valorInicial,
  onMudar,
  nomeArquivo,
  alt,
  altura = "h-28",
  largura = "w-36",
}: {
  valorInicial?: string | null;
  onMudar: (file: File | null, previewUrl: string | null) => void;
  nomeArquivo?: string;
  alt: string;
  altura?: string;
  largura?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const img = preview ?? valorInicial ?? null;

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    const url = URL.createObjectURL(file);
    setArquivo(file);
    setPreview(url);
    onMudar(file, url);
  };

  const remover = () => {
    if (preview) URL.revokeObjectURL(preview);
    setArquivo(null);
    setPreview(null);
    onMudar(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      {img ? (
        <div className={`${largura} ${altura} flex-shrink-0 overflow-hidden rounded-btn border border-surface-border bg-surface-bg`}>
          <img src={img} alt={alt} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className={`${largura} ${altura} flex flex-shrink-0 items-center justify-center rounded-btn border border-dashed border-surface-border bg-surface-bg text-text-subtle`}>
          <Camera size={22} />
        </div>
      )}
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={escolher}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> {img ? "Substituir" : "Selecionar imagem"}
        </button>
        {img && (
          <button type="button" className="btn btn-ghost btn-sm text-[#B42318]" onClick={remover}>
            <Trash2 size={14} /> Remover
          </button>
        )}
        {nomeArquivo && arquivo && (
          <p className="text-meta text-text-subtle">{nomeArquivo}: {arquivo.name}</p>
        )}
      </div>
    </div>
  );
}
