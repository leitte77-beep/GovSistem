"use client";

/**
 * Novo pedido. Seis campos, e só dois são obrigatórios.
 *
 * O Prefeito ou o Assessor cadastram em menos de um minuto, do celular,
 * logo depois da conversa com o deputado. O pedido nasce na mesa do
 * Assessor, que depois encaminha ao setor certo.
 */

import { Car, CheckCircle2, FileText, HardHat, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { CampoMoeda } from "@/components/CampoMoeda";
import { EditorDetalhes } from "@/components/EditorDetalhes";
import { api, type TipoPedido } from "@/lib/api";
import { ROTULO_ORIGEM } from "@/lib/formato";

const TIPOS: { tipo: TipoPedido; rotulo: string; apoio: string }[] = [
  { tipo: "AQUISICAO", rotulo: "Aquisição", apoio: "Veículo, equipamento, bem" },
  { tipo: "OBRA", rotulo: "Obra", apoio: "Pavimentação, reforma, construção" },
  { tipo: "OUTRO", rotulo: "Outro pedido formal", apoio: "Demanda que vira ofício" },
];

const ICONE: Record<string, typeof Car> = {
  AQUISICAO: Car,
  OBRA: HardHat,
  OUTRO: FileText,
};

export default function NovoPedido() {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoPedido>("AQUISICAO");
  const [origem, setOrigem] = useState("DEPUTADO");
  const [origemNome, setOrigemNome] = useState("");
  const [emenda, setEmenda] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    try {
      const pedido = await api.criar({
        titulo,
        tipo,
        origem,
        origem_nome: origemNome || null,
        emenda: emenda.trim() || null,
        valor_previsto: valor || null,
        descricao: descricao || null,
      });
      toast.success(`Pedido ${pedido.numero} aberto.`);
      router.push(`/pedidos/${pedido.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o pedido.");
      setSalvando(false);
    }
  }

  return (
    <div className="animate-fade-subir space-y-6">
      <CabecalhoPagina
        sobretitulo="GovTask"
        titulo="Novo pedido"
        descricao="Registre o que o Prefeito pediu. O resto se preenche no caminho."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <form onSubmit={enviar} className="cartao space-y-7 p-6 sm:p-7">
          <div>
            <label className="rotulo flex items-center gap-2" htmlFor="titulo">
              O que é?
              <span className="etiqueta bg-brand-50 text-brand-700">obrigatório</span>
            </label>
            <input
              id="titulo"
              className="campo text-base"
              required
              minLength={3}
              maxLength={255}
              placeholder="Ex.: Aquisição de carro doado pelo Deputado Fulano"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <fieldset>
            <legend className="rotulo">Tipo de pedido</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {TIPOS.map(({ tipo: t, rotulo, apoio }) => {
                const Icone = ICONE[t] ?? FileText;
                const ativo = tipo === t;
                return (
                  <label
                    key={t}
                    className={
                      ativo
                        ? "relative cursor-pointer rounded-card border-2 border-brand bg-brand-50 p-4 ring-2 ring-brand/10"
                        : "relative cursor-pointer rounded-card border border-line p-4 transition hover:border-brand/40 hover:bg-canvas"
                    }
                  >
                    <input
                      type="radio"
                      name="tipo"
                      className="sr-only"
                      checked={ativo}
                      onChange={() => setTipo(t)}
                    />
                    <div className="flex items-start justify-between">
                      <span
                        className={
                          ativo
                            ? "grid h-10 w-10 place-items-center rounded-btn bg-brand text-white"
                            : "grid h-10 w-10 place-items-center rounded-btn bg-ink/[.05] text-ink-muted"
                        }
                      >
                        <Icone size={19} aria-hidden />
                      </span>
                      {ativo && (
                        <CheckCircle2 size={18} className="text-brand" aria-label="Selecionado" />
                      )}
                    </div>
                    <span className="mt-3 block text-sm font-medium text-ink">{rotulo}</span>
                    <span
                      className={
                        ativo
                          ? "mt-1.5 inline-flex rounded-pill bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-700"
                          : "mt-1.5 inline-flex rounded-pill bg-ink/[.06] px-2 py-0.5 text-xs text-ink-muted"
                      }
                    >
                      {apoio}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="origem">
                Veio de onde?
              </label>
              <select
                id="origem"
                className="campo"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
              >
                {Object.entries(ROTULO_ORIGEM).map(([codigo, texto]) => (
                  <option key={codigo} value={codigo}>
                    {texto}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="origem_nome">
                Nome de quem conseguiu
              </label>
              <input
                id="origem_nome"
                className="campo"
                maxLength={180}
                placeholder="Ex.: Deputado Fulano de Tal"
                value={origemNome}
                onChange={(e) => setOrigemNome(e.target.value)}
              />
            </div>
          </div>

          {(origem === "DEPUTADO" || origem === "VEREADOR") && (
            <div className="animate-fade-subir">
              <label className="rotulo" htmlFor="emenda">
                Emenda parlamentar (opcional)
              </label>
              <input
                id="emenda"
                className="campo sm:max-w-xs"
                maxLength={80}
                placeholder="Ex.: EM 2026/00123"
                value={emenda}
                onChange={(e) => setEmenda(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="rotulo" htmlFor="valor">
              Valor previsto (R$)
            </label>
            <CampoMoeda
              id="valor"
              valor={valor}
              aoMudar={setValor}
              className="campo sm:max-w-xs"
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="descricao">
              Detalhes
            </label>
            <EditorDetalhes
              id="descricao"
              valor={descricao}
              aoMudar={setDescricao}
              maxLength={8000}
              placeholder="O que o Prefeito falou, para quem é, prazo combinado…"
            />
          </div>

          <div className="flex gap-3 border-t border-line pt-5">
            <button type="submit" className="botao-primario" disabled={salvando}>
              {salvando ? "Abrindo…" : "Abrir pedido"}
            </button>
            <button type="button" className="botao-secundario" onClick={() => router.back()}>
              Cancelar
            </button>
          </div>
        </form>

        <aside className="cartao h-fit overflow-hidden lg:sticky lg:top-6">
          <div className="border-b border-line bg-canvas/60 px-5 py-4">
            <h2 className="font-medium text-ink">Como o pedido anda</h2>
            <p className="mt-0.5 legenda">Vai e vem entre o Assessor e os setores.</p>
          </div>
          <ol className="space-y-4 p-5 text-sm">
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Send size={14} aria-hidden />
              </span>
              <span className="text-ink-soft">
                O pedido nasce na mesa do <strong className="font-medium text-ink">Assessor</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                2
              </span>
              <span className="text-ink-soft">
                O Assessor <strong className="font-medium text-ink">encaminha</strong> ao setor
                certo, com prazo.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                3
              </span>
              <span className="text-ink-soft">
                Alguém do setor <strong className="font-medium text-ink">assume</strong>, anexa o
                que fez e <strong className="font-medium text-ink">devolve</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brass-50 text-brass-700">
                4
              </span>
              <span className="text-ink-soft">
                O Assessor recebe de volta e decide o próximo encaminhamento — até concluir.
              </span>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
