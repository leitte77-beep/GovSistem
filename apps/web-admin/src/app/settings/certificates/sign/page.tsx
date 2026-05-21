"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";

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
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";
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
    <div className="max-w-[1200px] mx-auto p-gutter">
      <div className="mb-stack-lg">
        <h2 className="text-headline-lg font-headline-lg text-primary mb-2">Assinar Documento</h2>
        <p className="text-body-lg text-on-surface-variant max-w-2xl">
          Assine qualquer PDF utilizando um certificado digital já cadastrado no sistema. Garanta a autenticidade jurídica de suas publicações com apenas alguns cliques.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Settings */}
        <div className="lg:col-span-5 space-y-8">
          <section className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded bg-primary/5 text-primary">
                <span className="material-symbols-outlined">verified_user</span>
              </div>
              <h3 className="text-headline-sm font-headline-sm text-primary">Certificado Digital</h3>
            </div>
            <label className="block mb-2 text-sm font-semibold text-on-surface-variant">Selecione o certificado para assinatura</label>
            <div className="relative">
              <select value={selectedCertId} onChange={(e) => setSelectedCertId(e.target.value)}
                className="w-full h-12 bg-surface-container-low border border-outline-variant rounded-lg px-4 appearance-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all">
                <option value="">Selecione um certificado...</option>
                {certs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}{c.valid_until ? ` (Validade: ${new Date(c.valid_until).toLocaleDateString("pt-BR")})` : ""}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">expand_more</span>
            </div>
            <p className="mt-3 text-xs text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">info</span>
              Apenas certificados válidos e homologados pelo ICP-Brasil.
            </p>
          </section>

          <section className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded bg-primary/5 text-primary">
                <span className="material-symbols-outlined">picture_as_pdf</span>
              </div>
              <h3 className="text-headline-sm font-headline-sm text-primary">Documento PDF</h3>
            </div>
            <div ref={dropRef} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-outline-variant rounded-xl p-10 flex flex-col items-center justify-center bg-background hover:bg-surface-container-low hover:border-primary transition-all cursor-pointer group">
              <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
              {pdfFile ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl text-secondary">check_circle</span>
                  <p className="font-bold text-primary">{pdfFile.name}</p>
                  <p className="text-sm text-on-surface-variant">({(pdfFile.size / 1024).toFixed(0)} KB)</p>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant group-hover:text-primary mb-4 transition-colors">cloud_upload</span>
                  <p className="font-bold text-primary text-center">Arraste seu arquivo PDF aqui</p>
                  <p className="text-sm text-on-surface-variant text-center mt-1">ou clique para procurar em seu computador</p>
                </>
              )}
            </div>
            <div className="mt-6 flex items-center gap-3 p-3 bg-surface-container rounded-lg">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)}
                className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary cursor-pointer" id="stamp" />
              <label className="text-body-sm font-semibold text-primary cursor-pointer" htmlFor="stamp">Adicionar carimbo visível de assinatura</label>
            </div>
          </section>

          <button onClick={handleSign} disabled={signing || !selectedCertId || !pdfFile}
            className="w-full py-4 bg-secondary text-on-secondary font-bold text-headline-sm rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
            <span className="material-symbols-outlined">
              {signing ? "progress_activity" : "draw"}
            </span>
            {signing ? "Assinando..." : "Assinar PDF"}
          </button>
        </div>

        {/* Right: Preview / Result */}
        <div className="lg:col-span-7 h-full">
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm h-full flex flex-col overflow-hidden min-h-[600px]">
            <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
              <h3 className="text-headline-sm font-headline-sm text-primary">
                {signedData ? "PDF Assinado" : "Pré-visualização"}
              </h3>
            </div>

            {signedData ? (
              <div className="flex-grow p-6 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-24 h-24 bg-secondary-container/20 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                </div>
                <h4 className="text-headline-md font-headline-md text-primary">PDF Assinado com Sucesso!</h4>
                <div className="bg-surface-container-low rounded-lg p-4 space-y-2 text-sm w-full max-w-md text-left">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Arquivo:</span>
                    <span className="font-medium text-on-surface">{signedData.filename}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Certificado:</span>
                    <span className="font-medium text-on-surface text-xs truncate max-w-[200px]">{signedData.subject}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">SHA-256:</span>
                    <span className="font-mono text-xs text-on-surface-variant truncate max-w-[200px]">{signedData.sha256}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Formato:</span>
                    <span className="font-medium text-on-surface">PAdES AD-RB (ICP-Brasil)</span>
                  </div>
                </div>
                <button onClick={handleDownload}
                  className="flex items-center gap-2 px-8 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:bg-primary-container active:scale-95 transition-all">
                  <span className="material-symbols-outlined">download</span>
                  Download do PDF Assinado
                </button>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center p-gutter text-center bg-[#e0e3e5]/30 relative overflow-hidden">
                <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: "radial-gradient(#001631 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                <div className="relative z-10">
                  <div className="w-24 h-24 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-6 text-on-surface-variant/40">
                    <span className="material-symbols-outlined text-5xl">description</span>
                  </div>
                  <h4 className="text-headline-md text-primary mb-2">Aguardando seleção</h4>
                  <p className="text-on-surface-variant max-w-xs mx-auto">
                    Selecione um arquivo PDF no painel ao lado para visualizar o conteúdo e posicionar o carimbo de assinatura.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Footer info */}
      <div className="mt-stack-lg border-t border-outline-variant pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-secondary text-3xl">verified</span>
          <div>
            <h4 className="font-bold text-primary">Validade Jurídica</h4>
            <p className="text-sm text-on-surface-variant">Assinaturas em conformidade com a MP 2.200-2/2001 do ICP-Brasil.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-secondary text-3xl">lock</span>
          <div>
            <h4 className="font-bold text-primary">Segurança de Dados</h4>
            <p className="text-sm text-on-surface-variant">Criptografia de ponta a ponta durante todo o processo de assinatura.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="material-symbols-outlined text-secondary text-3xl">history</span>
          <div>
            <h4 className="font-bold text-primary">Log de Atividades</h4>
            <p className="text-sm text-on-surface-variant">Cada assinatura gera um evento rastreável no histórico do sistema.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
