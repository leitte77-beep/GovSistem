"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api, Fornecedor } from "@/lib/api";
import { CATEGORIAS_FORNECEDOR } from "@/lib/combustiveis";
import { Drawer, Label, Secao } from "@/components/tanque/Drawer";
import { UploadImagem } from "@/components/tanque/UploadImagem";

interface Props {
  aberto: boolean;
  onClose: () => void;
  fornecedor: Fornecedor | null;
  onSalvo: () => void;
}

export function FornecedorFormDrawer({ aberto, onClose, fornecedor, onSalvo }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [arquivoLogo, setArquivoLogo] = useState<File | null>(null);
  const [logoUrlAtual, setLogoUrlAtual] = useState<string | null>(null);

  const novoForm = (f: Fornecedor | null) => ({
    razao_social: f?.razao_social ?? "",
    nome_fantasia: f?.nome_fantasia ?? "",
    cpf_cnpj: f?.cpf_cnpj ?? "",
    categoria: f?.categoria ?? "COMBUSTIVEL",
    telefone: f?.telefone ?? "",
    email: f?.email ?? "",
    contato: f?.contato ?? "",
    site: f?.site ?? "",
    cep: f?.cep ?? "",
    logradouro: f?.logradouro ?? "",
    numero: f?.numero ?? "",
    complemento: f?.complemento ?? "",
    bairro: f?.bairro ?? "",
    cidade: f?.cidade ?? "",
    uf: f?.uf ?? "",
    observacoes: f?.observacoes ?? "",
  });
  const [form, setForm] = useState(() => novoForm(fornecedor));

  useEffect(() => {
    if (aberto) {
      setForm(novoForm(fornecedor));
      setLogoUrlAtual(fornecedor?.foto_url ?? null);
      setArquivoLogo(null);
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, fornecedor]);

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
      let foto_url: string | null = logoUrlAtual ?? null;
      if (arquivoLogo) {
        const up = await api.upload(arquivoLogo);
        foto_url = up.url;
      }
      const payload: Record<string, unknown> = {
        ...form,
        foto_url,
        cpf_cnpj: form.cpf_cnpj ? form.cpf_cnpj.replace(/\D/g, "") : undefined,
        observacoes: form.observacoes || undefined,
        site: form.site || undefined,
      };
      // Remove campos vazios de endereço para não poluir o banco.
      ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "nome_fantasia", "telefone", "email", "contato"].forEach(
        (k) => {
          if (!(payload as Record<string, unknown>)[k]) delete payload[k];
        }
      );
      if (fornecedor) {
        await api.updateFornecedor(fornecedor.id, payload);
        toast.success("Fornecedor atualizado.");
      } else {
        await api.createFornecedor(payload);
        toast.success("Fornecedor cadastrado.");
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
      titulo={fornecedor ? "Editar fornecedor" : "Novo fornecedor"}
      largura="max-w-2xl"
      rodape={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form="form-fornecedor" className="btn btn-primary" disabled={salvando}>
            {salvando ? "Salvando…" : fornecedor ? "Salvar alterações" : "Cadastrar fornecedor"}
          </button>
        </>
      }
    >
      <form id="form-fornecedor" onSubmit={enviar} className="space-y-7">
        <Secao titulo="Imagem / logotipo">
          <UploadImagem
            valorInicial={logoUrlAtual}
            onMudar={(file) => setArquivoLogo(file)}
            alt={form.razao_social ? `Logo ${form.razao_social}` : "Logo do fornecedor"}
          />
          <p className="text-meta text-text-subtle">Opcional. Logotipo ou imagem do fornecedor.</p>
        </Secao>

        <Secao titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Razão social *">
              <input required {...campo("razao_social")} placeholder="Ex.: Distribuidora XYZ LTDA" />
            </Label>
            <Label texto="Nome fantasia">
              <input {...campo("nome_fantasia")} placeholder="Ex.: XYZ Combustíveis" />
            </Label>
            <Label texto="CPF/CNPJ">
              <input {...campo("cpf_cnpj")} placeholder="00.000.000/0000-00" />
            </Label>
            <Label texto="Categoria">
              <select {...campo("categoria")}>
                {Object.entries(CATEGORIAS_FORNECEDOR).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Label>
          </div>
        </Secao>

        <Secao titulo="Contato">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label texto="Telefone">
              <input {...campo("telefone")} placeholder="(11) 99999-0000" />
            </Label>
            <Label texto="E-mail">
              <input type="email" {...campo("email")} />
            </Label>
            <Label texto="Nome do contato">
              <input {...campo("contato")} placeholder="Ex.: Ana Paula" />
            </Label>
            <Label texto="Site (opcional)">
              <input {...campo("site")} placeholder="https://…" />
            </Label>
          </div>
        </Secao>

        <Secao titulo="Endereço">
          <div className="grid gap-3 sm:grid-cols-3">
            <Label texto="CEP">
              <input {...campo("cep")} placeholder="00000-000" />
            </Label>
            <Label texto="Logradouro" classe="sm:col-span-2">
              <input {...campo("logradouro")} />
            </Label>
            <Label texto="Número">
              <input {...campo("numero")} />
            </Label>
            <Label texto="Complemento">
              <input {...campo("complemento")} />
            </Label>
            <Label texto="Bairro">
              <input {...campo("bairro")} />
            </Label>
            <Label texto="Cidade">
              <input {...campo("cidade")} />
            </Label>
            <Label texto="UF">
              <input maxLength={2} {...campo("uf")} placeholder="SP" className="input uppercase" />
            </Label>
          </div>
        </Secao>

        <Secao titulo="Observações">
          <Label texto="Observações">
            <textarea rows={3} {...campo("observacoes")} />
          </Label>
        </Secao>
      </form>
    </Drawer>
  );
}
