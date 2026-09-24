"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

interface Certificate {
  id: string;
  label: string;
  certificate_subject: string | null;
  valid_until: string | null;
}

export default function SignPdfPage() {
  const router = useRouter();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [selectedCertId, setSelectedCertId] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [visible, setVisible] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signedData, setSignedData] = useState<{ blob: Blob; filename: string; sha256: string; subject: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listSigningCredentials()
      .then(setCerts)
      .catch(() => toast.error("Erro ao carregar certificados"));
  }, []);

  const handleSign = async () => {
    if (!selectedCertId) { toast.error("Selecione um certificado"); return; }
    if (!pdfFile) { toast.error("Selecione um PDF"); return; }
    setSigning(true);
    setSignedData(null);
    try {
      const fd = new FormData();
      fd.append("credential_id", selectedCertId);
      fd.append("file", pdfFile);
      fd.append("visible", String(visible));
      const token = localStorage.getItem("access_token");
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9201/api/v1";
      const res = await fetch(`${baseUrl}/signing-credentials/sign-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Erro ao assinar" }));
        throw new Error(err.detail || "Erro ao assinar");
      }
      const blob = await res.blob();
      const sha256 = res.headers.get("X-SHA256-Signed") || "";
      const subject = res.headers.get("X-Certificate-Subject") || "";
      const filename = `assinado_${pdfFile.name.replace(/\.pdf$/i, "")}_${new Date().toISOString().slice(0, 10)}.pdf`;
      setSignedData({ blob, filename, sha256, subject });
      toast.success("PDF assinado com sucesso!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao assinar PDF");
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = () => {
    if (!signedData) return;
    const url = URL.createObjectURL(signedData.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = signedData.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === "application/pdf") {
      setPdfFile(files[0]);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-gutter py-8 animate-fade-up">
      <PageHeader
        eyebrow="Certificados digitais"
        title="Assinar documento"
        description="Assine qualquer PDF com um certificado digital já cadastrado e garanta a autenticidade jurídica das publicações."
        actions={
          <button type="button" onClick={() => router.push("/settings/certificates")} className="btn-outline">
            <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_back</span>
            Voltar aos certificados
          </button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Coluna esquerda — configuração */}
        <div className="space-y-6 lg:col-span-5">
          <section className="card p-6">
            <div className="flex items-center gap-3 border-b border-outline-variant pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">verified_user</span>
              </span>
              <h2 className="text-headline-sm text-on-surface">Certificado digital</h2>
            </div>
            <label className="mt-4 block">
              <span className="field-label">Selecione o certificado para assinatura</span>
              <div className="relative">
                <select
                  value={selectedCertId}
                  onChange={(e) => setSelectedCertId(e.target.value)}
                  className="input appearance-none pr-10"
                >
                  <option value="">Selecione um certificado…</option>
                  {certs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}{c.valid_until ? ` (Validade: ${new Date(c.valid_until).toLocaleDateString("pt-BR")})` : ""}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden="true">
                  expand_more
                </span>
              </div>
              <span className="field-hint flex items-center gap-1">
                <span className="material-symbols-outlined text-base" aria-hidden="true">info</span>
                Apenas certificados válidos e homologados pelo ICP-Brasil.
              </span>
            </label>
          </section>

          <section className="card p-6">
            <div className="flex items-center gap-3 border-b border-outline-variant pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">picture_as_pdf</span>
              </span>
              <h2 className="text-headline-sm text-on-surface">Documento PDF</h2>
            </div>
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="group mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center transition-colors hover:border-primary hover:bg-surface-container-low"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
              {pdfFile ? (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="material-symbols-outlined text-4xl text-secondary" aria-hidden="true">check_circle</span>
                  <p className="text-body-md font-semibold text-primary">{pdfFile.name}</p>
                  <p className="text-body-sm text-on-surface-variant">{(pdfFile.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined mb-3 text-4xl text-on-surface-variant transition-colors group-hover:text-primary" aria-hidden="true">
                    cloud_upload
                  </span>
                  <p className="text-body-md font-semibold text-primary">Arraste seu arquivo PDF aqui</p>
                  <p className="mt-1 text-body-sm text-on-surface-variant">ou clique para procurar em seu computador</p>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
                id="stamp"
              />
              <label className="cursor-pointer text-body-sm font-medium text-on-surface" htmlFor="stamp">
                Adicionar carimbo visível de assinatura
              </label>
            </div>
          </section>

          <button
            onClick={handleSign}
            disabled={signing || !selectedCertId || !pdfFile}
            className="btn-primary w-full py-3.5 text-headline-sm"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {signing ? "progress_activity" : "draw"}
            </span>
            {signing ? "Assinando…" : "Assinar PDF"}
          </button>
        </div>

        {/* Coluna direita — pré-visualização / resultado */}
        <div className="lg:col-span-7">
          <section className="card flex min-h-[600px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-6 py-4">
              <h2 className="text-headline-sm text-on-surface">
                {signedData ? "PDF assinado" : "Pré-visualização"}
              </h2>
            </div>

            {signedData ? (
              <div className="flex flex-grow flex-col items-center justify-center space-y-6 p-6 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-container">
                  <span className="material-symbols-outlined text-4xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                    check_circle
                  </span>
                </div>
                <h3 className="text-headline-md text-primary">PDF assinado com sucesso</h3>
                <dl className="w-full max-w-md space-y-2 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-left text-body-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-on-surface-variant">Arquivo:</dt>
                    <dd className="truncate font-medium text-on-surface">{signedData.filename}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-on-surface-variant">Certificado:</dt>
                    <dd className="max-w-[200px] truncate text-body-sm font-medium text-on-surface">{signedData.subject}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-on-surface-variant">SHA-256:</dt>
                    <dd className="max-w-[200px] truncate font-mono text-body-sm text-on-surface-variant">{signedData.sha256}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-on-surface-variant">Formato:</dt>
                    <dd className="font-medium text-on-surface">PAdES AD-RB (ICP-Brasil)</dd>
                  </div>
                </dl>
                <button onClick={handleDownload} className="btn-primary">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">download</span>
                  Baixar PDF assinado
                </button>
              </div>
            ) : (
              <div className="relative flex flex-grow flex-col items-center justify-center overflow-hidden bg-surface-container-low/40 p-8 text-center">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.04]"
                  style={{ backgroundImage: "radial-gradient(#0B2440 1px, transparent 1px)", backgroundSize: "20px 20px" }}
                />
                <div className="relative z-10">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-surface-container text-on-surface-variant/60">
                    <span className="material-symbols-outlined text-4xl" aria-hidden="true">description</span>
                  </div>
                  <h3 className="text-headline-md text-primary">Aguardando seleção</h3>
                  <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">
                    Selecione um arquivo PDF no painel ao lado para visualizar o conteúdo e posicionar o carimbo de assinatura.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Notas de confiança */}
      <div className="mt-8 grid grid-cols-1 gap-6 border-t border-outline-variant pt-8 md:grid-cols-3">
        <div className="flex gap-3">
          <span className="material-symbols-outlined text-2xl text-secondary" aria-hidden="true">verified</span>
          <div>
            <h3 className="text-body-md font-semibold text-primary">Validade jurídica</h3>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Assinaturas em conformidade com a MP 2.200-2/2001 do ICP-Brasil.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="material-symbols-outlined text-2xl text-secondary" aria-hidden="true">lock</span>
          <div>
            <h3 className="text-body-md font-semibold text-primary">Segurança de dados</h3>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Criptografia de ponta a ponta durante todo o processo de assinatura.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="material-symbols-outlined text-2xl text-secondary" aria-hidden="true">history</span>
          <div>
            <h3 className="text-body-md font-semibold text-primary">Log de atividades</h3>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Cada assinatura gera um evento rastreável no histórico do sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
