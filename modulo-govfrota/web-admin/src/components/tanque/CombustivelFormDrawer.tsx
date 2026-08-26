"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api, Combustivel } from "@/lib/api";
import { UNIDADES_COMBUSTIVEL } from "@/lib/combustiveis";
import { Drawer, Label, Secao } from "@/components/tanque/Drawer";
import { UploadImagem } from "@/components/tanque/UploadImagem";

interface Props {
  aberto: boolean;
  onClose: () => void;
  combustivel: Combustivel | null;
  onSalvo: () => void;
}

export function CombustivelFormDrawer({ aberto, onClose, combustivel, onSalvo }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null);
  const [fotoUrlAtual, setFotoUrlAtual] = useState<string | null>(null);

  const novoForm = (c: Combustivel | null) => ({
    nome: c?.nome ?? "",
    unidade: c?.unidade ?? "litro",
    descricao: c?.descricao ?? "",
  });
  const [form, setForm] = useState(() => novoForm(combustivel));

  useEffect(() => {
    if (aberto) {
      setForm(novoForm(combustivel));
      setFotoUrlAtual(combustivel?.foto_url ?? null);
      setArquivoFoto(null);
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, combustivel]);

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
        nome: form.nome,
        unidade: form.unidade,
        descricao: form.descricao || undefined,
        foto_url,
        ativo: combustivel?.ativo ?? true,
      };
      if (combustivel) {
        await api.updateCombustivel(combustivel.id, payload);
        toast.success("Combustível atualizado.");
      } else {
        await api.createCombustivel(payload);
        toast.success("Combustível cadastrado.");
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
      titulo={combustivel ? "Editar combustível" : "Novo tipo de combustível"}
      largura="max-w-xl"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="form-combustivel" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : combustivel ? "Salvar alterações" : "Cadastrar"}
          </button>
        </>
      }
    >
      <form id="form-combustivel" onSubmit={enviar} className="space-y-7">
        <Secao titulo="Imagem / ícone">
          <UploadImagem
            valorInicial={fotoUrlAtual}
            onMudar={(file) => setArquivoFoto(file)}
            alt={form.nome ? `Ícone ${form.nome}` : "Ícone do combustível"}
          />
          <p className="text-meta text-text-subtle">Opcional. Ícone ou símbolo visual do combustível.</p>
        </Secao>

        <Secao titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Nome *">
              <input required {...campo("nome")} placeholder="Ex.: Diesel S500" />
            </Label>
            <Label texto="Unidade">
              <select {...campo("unidade")}>
                {UNIDADES_COMBUSTIVEL.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Label>
            <Label texto="Descrição" classe="sm:col-span-2">
              <textarea rows={2} {...campo("descricao")} />
            </Label>
          </div>
        </Secao>
      </form>
    </Drawer>
  );
}
