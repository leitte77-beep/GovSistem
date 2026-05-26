"use client";

import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import Link from "next/link";
import ConfirmModal from "@/components/ConfirmModal";

interface Certificate {
  id: string;
  label: string;
  provider_type: string;
  certificate_serial: string | null;
  certificate_subject: string | null;
  certificate_issuer: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Certificate | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCerts = () => {
    setLoading(true);
    api.listSigningCredentials()
      .then(setCerts)
      .catch(() => toast.error("Erro ao carregar certificados"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCerts(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) { toast.error("Dê um nome ao certificado"); return; }
    if (!password) { toast.error("Informe a senha do certificado"); return; }
    if (!file) { toast.error("Selecione o arquivo PFX"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 10MB."); return; }
    if (!file.name.endsWith(".pfx") && !file.name.endsWith(".p12")) { toast.error("Formato inválido. Use arquivos PFX ou P12."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("label", label.trim());
      fd.append("password", password);
      fd.append("file", file);
      await api.uploadSigningCredential(fd);
      toast.success("Certificado enviado com sucesso!");
      setShowUpload(false);
      setLabel("");
      setPassword("");
      setFile(null);
      fetchCerts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar certificado");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteSigningCredential(deleteTarget.id);
      toast.success("Certificado removido");
      setDeleteTarget(null);
      fetchCerts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  const isExpiringSoon = (dateStr: string | null) => {
    if (!dateStr) return false;
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return days > 0 && days <= 30;
  };

  const isExpired = (dateStr: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <div className="p-stack-md min-h-screen overflow-y-auto bg-surface-container-low">
      <section className="bg-primary-container rounded-xl p-8 mb-stack-md relative overflow-hidden shadow-lg border border-primary">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-on-primary-container rounded-full blur-3xl" />
          <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-secondary rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 text-on-primary-container mb-1">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              <span className="text-label-md font-label-md uppercase tracking-widest">Gerenciamento de Identidade</span>
            </div>
            <h2 className="text-headline-lg font-headline-lg text-on-primary">Certificados Digitais</h2>
            <p className="text-body-md text-primary-fixed-dim mt-1">{certs.length} certificado(s) cadastrado(s) em sua organização</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/settings/certificates/sign"
              className="bg-secondary text-on-secondary px-6 py-3 rounded-xl flex items-center gap-3 font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-all shadow-md active:scale-95"
            >
              <span className="material-symbols-outlined">draw</span>
              Assinar PDF
            </Link>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="bg-surface-container-lowest text-primary px-6 py-3 rounded-xl flex items-center gap-3 font-semibold hover:bg-primary hover:text-on-primary transition-all border border-outline-variant shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined">upload</span>
              {showUpload ? "Cancelar" : "Upload PFX"}
            </button>
          </div>
        </div>
      </section>

      {showUpload && (
        <form onSubmit={handleUpload} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm mb-6 space-y-4">
          <h3 className="text-headline-sm font-headline-sm text-primary">Adicionar Novo Certificado</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Nome do Certificado *</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3 py-2.5 border border-outline-variant rounded-lg text-body-sm outline-none focus:border-primary"
                placeholder="Ex: Certificado Prefeitura 2026" />
            </div>
            <div>
              <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Senha do PFX *</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-outline-variant rounded-lg text-body-sm outline-none focus:border-primary"
                placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-label-md font-label-md text-on-surface-variant mb-1">Arquivo PFX *</label>
              <div onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2.5 border-2 border-dashed border-outline-variant rounded-lg cursor-pointer hover:border-primary transition-colors">
                <input ref={fileRef} type="file" accept=".pfx,.p12" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <span className="material-symbols-outlined text-outline">upload</span>
                <span className="text-body-sm text-on-surface-variant truncate">
                  {file ? file.name : "Selecionar arquivo..."}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={uploading}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold hover:bg-primary-container transition-all shadow-md flex items-center gap-2 disabled:opacity-50">
              <span className="material-symbols-outlined">{uploading ? "progress_activity" : "upload"}</span>
              {uploading ? "Enviando..." : "Enviar Certificado"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {certs.length === 0 ? (
            <div className="border-2 border-dashed border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center text-center bg-surface-container-lowest/50">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline-variant mb-4">
                <span className="material-symbols-outlined text-4xl">add</span>
              </div>
              <h4 className="text-headline-sm font-headline-sm text-on-surface-variant mb-2">Adicionar novo certificado</h4>
              <p className="text-on-surface-variant text-sm max-w-xs mb-6 opacity-60">
                Para gerenciar múltiplos certificados, realize o upload do arquivo .pfx ou utilize a assinatura integrada.
              </p>
              <button onClick={() => setShowUpload(true)} className="text-primary font-semibold hover:underline flex items-center gap-2 transition-all">
                Saiba como importar seus certificados
                <span className="material-symbols-outlined text-sm">open_in_new</span>
              </button>
            </div>
          ) : (
            certs.map((cert) => {
              const expired = isExpired(cert.valid_until);
              const expiringSoon = isExpiringSoon(cert.valid_until);
              const statusBadge = expired ? "Vencido" : expiringSoon ? "Próximo ao vencimento" : "Válido";
              const statusClass = expired ? "bg-error-container/30 text-on-error-container border border-error/20" : expiringSoon ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-secondary-container/30 text-secondary border border-secondary-container";

              return (
                <div key={cert.id} className="bg-surface-container-lowest/80 backdrop-blur-sm rounded-xl p-6 border border-outline-variant shadow-sm hover:shadow-md transition-shadow relative group">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-shrink-0">
                      <div className={clsx(
                        "w-14 h-14 rounded-full flex items-center justify-center border",
                        expired ? "bg-error-container/20 text-error border-error/20" : expiringSoon ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-secondary-container/20 text-secondary border-secondary/20"
                      )}>
                        <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {expired ? "cancel" : expiringSoon ? "warning" : "check_circle"}
                        </span>
                      </div>
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <h3 className="text-headline-sm font-headline-sm text-primary">{cert.label}</h3>
                          <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${statusClass}`}>
                            {statusBadge}
                          </span>
                        </div>
                        <button
                          onClick={() => setDeleteTarget(cert)}
                          className="p-2 text-outline hover:text-error hover:bg-error-container/20 rounded-lg transition-colors active:scale-95 opacity-0 group-hover:opacity-100"
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </div>
                      {cert.certificate_subject && (
                        <div className="bg-surface-container-low p-4 rounded-lg mb-4">
                          <code className="text-xs text-on-surface-variant leading-relaxed break-all font-mono opacity-80">
                            {cert.certificate_subject}
                          </code>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {cert.certificate_serial && (
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-outline text-lg">fingerprint</span>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-outline tracking-wider">Impressão Digital</p>
                              <p className="text-sm font-medium text-on-surface truncate max-w-[200px]" title={cert.certificate_serial}>
                                {cert.certificate_serial.slice(0, 16)}...
                              </p>
                            </div>
                          </div>
                        )}
                        {cert.valid_until && (
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-outline text-lg">event_available</span>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-outline tracking-wider">Vencimento</p>
                              <p className={clsx("text-sm font-medium", expired ? "text-error" : expiringSoon ? "text-amber-600" : "text-on-surface")}>
                                {expired ? "Vencido em" : "Válido até"} {new Date(cert.valid_until).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-outline text-lg">history</span>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-outline tracking-wider">Importação</p>
                            <p className="text-sm font-medium text-on-surface">
                              Importado em {new Date(cert.created_at).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <footer className="mt-stack-lg pt-stack-md border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-xs text-on-surface-variant">© 2026 Diário Oficial. Todos os direitos reservados.</p>
        <div className="flex gap-6">
          <a className="text-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Termos de Uso</a>
          <a className="text-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Privacidade</a>
          <a className="text-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Ajuda</a>
        </div>
      </footer>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Remover certificado"
        message={`Tem certeza que deseja remover o certificado "${deleteTarget?.label}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
