"use client";

import { useState, useRef } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

type Step = "upload" | "validate" | "confirm" | "done";

interface ImportFile {
  name: string;
  size: number;
}

export default function LegacyImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const newFiles = Array.from(selected).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    setRawFiles((prev) => [...prev, ...newFiles]);
    setFiles((prev) => [...prev, ...newFiles.map(f => ({ name: f.name, size: f.size }))]);
  };

  const removeFile = (idx: number) => {
    setRawFiles((prev) => prev.filter((_, i) => i !== idx));
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const runValidate = async () => {
    if (rawFiles.length === 0) { toast.error("Selecione pelo menos um PDF"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      rawFiles.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/v1/legacy/validate", { method: "POST", body: fd,
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      const data = await res.json();
      setResult(data);
      if (data.errors.length === 0) setStep("confirm");
      else setStep("validate");
    } catch { toast.error("Erro ao validar"); }
    finally { setLoading(false); }
  };

  const runImport = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      rawFiles.forEach((f) => fd.append("files", f));
      if (description) fd.append("description", description);
      const res = await fetch("/api/v1/legacy/import", { method: "POST", body: fd,
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      });
      const data = await res.json();
      setResult(data);
      setStep("done");
      toast.success(`${data.success} edições importadas`);
    } catch { toast.error("Erro ao importar"); }
    finally { setLoading(false); }
  };

  const reset = () => { setStep("upload"); setFiles([]); setRawFiles([]); setResult(null); setDescription(""); };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Importar Acervo Legado</h1>
      <p className="text-sm text-gray-500 mb-6">Importe edições antigas em lote via PDF</p>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        {["upload", "validate", "confirm", "done"].map((s, i) => (
          <div key={s} className={`flex items-center gap-2 ${i > 0 ? "ml-2" : ""}`}>
            {i > 0 && <div className="w-6 h-px bg-gray-300" />}
            <span className={`px-3 py-1 rounded-full ${step === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>
              {i + 1}. {s === "upload" ? "Upload" : s === "validate" ? "Validar" : s === "confirm" ? "Confirmar" : "Concluído"}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 cursor-pointer"
            onClick={() => inputRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500">Arraste PDFs ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">Nomenclatura: AAAA-MM-DD__EDICAO.pdf</p>
            <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />
          </div>

          {files.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">{files.length} arquivo(s):</p>
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm">
                  <span className="flex items-center gap-2"><FileText size={14} /> {f.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-red-500 text-xs">Remover</button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ex: Acervo 2023" />
          </div>

          <button type="button" onClick={runValidate} disabled={loading || files.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Validar Arquivos
          </button>
        </div>
      )}

      {/* Step 2: Validate */}
      {step === "validate" && result && (
        <div className="space-y-4">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
            <AlertTriangle size={18} className="text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Erros encontrados</p>
              <ul className="text-sm text-yellow-700 mt-1 list-disc pl-4">
                {result.errors.map((e: any, i: number) => (
                  <li key={i}><strong>{e.file}:</strong> {e.error}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("upload")} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-1.5">
              <ArrowLeft size={16} /> Voltar
            </button>
            {result.success > 0 && (
              <button type="button" onClick={() => setStep("confirm")} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Importar {result.success} válidos mesmo assim
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="font-medium text-blue-800">Pronto para importar</p>
            <p className="text-sm text-blue-700 mt-1">{files.length} arquivo(s) serão importados como acervo legado.</p>
            <p className="text-xs text-blue-600 mt-1">Edições serão criadas com status PUBLISHED e código de verificação.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("upload")} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
            <button type="button" onClick={runImport} disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Confirmar e Importar
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && result && (
        <div className="space-y-4">
          {result.errors.length === 0 ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
              <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">Importação concluída</p>
                <p className="text-sm text-green-700">{result.success} edições criadas</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="font-medium text-yellow-800">{result.success} importadas, {result.errors.length} com erro</p>
              <ul className="text-sm mt-1 list-disc pl-4">
                {result.errors.map((e: any, i: number) => (
                  <li key={i}><strong>{e.file}:</strong> {e.error}</li>
                ))}
              </ul>
            </div>
          )}

          {result.editions_created?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700">Edições criadas:</p>
              <ul className="text-sm text-gray-600 mt-1 space-y-0.5">
                {result.editions_created.map((e: string) => <li key={e}>• {e}</li>)}
              </ul>
            </div>
          )}

          <button type="button" onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Importar mais
          </button>
        </div>
      )}
    </div>
  );
}
