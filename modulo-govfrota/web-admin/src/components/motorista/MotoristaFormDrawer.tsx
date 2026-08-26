"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, Trash2, Upload, X } from "lucide-react";
import { api, Motorista } from "@/lib/api";
import { CATEGORIAS_CNH, formatarCpf, formatarTelefone } from "@/lib/motoristas";

interface Props {
  aberto: boolean;
  onClose: () => void;
  motorista: Motorista | null;
  onSalvo: () => void;
}

export function MotoristaFormDrawer({ aberto, onClose, motorista, onSalvo }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null);
  const [fotoUrlAtual, setFotoUrlAtual] = useState<string>("");
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const novoForm = (m: Motorista | null) => ({
    nome: m?.nome ?? "",
    cpf: m ? formatarCpf(m.cpf) : "",
    matricula: m?.matricula ?? "",
    telefone: m?.telefone ?? "",
    email: m?.email ?? "",
    cnh_numero: m?.cnh_numero ?? "",
    cnh_categoria: m?.cnh_categoria ?? "",
    cnh_validade: m?.cnh_validade ?? "",
    observacoes: m?.observacoes ?? "",
    ativo: m?.ativo ?? true,
  });

  const [form, setForm] = useState(() => novoForm(motorista));

  useEffect(() => {
    if (aberto) {
      setForm(novoForm(motorista));
      setFotoUrlAtual(motorista?.foto_url ?? "");
      setArquivoFoto(null);
      setPreviewFoto(null);
      setSalvando(false);
    }
  }, [aberto, motorista]);

  const campo = (k: string) => ({
    value: (form as never)[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "input",
  });

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    setArquivoFoto(file);
    setPreviewFoto(URL.createObjectURL(file));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const cpf = form.cpf.replace(/\D/g, "");
    if (cpf.length !== 11) {
      toast.error("Informe um CPF válido.");
      return;
    }
    setSalvando(true);
    try {
      let foto_url: string | undefined = fotoUrlAtual || undefined;
      if (arquivoFoto) {
        const up = await api.upload(arquivoFoto);
        foto_url = up.url;
      }
      const payload: Record<string, unknown> = {
        nome: form.nome,
        matricula: form.matricula || undefined,
        telefone: form.telefone || undefined,
        email: form.email || undefined,
        cnh_numero: form.cnh_numero || undefined,
        cnh_categoria: form.cnh_categoria || undefined,
        cnh_validade: form.cnh_validade || undefined,
        observacoes: form.observacoes || undefined,
        foto_url,
        ativo: form.ativo,
      };
      if (motorista) {
        await api.updateMotorista(motorista.id, payload);
        toast.success("Motorista atualizado.");
      } else {
        await api.createMotorista({ ...payload, cpf });
        toast.success("Motorista cadastrado.");
      }
      onSalvo();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;
  const imgPreview = previewFoto ?? fotoUrlAtual;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-elevated">
        <div className="flex items-center justify-between border-b border-[#E4E7EC] px-6 py-4">
          <h2 className="text-h3 text-text-title">{motorista ? "Editar motorista" : "Novo motorista"}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <form id="motorista-form" onSubmit={enviar} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-7">
            <Secao titulo="Dados pessoais">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto="Nome completo *" classe="sm:col-span-2">
                  <input {...campo("nome")} required placeholder="Nome do motorista" />
                </Label>
                <Label texto="CPF *">
                  <input
                    value={form.cpf}
                    onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                    onBlur={() => setForm((f) => ({ ...f, cpf: formatarCpf(f.cpf) }))}
                    placeholder="000.000.000-00"
                    disabled={!!motorista}
                    className={`input ${motorista ? "cursor-not-allowed bg-surface-bg" : ""}`}
                  />
                  {motorista && <span className="text-meta text-[#737781]">O CPF não pode ser alterado após o cadastro.</span>}
                </Label>
                <Label texto="Matrícula (opcional)">
                  <input {...campo("matricula")} placeholder="Ex.: 1042" />
                </Label>
                <Label texto="Status">
                  <select
                    value={String(form.ativo)}
                    onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value === "true" }))}
                    className="input"
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </Label>
              </div>
            </Secao>

            <Secao titulo="Contato">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label texto="Telefone">
                  <input
                    value={form.telefone}
                    onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                    onBlur={() => setForm((f) => ({ ...f, telefone: formatarTelefone(f.telefone) }))}
                    placeholder="(44) 99999-9999"
                    className="input"
                  />
                </Label>
                <Label texto="E-mail (opcional)">
                  <input type="email" {...campo("email")} placeholder="motorista@org.gov" />
                </Label>
              </div>
            </Secao>

            <Secao titulo="CNH">
              <div className="grid gap-3 sm:grid-cols-3">
                <Label texto="Número da CNH">
                  <input {...campo("cnh_numero")} />
                </Label>
                <Label texto="Categoria">
                  <select {...campo("cnh_categoria")}>
                    <option value="">—</option>
                    {CATEGORIAS_CNH.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Label>
                <Label texto="Validade">
                  <input type="date" {...campo("cnh_validade")} />
                </Label>
              </div>
            </Secao>

            <Secao titulo="Foto">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {imgPreview ? (
                  <div className="h-28 w-28 flex-shrink-0 overflow-hidden rounded-full border border-[#C3C6D1] bg-surface-bg">
                    <img src={imgPreview} alt="Foto do motorista" className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-[#C3C6D1] bg-surface-bg text-[#737781]">
                    <Camera size={24} />
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={escolherFoto}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputFotoRef.current?.click()}>
                    <Upload size={14} /> {imgPreview ? "Substituir foto" : "Selecionar foto"}
                  </button>
                  {imgPreview && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-[#BA1A1A]"
                      onClick={() => {
                        setArquivoFoto(null);
                        setPreviewFoto(null);
                        setFotoUrlAtual("");
                        if (inputFotoRef.current) inputFotoRef.current.value = "";
                      }}
                    >
                      <Trash2 size={14} /> Remover foto
                    </button>
                  )}
                  <p className="text-meta text-[#737781]">Opcional. Usada na listagem e na ficha.</p>
                </div>
              </div>
            </Secao>

            <Secao titulo="Observações">
              <textarea rows={3} {...campo("observacoes")} className="input" />
            </Secao>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-[#E4E7EC] px-6 py-4">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="motorista-form" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : motorista ? "Salvar alterações" : "Cadastrar motorista"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-label font-semibold text-text-title">{titulo}</h3>
      {children}
    </section>
  );
}

function Label({ texto, children, classe }: { texto: string; children: React.ReactNode; classe?: string }) {
  return (
    <label className={`text-meta ${classe ?? ""}`}>
      {texto}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
