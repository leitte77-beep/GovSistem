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
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9201/api/v1";
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
    <div className="mx-auto max-w-3xl animate-fade-up space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <p className="eyebrow mb-2">Validação de documento</p>
        <h1 className="text-display text-primary">Verificar assinatura</h1>
        <p className="mt-1.5 text-body-md text-on-surface-variant">
          Envie um PDF assinado para validar a assinatura digital e a conformidade ICP-Brasil.
        </p>
      </header>

      <div className="card space-y-5 p-6">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-outline-variant p-8 text-center transition-colors hover:border-primary/40 hover:bg-surface-container-low"
        >
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
          />
          {pdfFile ? (
            <span className="flex items-center justify-center gap-2 text-body-sm">
              <CheckCircle2 size={20} className="text-secondary" aria-hidden="true" />
              <span className="font-medium text-on-surface">{pdfFile.name}</span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2">
              <Upload size={34} className="text-outline" aria-hidden="true" />
              <span className="text-body-sm font-medium text-on-surface-variant">Clique para selecionar o PDF assinado</span>
            </span>
          )}
        </button>

        <button onClick={handleVerify} disabled={verifying || !pdfFile} className="btn-primary w-full">
          {verifying ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          {verifying ? "Verificando…" : "Verificar assinatura"}
        </button>
      </div>

      {result && (
        <div className={clsx("card space-y-4 p-6", result.valid ? "border-l-4 border-l-secondary" : "border-l-4 border-l-error")}>
          <div className={clsx("flex items-center gap-2 text-headline-sm", result.valid ? "text-secondary" : "text-error")}>
            {result.valid ? <CheckCircle2 size={22} aria-hidden="true" /> : <AlertCircle size={22} aria-hidden="true" />}
            {result.valid ? "Assinatura válida" : "Assinatura inválida"}
          </div>

          {result.signatures?.map((sig: any, i: number) => (
            <dl key={i} className="space-y-2 rounded-lg bg-surface-container-low p-4 text-body-sm">
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Formato</dt><dd className="font-medium text-on-surface">{sig.subfilter}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Motivo</dt><dd className="font-medium text-on-surface">{sig.reason}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Data</dt><dd className="font-medium text-on-surface">{sig.signing_time}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">ICP-Brasil</dt>
                <dd className={clsx("font-medium", sig.format_ok ? "text-secondary" : "text-error")}>
                  {sig.format_ok ? "Conforme" : "Não conforme"}
                </dd>
              </div>
            </dl>
          ))}

          {result.warnings?.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning-container p-3 text-body-sm text-on-warning-container">
              <strong>Avisos</strong>
              <ul className="mt-1 list-disc pl-4">{result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div className="rounded-lg border border-error/30 bg-error-container p-3 text-body-sm text-on-error-container">
              <strong>Erros</strong>
              <ul className="mt-1 list-disc pl-4">{result.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
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
