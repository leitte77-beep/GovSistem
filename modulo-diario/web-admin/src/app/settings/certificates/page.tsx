"use client";

import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import clsx from "clsx";
import { api } from "@/lib/api";
import Link from "next/link";
import ConfirmModal from "@/components/ConfirmModal";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

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
    <div className="mx-auto max-w-4xl px-gutter py-8 animate-fade-up">
      <PageHeader
        eyebrow="Configurações"
        title="Certificados digitais"
        description="Gerencie os certificados usados para assinar PDFs e documentos oficiais da organização."
        meta={
          <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-base" aria-hidden="true">verified_user</span>
            {certs.length} certificado(s) cadastrado(s)
          </span>
        }
        actions={
          <>
            <Link href="/settings/certificates/sign" className="btn-outline">
              <span className="material-symbols-outlined text-base" aria-hidden="true">draw</span>
              Assinar PDF
            </Link>
            <button onClick={() => setShowUpload(!showUpload)} className="btn-primary">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {showUpload ? "close" : "upload"}
              </span>
              {showUpload ? "Cancelar" : "Enviar PFX"}
            </button>
          </>
        }
      />

      {showUpload && (
        <form onSubmit={handleUpload} className="card mb-6 space-y-5 p-6">
          <div className="border-b border-outline-variant pb-3">
            <p className="eyebrow">Novo certificado</p>
            <h2 className="mt-1 text-headline-sm text-on-surface">Adicionar certificado</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="field-label">
                Nome do certificado <span className="text-error">*</span>
              </span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="input"
                placeholder="Ex.: Certificado Prefeitura 2026"
              />
            </label>
            <label className="block">
              <span className="field-label">
                Senha do PFX <span className="text-error">*</span>
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
            <div>
              <span className="field-label">
                Arquivo PFX <span className="text-error">*</span>
              </span>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-outline-variant px-3.5 py-2.5 text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pfx,.p12"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <span className="material-symbols-outlined text-lg" aria-hidden="true">upload</span>
                <span className="truncate text-body-sm">{file ? file.name : "Selecionar arquivo…"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={uploading} className="btn-primary">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {uploading ? "progress_activity" : "upload"}
              </span>
              {uploading ? "Enviando…" : "Enviar certificado"}
            </button>
            <span className="field-hint mt-0">Aceita arquivos .pfx e .p12 de até 10 MB.</span>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-4xl text-primary" aria-hidden="true">
            progress_activity
          </span>
        </div>
      ) : certs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Nenhum certificado cadastrado"
            description="Envie um arquivo PFX ou P12 para assinar documentos digitalmente. Você também pode usar a assinatura integrada."
            action={
              <button onClick={() => setShowUpload(true)} className="btn-primary">
                <span className="material-symbols-outlined text-base" aria-hidden="true">upload</span>
                Enviar certificado
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {certs.map((cert) => {
            const expired = isExpired(cert.valid_until);
            const expiringSoon = isExpiringSoon(cert.valid_until);
            const statusBadge = expired ? "Vencido" : expiringSoon ? "Próximo ao vencimento" : "Válido";
            const statusClass = expired
              ? "bg-error-container text-on-error-container border-error/20"
              : expiringSoon
                ? "bg-warning-container text-on-warning-container border-warning/20"
                : "bg-success-container text-on-success-container border-success/20";
            const iconWrap = expired
              ? "bg-error-container/60 text-error border-error/20"
              : expiringSoon
                ? "bg-warning-container text-warning border-warning/20"
                : "bg-success-container text-secondary border-success/20";
            const iconName = expired ? "cancel" : expiringSoon ? "warning" : "check_circle";

            return (
              <li key={cert.id}>
                <article className="card card-hover p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <span
                      className={clsx(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                        iconWrap,
                      )}
                    >
                      <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                        {iconName}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-headline-sm text-on-surface">{cert.label}</h3>
                          <span className={clsx("rounded-full border px-2.5 py-0.5 text-label-md uppercase tracking-wide", statusClass)}>
                            {statusBadge}
                          </span>
                        </div>
                        <button
                          onClick={() => setDeleteTarget(cert)}
                          aria-label={`Remover certificado ${cert.label}`}
                          className="rounded-lg p-2 text-outline transition-colors hover:bg-error-container/60 hover:text-error"
                        >
                          <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                        </button>
                      </div>

                      {cert.certificate_subject && (
                        <code className="mt-3 block break-all rounded-lg bg-surface-container-low p-3 font-mono text-body-sm text-on-surface-variant">
                          {cert.certificate_subject}
                        </code>
                      )}

                      <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-outline-variant pt-4 sm:grid-cols-3">
                        {cert.certificate_serial && (
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-outlined text-lg text-outline" aria-hidden="true">fingerprint</span>
                            <div className="min-w-0">
                              <dt className="eyebrow">Impressão digital</dt>
                              <dd className="mt-0.5 truncate text-body-sm font-medium text-on-surface" title={cert.certificate_serial}>
                                {cert.certificate_serial.slice(0, 16)}…
                              </dd>
                            </div>
                          </div>
                        )}
                        {cert.valid_until && (
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-outlined text-lg text-outline" aria-hidden="true">event_available</span>
                            <div>
                              <dt className="eyebrow">Vencimento</dt>
                              <dd className={clsx("mt-0.5 text-body-sm font-medium", expired ? "text-error" : expiringSoon ? "text-warning" : "text-on-surface")}>
                                {expired ? "Vencido em" : "Válido até"} {new Date(cert.valid_until).toLocaleDateString("pt-BR")}
                              </dd>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-2.5">
                          <span className="material-symbols-outlined text-lg text-outline" aria-hidden="true">history</span>
                          <div>
                            <dt className="eyebrow">Importação</dt>
                            <dd className="mt-0.5 text-body-sm font-medium text-on-surface">
                              Importado em {new Date(cert.created_at).toLocaleDateString("pt-BR")}
                            </dd>
                          </div>
                        </div>
                      </dl>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

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
