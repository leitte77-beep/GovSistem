"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, Shield, CheckCircle2, AlertCircle, FileSignature, Search } from "lucide-react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import AdminShell from "@/components/AdminShell";

function VerifyContent() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleVerify = async () => {
    if (!pdfFile) { toast.error("Selecione um PDF assinado"); return; }
    setVerifying(true);
    setResult(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = reader.result as string;
          resolve(r.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(pdfFile);
      });

      const token = localStorage.getItem("access_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";
      const fetchRes = await fetch(`${baseUrl}/signing-credentials/verify-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ signed_pdf_base64: base64 }),
      });
      if (!fetchRes.ok) throw new Error("Erro ao verificar");
      const res = await fetchRes.json();
      setResult(res);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao verificar");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 lg:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium mb-2">
            <Search size={16} />
            Validação de Documento
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Verificar Assinatura</h1>
          <p className="text-slate-400 text-sm">Faça upload de um PDF assinado para validar a assinatura digital</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-all"
        >
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
          />
          {pdfFile ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <CheckCircle2 size={20} className="text-emerald-500" />
              <span className="font-medium text-slate-700">{pdfFile.name}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={36} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Clique para selecionar o PDF assinado</p>
            </div>
          )}
        </div>

        <button onClick={handleVerify} disabled={verifying || !pdfFile}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 transition-all shadow-lg"
        >
          {verifying ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          {verifying ? "Verificando..." : "Verificar Assinatura"}
        </button>
      </div>

      {result && (
        <div className={clsx("bg-white rounded-xl border p-6 space-y-4", result.valid ? "border-emerald-200" : "border-red-200")}>
          <div className={clsx("flex items-center gap-2 font-semibold text-lg", result.valid ? "text-emerald-700" : "text-red-700")}>
            {result.valid ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            {result.valid ? "Assinatura Válida" : "Assinatura Inválida"}
          </div>

          {result.signatures?.map((sig: any, i: number) => (
            <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Formato:</span><span className="font-medium">{sig.subfilter}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Motivo:</span><span className="font-medium">{sig.reason}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Data:</span><span className="font-medium">{sig.signing_time}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">ICP-Brasil:</span>
                <span className={clsx("font-medium", sig.format_ok ? "text-emerald-600" : "text-red-600")}>
                  {sig.format_ok ? "Conforme" : "Não conforme"}
                </span>
              </div>
            </div>
          ))}

          {result.warnings?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Avisos:</strong>
              <ul className="list-disc pl-4 mt-1">{result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <strong>Erros:</strong>
              <ul className="list-disc pl-4 mt-1">{result.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <AdminShell>
      <VerifyContent />
    </AdminShell>
  );
}
