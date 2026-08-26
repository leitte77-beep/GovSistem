"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FileText, Fuel, Paperclip, Trash2, Upload } from "lucide-react";
import { api, Entrada, Fornecedor, Tanque } from "@/lib/api";
import { mascaraCpfCnpj } from "@/lib/combustiveis";
import { Drawer, Label, Secao } from "@/components/tanque/Drawer";
import { FotoCombustivel } from "@/components/tanque/FotoCombustivel";

interface Props {
  aberto: boolean;
  onClose: () => void;
  tanques: Tanque[];
  fornecedores: Fornecedor[];
  onSalvo: () => void;
  tanqueInicialId?: string;
}

interface AnexoLocal {
  id: string;
  file: File;
  preview?: string | null;
}

export function EntradaFormDrawer({ aberto, onClose, tanques, fornecedores, onSalvo, tanqueInicialId }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    tanque_id: tanqueInicialId ?? "",
    fornecedor_id: "",
    numero_nota: "",
    serie_nota: "",
    chave_nfe: "",
    data_entrada: new Date().toISOString().slice(0, 10),
    quantidade_litros: "",
    valor_total: "",
    observacoes: "",
  });
  const [anexos, setAnexos] = useState<AnexoLocal[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) {
      setForm((f) => ({
        ...f,
        tanque_id: tanqueInicialId ?? f.tanque_id,
        data_entrada: new Date().toISOString().slice(0, 10),
      }));
      setAnexos([]);
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, tanqueInicialId]);

  const tanque = tanques.find((t) => t.id === form.tanque_id);
  const fornecedor = fornecedores.find((f) => f.id === form.fornecedor_id);

  const capacidadeDisponivel = useMemo(() => {
    if (!tanque) return null;
    return Math.max(Number(tanque.capacidade_maxima) - Number(tanque.estoque_atual), 0);
  }, [tanque]);

  const litros = Number(form.quantidade_litros || 0);
  const valor = Number(form.valor_total || 0);
  const valorPorLitro = litros > 0 && valor > 0 ? valor / litros : null;
  const excedeCapacidade = capacidadeDisponivel !== null && litros > capacidadeDisponivel;

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "input",
  });

  const adicionarArquivos = (files: FileList | null) => {
    if (!files) return;
    const novos: AnexoLocal[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setAnexos((a) => [...a, ...novos]);
  };

  const removerAnexo = (id: string) => {
    setAnexos((a) => a.filter((x) => x.id !== id));
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!tanque) return toast.error("Selecione o tanque.");
    if (excedeCapacidade) {
      toast.error(`A entrada excede a capacidade disponível (${capacidadeDisponivel} L).`);
      return;
    }
    setSalvando(true);
    try {
      const anexos_ids: string[] = [];
      for (const a of anexos) {
        const up = await api.upload(a.file);
        anexos_ids.push(up.id);
      }
      const payload: Record<string, unknown> = {
        tanque_id: tanque.id,
        combustivel_id: tanque.combustivel_id,
        fornecedor_id: form.fornecedor_id || undefined,
        quantidade_litros: litros,
        data_entrada: form.data_entrada,
        numero_nota: form.numero_nota || undefined,
        serie_nota: form.serie_nota || undefined,
        chave_nfe: form.chave_nfe || undefined,
        valor_total: valor > 0 ? valor : undefined,
        observacoes: form.observacoes || undefined,
        anexos_ids: anexos_ids.length ? anexos_ids : undefined,
      };
      await api.createEntrada(payload);
      toast.success("Entrada registrada — estoque atualizado.");
      onSalvo();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Drawer
      aberto={aberto}
      onClose={onClose}
      titulo="Nova entrada"
      largura="max-w-2xl"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="form-entrada" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Registrando…" : "Registrar entrada"}
          </button>
        </>
      }
    >
      <form id="form-entrada" onSubmit={enviar} className="space-y-7">
        <Secao titulo="Tanque">
          <div className="space-y-3">
            <Label texto="Tanque *">
              <select required {...campo("tanque_id")}>
                <option value="">Selecione o tanque…</option>
                {tanques.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome} ({t.combustivel_nome})</option>
                ))}
              </select>
            </Label>
            {tanque && (
              <div className="flex items-center gap-3 rounded-btn border border-surface-border bg-surface-bg p-3">
                <FotoCombustivel src={tanque.foto_url} alt={`Tanque ${tanque.nome}`} className="h-12 w-16 rounded-btn object-cover" />
                <div className="text-body-sm">
                  <p className="font-medium text-text-title">{tanque.nome}</p>
                  <p className="text-meta text-text-subtle">
                    Estoque atual: <span className="font-medium text-text-body">{Number(tanque.estoque_atual).toLocaleString("pt-BR")} L</span>
                    {" · "}Capacidade disponível: <span className="font-medium text-text-body">{capacidadeDisponivel?.toLocaleString("pt-BR") ?? "—"} L</span>
                  </p>
                  {excedeCapacidade && (
                    <p className="mt-1 text-meta font-medium text-[#BA1A1A]">
                      Esta entrada excede a capacidade disponível do tanque.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Secao>

        <Secao titulo="Documento">
          <div className="grid gap-3 sm:grid-cols-3">
            <Label texto="Nº NF">
              <input {...campo("numero_nota")} placeholder="Ex.: 12345" />
            </Label>
            <Label texto="Série">
              <input {...campo("serie_nota")} />
            </Label>
            <Label texto="Data *">
              <input required type="date" {...campo("data_entrada")} />
            </Label>
            <Label texto="Chave NF-e" classe="sm:col-span-3">
              <input {...campo("chave_nfe")} placeholder="Chave de 44 dígitos (opcional)" />
            </Label>
            <Label texto="Fornecedor" classe="sm:col-span-3">
              <select {...campo("fornecedor_id")}>
                <option value="">—</option>
                {fornecedores.filter((f) => f.ativo).map((f) => (
                  <option key={f.id} value={f.id}>{f.razao_social}</option>
                ))}
              </select>
            </Label>
            {fornecedor && (
              <div className="flex items-center gap-2 sm:col-span-3 text-body-sm">
                <FotoCombustivel
                  src={fornecedor.foto_url}
                  alt={`Logo ${fornecedor.razao_social}`}
                  className="h-8 w-10 rounded-btn object-cover"
                  fallback={<span className="text-meta">{fornecedor.razao_social.charAt(0).toUpperCase()}</span>}
                />
                <div>
                  <p className="font-medium text-text-title">{fornecedor.nome_fantasia || fornecedor.razao_social}</p>
                  <p className="text-meta text-text-subtle">{mascaraCpfCnpj(fornecedor.cpf_cnpj)}</p>
                </div>
              </div>
            )}
          </div>
        </Secao>

        <Secao titulo="Quantidade e valor">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Litros *">
              <input required type="number" step="0.01" min={0} {...campo("quantidade_litros")} />
            </Label>
            <Label texto="Valor total (R$)">
              <input type="number" step="0.01" min={0} {...campo("valor_total")} />
            </Label>
            {valorPorLitro !== null && (
              <div className="sm:col-span-2 rounded-btn bg-[#EFF6FF] px-3 py-2 text-body-sm text-[#1D4ED8]">
                Valor por litro: <strong>R$ {valorPorLitro.toFixed(4).replace(".", ",")}</strong>
              </div>
            )}
          </div>
        </Secao>

        <Secao titulo="Anexos">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.xml,image/*,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              adicionarArquivos(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
            <Paperclip size={14} /> Adicionar NF (PDF/XML/foto)
          </button>
          <p className="text-meta text-text-subtle">Permitido: PDF, XML e imagens (até 20 MB cada).</p>
          {anexos.length > 0 && (
            <ul className="mt-3 space-y-2">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-btn border border-surface-border p-2">
                  {a.preview ? (
                    <img src={a.preview} alt={a.file.name} className="h-10 w-14 rounded-btn object-cover" />
                  ) : (
                    <div className="flex h-10 w-14 items-center justify-center rounded-btn bg-[#EFF6FF] text-[#1D4ED8]">
                      {a.file.name.toLowerCase().endsWith(".xml") ? <FileText size={18} /> : <Fuel size={18} />}
                    </div>
                  )}
                  <span className="flex-1 truncate text-body-sm text-text-body">{a.file.name}</span>
                  <span className="text-meta text-text-subtle">{(a.file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" className="text-[#B42318] hover:opacity-70" onClick={() => removerAnexo(a.id)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Observações">
          <Label texto="Observações">
            <textarea rows={2} {...campo("observacoes")} />
          </Label>
        </Secao>

        {tanque && (
          <Secao titulo="Resumo da entrada">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-card border border-surface-border bg-surface-bg p-4 text-body-sm">
              <dt className="text-meta text-text-subtle">Tanque</dt><dd className="text-right font-medium">{tanque.nome}</dd>
              <dt className="text-meta text-text-subtle">Combustível</dt><dd className="text-right font-medium">{tanque.combustivel_nome}</dd>
              <dt className="text-meta text-text-subtle">Quantidade</dt><dd className="text-right font-medium">{litros.toLocaleString("pt-BR")} L</dd>
              <dt className="text-meta text-text-subtle">Fornecedor</dt><dd className="text-right font-medium">{fornecedor?.nome_fantasia || fornecedor?.razao_social || "—"}</dd>
              <dt className="text-meta text-text-subtle">NF</dt><dd className="text-right font-medium">{form.numero_nota || "—"}</dd>
              <dt className="text-meta text-text-subtle">Valor total</dt><dd className="text-right font-medium">{valor > 0 ? `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</dd>
              {valorPorLitro !== null && (
                <>
                  <dt className="text-meta text-text-subtle">Valor/L</dt>
                  <dd className="text-right font-medium">R$ {valorPorLitro.toFixed(4).replace(".", ",")}</dd>
                </>
              )}
            </dl>
          </Secao>
        )}
      </form>
    </Drawer>
  );
}
