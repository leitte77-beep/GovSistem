"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { HipoteseLegal, TipoProcesso, Unidade } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";

interface InteressadoForm {
  tipo_pessoa: string;
  nome: string;
  cpf_cnpj: string;
  email: string;
}

export default function NovoProcessoPage() {
  const router = useRouter();
  const [tipos, setTipos] = useState<TipoProcesso[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [hipoteses, setHipoteses] = useState<HipoteseLegal[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  const [tipoProcessoId, setTipoProcessoId] = useState("");
  const [especificacao, setEspecificacao] = useState("");
  const [nivelAcesso, setNivelAcesso] = useState("PUBLICO");
  const [hipoteseLegalId, setHipoteseLegalId] = useState("");
  const [unidadeProtocolizadoraId, setUnidadeProtocolizadoraId] = useState("");
  const [interessados, setInteressados] = useState<InteressadoForm[]>([
    { tipo_pessoa: "PF", nome: "", cpf_cnpj: "", email: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.listTiposProcesso(),
      api.listUnidades(),
      api.listHipotesesLegais(),
    ])
      .then(([t, u, h]) => {
        setTipos(t);
        setUnidades(u);
        setHipoteses(h);
        const protocolo = u.find((x) => x.protocolizadora);
        if (protocolo) setUnidadeProtocolizadoraId(protocolo.id);
      })
      .catch(() => {
        toast.error("Falha ao carregar catálogos");
      })
      .finally(() => setLoadingCatalogs(false));
  }, []);

  const tipoSelecionado = tipos.find((t) => t.id === tipoProcessoId);

  const atualizarInteressado = (i: number, campo: keyof InteressadoForm, valor: string) => {
    setInteressados((prev) => prev.map((item, idx) => (idx === i ? { ...item, [campo]: valor } : item)));
  };

  const adicionarInteressado = () =>
    setInteressados((prev) => [...prev, { tipo_pessoa: "PF", nome: "", cpf_cnpj: "", email: "" }]);

  const removerInteressado = (i: number) =>
    setInteressados((prev) => prev.filter((_, idx) => idx !== i));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoProcessoId) {
      toast.error("Selecione o tipo de processo");
      return;
    }
    setSubmitting(true);
    try {
      const processo = await api.criarProcesso({
        tipo_processo_id: tipoProcessoId,
        especificacao,
        nivel_acesso: nivelAcesso as "PUBLICO" | "RESTRITO" | "SIGILOSO",
        hipotese_legal_id: hipoteseLegalId || null,
        unidade_protocolizadora_id: unidadeProtocolizadoraId || null,
        interessados: interessados
          .filter((i) => i.nome.trim())
          .map((i) => ({
            tipo_pessoa: i.tipo_pessoa,
            nome: i.nome.trim(),
            cpf_cnpj: i.cpf_cnpj.trim() || null,
            email: i.email.trim() || null,
          })),
      });
      toast.success(`Processo iniciado: ${processo.nup}`);
      router.push(`/processos/${processo.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar processo");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCatalogs) {
    return (
      <div className="px-gutter py-16 text-center text-on-surface-variant">Carregando catálogos…</div>
    );
  }

  const precisaHipotese = nivelAcesso !== "PUBLICO";

  return (
    <div className="pb-stack-lg">
      <PageHeader title="Iniciar Processo" subtitle="Gera o NUP e dá início ao processo administrativo." />

      <form onSubmit={onSubmit} className="px-gutter max-w-container-max mx-auto space-y-stack-md">
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2 space-y-2">
            <label htmlFor="tipo" className="text-label-md font-label-md text-on-surface">
              Tipo de processo <span className="text-error">*</span>
            </label>
            <select
              id="tipo"
              required
              value={tipoProcessoId}
              onChange={(e) => setTipoProcessoId(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecione…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
            {tipoSelecionado?.base_legal && (
              <p className="text-body-sm text-on-surface-variant">Base legal: {tipoSelecionado.base_legal}</p>
            )}
          </div>

          <div className="md:col-span-2 space-y-2">
            <label htmlFor="especificacao" className="text-label-md font-label-md text-on-surface">
              Especificação <span className="text-error">*</span>
            </label>
            <input
              id="especificacao"
              required
              minLength={3}
              maxLength={500}
              value={especificacao}
              onChange={(e) => setEspecificacao(e.target.value)}
              placeholder="Descreva o objeto do processo"
              className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="nivel" className="text-label-md font-label-md text-on-surface">
              Nível de acesso
            </label>
            <select
              id="nivel"
              value={nivelAcesso}
              onChange={(e) => setNivelAcesso(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="PUBLICO">Público</option>
              <option value="RESTRITO">Restrito</option>
              <option value="SIGILOSO">Sigiloso</option>
            </select>
            <p className="text-body-sm text-on-surface-variant">Publicidade é a regra (LAI).</p>
          </div>

          {precisaHipotese && (
            <div className="space-y-2">
              <label htmlFor="hipotese" className="text-label-md font-label-md text-on-surface">
                Hipótese legal <span className="text-error">*</span>
              </label>
              <select
                id="hipotese"
                required
                value={hipoteseLegalId}
                onChange={(e) => setHipoteseLegalId(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione…</option>
                {hipoteses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.descricao}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="protocolo" className="text-label-md font-label-md text-on-surface">
              Unidade protocolizadora
            </label>
            <select
              id="protocolo"
              value={unidadeProtocolizadoraId}
              onChange={(e) => setUnidadeProtocolizadoraId(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecione…</option>
              {unidades
                .filter((u) => u.protocolizadora)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.sigla})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-headline-sm font-headline-sm text-on-surface">Interessados</h2>
            <button
              type="button"
              onClick={adicionarInteressado}
              className="inline-flex items-center gap-2 h-10 px-3 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">person_add</span>
              Adicionar
            </button>
          </div>

          <div className="space-y-4">
            {interessados.map((item, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-label-md font-label-md text-on-surface">Tipo</label>
                  <select
                    value={item.tipo_pessoa}
                    onChange={(e) => atualizarInteressado(i, "tipo_pessoa", e.target.value)}
                    className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg"
                  >
                    <option value="PF">Pessoa física</option>
                    <option value="PJ">Pessoa jurídica</option>
                  </select>
                </div>
                <div className="md:col-span-4">
                  <label className="text-label-md font-label-md text-on-surface">Nome</label>
                  <input
                    value={item.nome}
                    onChange={(e) => atualizarInteressado(i, "nome", e.target.value)}
                    className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-label-md font-label-md text-on-surface">CPF/CNPJ</label>
                  <input
                    value={item.cpf_cnpj}
                    onChange={(e) => atualizarInteressado(i, "cpf_cnpj", e.target.value)}
                    className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-label-md font-label-md text-on-surface">E-mail</label>
                  <input
                    type="email"
                    value={item.email}
                    onChange={(e) => atualizarInteressado(i, "email", e.target.value)}
                    className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg"
                  />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removerInteressado(i)}
                    disabled={interessados.length === 1}
                    aria-label="Remover interessado"
                    className="w-12 h-12 flex items-center justify-center text-error hover:bg-error-container rounded-lg transition-colors disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-12 px-5 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="h-12 px-6 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
          >
            {submitting ? "Iniciando…" : "Iniciar Processo"}
          </button>
        </div>
      </form>
    </div>
  );
}
