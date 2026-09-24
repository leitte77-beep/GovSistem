"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, Combustivel, Tanque } from "@/lib/api";
import { Drawer, Label, Secao } from "@/components/tanque/Drawer";
import { UploadImagem } from "@/components/tanque/UploadImagem";

interface Props {
  aberto: boolean;
  onClose: () => void;
  tanque: Tanque | null;
  combustiveis: Combustivel[];
  onSalvo: () => void;
}

export function TanqueFormDrawer({ aberto, onClose, tanque, combustiveis, onSalvo }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null);
  const [fotoUrlAtual, setFotoUrlAtual] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const novoForm = (t: Tanque | null) => ({
    nome: t?.nome ?? "",
    codigo: t?.codigo ?? "",
    localizacao: t?.localizacao ?? "",
    combustivel_id: t?.combustivel_id ?? "",
    capacidade_maxima: t?.capacidade_maxima ?? "",
    estoque_minimo: t?.estoque_minimo ?? "",
    observacoes: t?.observacoes ?? "",
  });

  const [form, setForm] = useState(() => novoForm(tanque));

  useEffect(() => {
    if (aberto) {
      setForm(novoForm(tanque));
      setFotoUrlAtual(tanque?.foto_url ?? null);
      setArquivoFoto(null);
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, tanque]);

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    className: "input",
  });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      let foto_url: string | null = fotoUrlAtual ?? null;
      if (arquivoFoto) {
        const up = await api.upload(arquivoFoto);
        foto_url = up.url;
      }
      const payload: Record<string, unknown> = {
        ...form,
        foto_url,
        capacidade_maxima: Number(form.capacidade_maxima) || 0,
        estoque_minimo: form.estoque_minimo ? Number(form.estoque_minimo) : 0,
        observacoes: form.observacoes || undefined,
        codigo: form.codigo || undefined,
        localizacao: form.localizacao || undefined,
      };
      if (tanque) {
        // Edição não altera combustível de forma a preservar a consistência do estoque.
        delete payload.combustivel_id;
        await api.updateTanque(tanque.id, payload);
        toast.success("Tanque atualizado.");
      } else {
        if (!form.combustivel_id) {
          toast.error("Selecione o tipo de combustível.");
          return;
        }
        await api.createTanque(payload);
        toast.success("Tanque criado.");
      }
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
      titulo={tanque ? "Editar tanque" : "Novo tanque"}
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="form-tanque" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : tanque ? "Salvar alterações" : "Cadastrar tanque"}
          </button>
        </>
      }
    >
      <form id="form-tanque" onSubmit={enviar} className="space-y-7">
        <Secao titulo="Imagem">
          <UploadImagem
            valorInicial={fotoUrlAtual}
            onMudar={(file, _preview) => setArquivoFoto(file)}
            alt={form.nome ? `Foto do ${form.nome}` : "Foto do tanque"}
          />
          <p className="text-meta text-text-subtle">
            Opcional. Pode representar o tanque físico, a instalação ou a bomba associada.
          </p>
        </Secao>

        <Secao titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Nome *">
              <input required {...campo("nome")} placeholder="Ex.: Tanque Alto" />
            </Label>
            <Label texto="Código">
              <input {...campo("codigo")} placeholder="Ex.: TQ-01" />
            </Label>
            <Label texto="Localização" classe="sm:col-span-2">
              <input {...campo("localizacao")} placeholder="Ex.: Pátio principal, junto à bomba 1" />
            </Label>
          </div>
        </Secao>

        <Secao titulo="Combustível">
          <Label texto="Tipo de combustível *">
            <select {...campo("combustivel_id")} disabled={!!tanque}>
              <option value="">Selecione…</option>
              {combustiveis.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Label>
          {tanque && (
            <p className="text-meta text-text-subtle">
              O combustível de um tanque não pode ser trocado após o cadastro, para preservar o histórico de estoque.
            </p>
          )}
        </Secao>

        <Secao titulo="Capacidade">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Capacidade máxima (L) *">
              <input required type="number" step="0.01" min={1} {...campo("capacidade_maxima")} />
            </Label>
            <Label texto="Estoque mínimo (L)">
              <input type="number" step="0.01" min={0} {...campo("estoque_minimo")} placeholder="0" />
            </Label>
          </div>
        </Secao>

        <Secao titulo="Configuração">
          <Label texto="Observações">
            <textarea rows={3} {...campo("observacoes")} />
          </Label>
        </Secao>
      </form>
    </Drawer>
  );
}
