"use client";

/**
 * Documentos do pedido.
 *
 * Grade com miniatura (fotos e PDFs) ou lista densa; filtro por tipo e por
 * nome; agrupado por tarefa, na ordem do vai e vem. Cada documento abre no
 * visualizador; versões anteriores ficam recolhidas sob a mais recente.
 * Excluir pede motivo, que vai para o histórico.
 */

import clsx from "clsx";
import {
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  History,
  LayoutGrid,
  List,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { api, type Anexo, type Eu, type Pedido } from "@/lib/api";
import { ROTULO_TIPO_DOCUMENTO, relativo, tamanho } from "@/lib/formato";
import { useNomeSetor } from "@/lib/setores";

import { EnvioDeArquivos } from "./Envio";
import { ModalTexto } from "./Modais";
import { useVisualizador } from "./Visualizador";

const CHAVE_MODO = "govtask_docs_modo";

function iconeDo(anexo: Anexo) {
  const n = anexo.nome_original.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(n)) return FileImage;
  if (/\.(xlsx?|ods|csv)$/.test(n)) return FileSpreadsheet;
  if (/\.(zip|rar|7z)$/.test(n)) return FileArchive;
  return FileText;
}

const ehImagem = (a: Anexo) => /\.(jpe?g|png|webp)$/i.test(a.nome_original);

/** Agrupa versões do mesmo documento: a mais nova na frente, as outras atrás. */
function comVersoes(anexos: Anexo[]) {
  const grupos = new Map<string, Anexo[]>();
  for (const a of anexos) {
    const chave = `${a.encaminhamento_id}|${(a.descricao || a.nome_original).toLowerCase()}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return [...grupos.values()].map((g) => {
    const ordenado = [...g].sort((x, y) => y.versao - x.versao);
    return { atual: ordenado[0], anteriores: ordenado.slice(1) };
  });
}

export function AbaDocumentos({
  pedido,
  eu,
  aoAtualizar,
}: {
  pedido: Pedido;
  eu: Eu | null;
  aoAtualizar: (p: Pedido) => void;
}) {
  const nomeSetor = useNomeSetor();
  const { abrir } = useVisualizador();
  const [modo, setModo] = useState<"grade" | "lista">("grade");
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [destino, setDestino] = useState<string>(pedido.encaminhamento_atual?.id ?? "");
  const [removendo, setRemovendo] = useState<Anexo | null>(null);

  useEffect(() => {
    try {
      const m = localStorage.getItem(CHAVE_MODO);
      if (m === "lista" || m === "grade") setModo(m);
    } catch {
      /* padrão: grade */
    }
  }, []);
  function mudarModo(m: "grade" | "lista") {
    setModo(m);
    try {
      localStorage.setItem(CHAVE_MODO, m);
    } catch {
      /* ignora */
    }
  }

  const podeEnviar =
    !["CONCLUIDO", "CANCELADO"].includes(pedido.situacao) && Boolean(eu?.pode_encaminhar || eu?.pode_trabalhar);
  const podeRemover = Boolean(eu?.pode_encaminhar);

  const filtrados = pedido.anexos.filter(
    (a) =>
      (!tipo || (a.tipo_documento ?? "OUTRO") === tipo) &&
      (!busca || `${a.nome_original} ${a.descricao ?? ""} ${a.legenda ?? ""}`.toLowerCase().includes(busca.toLowerCase()))
  );
  const contagemPorTipo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of pedido.anexos) c[a.tipo_documento ?? "OUTRO"] = (c[a.tipo_documento ?? "OUTRO"] ?? 0) + 1;
    return c;
  }, [pedido.anexos]);

  const grupos = [
    ...[...pedido.encaminhamentos]
      .sort((a, b) => b.ordem - a.ordem)
      .map((e) => ({
        chave: e.id,
        titulo: e.assunto,
        detalhe: nomeSetor(e.setor),
        anexos: filtrados.filter((a) => a.encaminhamento_id === e.id),
      })),
    { chave: "geral", titulo: "Documentos do pedido", detalhe: "sem tarefa", anexos: filtrados.filter((a) => !a.encaminhamento_id) },
  ].filter((g) => g.anexos.length > 0);

  const todos = grupos.flatMap((g) => comVersoes(g.anexos).map((v) => v.atual));

  return (
    <section className="space-y-4 pb-24">
      {podeEnviar && (
        <div className="cartao p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[17px] font-medium text-ink">Enviar documentos</h2>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              Anexar em
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink">
                {pedido.encaminhamentos
                  .slice()
                  .sort((a, b) => b.ordem - a.ordem)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      #{e.ordem} · {e.assunto}
                      {e.id === pedido.encaminhamento_atual?.id ? " (atual)" : ""}
                    </option>
                  ))}
                <option value="">Documentos do pedido (sem tarefa)</option>
              </select>
            </label>
          </div>
          <EnvioDeArquivos pedido={pedido} encaminhamentoId={destino || undefined} aoAtualizar={aoAtualizar} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento…" className="campo h-9 pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Filtro ativo={!tipo} onClick={() => setTipo("")} rotulo="Todos" n={pedido.anexos.length} />
          {Object.entries(contagemPorTipo).map(([t, n]) => (
            <Filtro key={t} ativo={tipo === t} onClick={() => setTipo(t)} rotulo={ROTULO_TIPO_DOCUMENTO[t] ?? t} n={n} />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pedido.anexos.length > 0 && (
            <button className="botao-secundario px-3 py-1.5 text-xs" onClick={() => api.baixarTodos(pedido.id, pedido.numero).catch((e) => toast.error(e.message))}>
              <FileArchive size={14} /> Baixar tudo (.zip)
            </button>
          )}
          <div className="flex rounded-btn border border-line p-0.5">
            {(
              [
                ["grade", LayoutGrid],
                ["lista", List],
              ] as const
            ).map(([m, Icone]) => (
              <button
                key={m}
                onClick={() => mudarModo(m)}
                className={clsx("grid h-7 w-8 place-items-center rounded-[7px]", modo === m ? "bg-brand-50 text-brand" : "text-ink-faint hover:text-ink")}
                aria-label={m === "grade" ? "Grade" : "Lista"}
              >
                <Icone size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="cartao flex flex-col items-center gap-2 p-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-faint">
            <FileText size={20} />
          </span>
          <p className="text-sm text-ink-muted">{pedido.anexos.length ? "Nenhum documento com esse filtro." : "Nenhum documento enviado ainda."}</p>
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.chave} className="cartao overflow-hidden">
            <header className="flex items-center justify-between gap-2 border-b border-line bg-canvas/40 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FolderOpen size={16} className="shrink-0 text-brand" aria-hidden />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-ink">{g.titulo}</h3>
                  <p className="truncate text-xs text-ink-muted">{g.detalhe}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-faint">
                {g.anexos.length} {g.anexos.length === 1 ? "arquivo" : "arquivos"}
              </span>
            </header>
            {modo === "grade" ? (
              <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                {comVersoes(g.anexos).map(({ atual, anteriores }) => (
                  <CartaoDoc
                    key={atual.id}
                    pedido={pedido}
                    anexo={atual}
                    anteriores={anteriores}
                    abrir={(a) => abrir(a, todos.concat(anteriores))}
                    podeRemover={podeRemover}
                    podeClassificar={podeEnviar}
                    aoRemover={setRemovendo}
                    aoAtualizar={aoAtualizar}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-line">
                {comVersoes(g.anexos).map(({ atual, anteriores }) => (
                  <LinhaDoc
                    key={atual.id}
                    pedido={pedido}
                    anexo={atual}
                    anteriores={anteriores}
                    abrir={(a) => abrir(a, todos.concat(anteriores))}
                    podeRemover={podeRemover}
                    podeClassificar={podeEnviar}
                    aoRemover={setRemovendo}
                    aoAtualizar={aoAtualizar}
                  />
                ))}
              </ul>
            )}
          </div>
        ))
      )}

      {removendo && (
        <ModalTexto
          titulo={`Excluir “${removendo.nome_original}”`}
          rotulo="Motivo da exclusão (fica no histórico)"
          placeholder="Ex.: enviado por engano, versão errada."
          confirmar="Excluir documento"
          aoFechar={() => setRemovendo(null)}
          aoConfirmar={async (motivo) => {
            aoAtualizar(await api.removerAnexo(pedido.id, removendo.id, motivo));
            toast.success("Documento excluído.");
          }}
        />
      )}
    </section>
  );
}

function Filtro({ ativo, onClick, rotulo, n }: { ativo: boolean; onClick: () => void; rotulo: string; n: number }) {
  return (
    <button
      onClick={onClick}
      className={clsx("rounded-pill px-3 py-1 text-xs font-medium transition", ativo ? "bg-brand text-white" : "border border-line bg-canvas text-ink-soft hover:border-line-strong")}
    >
      {rotulo} <span className={ativo ? "text-white/70" : "text-ink-faint"}>{n}</span>
    </button>
  );
}

function Miniatura({ pedido, anexo }: { pedido: Pedido; anexo: Anexo }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!ehImagem(anexo)) return;
    let criada: string | null = null;
    api
      .urlDaFoto(pedido.id, anexo.id)
      .then((u) => {
        criada = u;
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [pedido.id, anexo]);
  const Icone = iconeDo(anexo);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-full w-full object-cover" />;
  }
  const ext = anexo.nome_original.split(".").pop()?.toUpperCase();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-canvas to-brand-50">
      <Icone size={30} className="text-brand/50" />
      <span className="rounded bg-paper/80 px-1.5 text-[10px] font-semibold text-ink-muted">{ext}</span>
    </div>
  );
}

interface PropsDoc {
  pedido: Pedido;
  anexo: Anexo;
  anteriores: Anexo[];
  abrir: (a: Anexo) => void;
  podeRemover: boolean;
  podeClassificar: boolean;
  aoRemover: (a: Anexo) => void;
  aoAtualizar: (p: Pedido) => void;
}

function SeletorTipo({ pedido, anexo, podeClassificar, aoAtualizar }: PropsDoc) {
  const rotulo = ROTULO_TIPO_DOCUMENTO[anexo.tipo_documento ?? ""] ?? "Sem tipo";
  if (!podeClassificar) return <span className="etiqueta bg-ink/[.05] text-ink-muted">{rotulo}</span>;
  return (
    <select
      value={anexo.tipo_documento ?? ""}
      onChange={async (e) => {
        try {
          aoAtualizar(await api.classificarAnexo(pedido.id, anexo.id, { tipo_documento: e.target.value || null }));
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="rounded-pill border-0 bg-brand-50 py-0.5 pl-2 pr-6 text-[11px] font-medium text-brand-700 focus:ring-1 focus:ring-brand"
      aria-label="Tipo do documento"
    >
      <option value="">Sem tipo</option>
      {Object.entries(ROTULO_TIPO_DOCUMENTO).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

function Versoes({ anteriores, abrir }: { anteriores: Anexo[]; abrir: (a: Anexo) => void }) {
  const [aberto, setAberto] = useState(false);
  if (anteriores.length === 0) return null;
  return (
    <div>
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-brand">
        <History size={11} /> {anteriores.length} versão(ões) anterior(es)
      </button>
      {aberto && (
        <ul className="mt-1 space-y-0.5">
          {anteriores.map((a) => (
            <li key={a.id}>
              <button onClick={() => abrir(a)} className="text-[11px] text-ink-faint hover:text-brand hover:underline">
                v{a.versao} · {relativo(a.created_at)} · {a.enviado_por?.name ?? ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Acoes({ pedido, anexo, abrir, podeRemover, aoRemover }: PropsDoc) {
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={() => abrir(anexo)} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas hover:text-brand" aria-label="Visualizar" title="Visualizar">
        <Eye size={15} />
      </button>
      <button
        onClick={() => api.baixarAnexo(pedido.id, anexo).catch((e) => toast.error(e.message))}
        className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-canvas hover:text-brand"
        aria-label="Baixar"
        title="Baixar"
      >
        <Download size={15} />
      </button>
      {podeRemover && (
        <button onClick={() => aoRemover(anexo)} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-estado-atrasado/10 hover:text-estado-atrasado" aria-label="Excluir" title="Excluir">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function CartaoDoc(props: PropsDoc) {
  const { pedido, anexo, abrir, anteriores } = props;
  return (
    <li className="group flex flex-col overflow-hidden rounded-btn border border-line bg-paper transition hover:border-line-strong hover:shadow-pop">
      <button onClick={() => abrir(anexo)} className="relative aspect-[4/3] overflow-hidden bg-canvas" aria-label={`Visualizar ${anexo.nome_original}`}>
        <Miniatura pedido={pedido} anexo={anexo} />
        {anexo.versao > 1 && <span className="absolute right-1.5 top-1.5 rounded-pill bg-brand px-1.5 text-[10px] font-semibold text-white">v{anexo.versao}</span>}
        <span className="absolute inset-0 grid place-items-center bg-brand-900/0 opacity-0 transition group-hover:bg-brand-900/30 group-hover:opacity-100">
          <Eye size={22} className="text-white" />
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink" title={anexo.nome_original}>
          {anexo.legenda || anexo.nome_original}
        </p>
        <p className="text-[11px] text-ink-faint">
          {anexo.enviado_por?.name?.split(" ")[0] ?? "—"} · {relativo(anexo.created_at)} · {tamanho(anexo.tamanho_bytes)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-1">
          <SeletorTipo {...props} />
          <Acoes {...props} />
        </div>
        <Versoes anteriores={anteriores} abrir={abrir} />
      </div>
    </li>
  );
}

function LinhaDoc(props: PropsDoc) {
  const { anexo, abrir, anteriores } = props;
  const Icone = iconeDo(anexo);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
        <Icone size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <button onClick={() => abrir(anexo)} className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-brand">
          {anexo.nome_original}
          {anexo.versao > 1 && <span className="ml-1.5 text-xs text-brand">v{anexo.versao}</span>}
        </button>
        <p className="truncate text-xs text-ink-faint">
          {anexo.enviado_por?.name ?? "—"} · {relativo(anexo.created_at)} · {tamanho(anexo.tamanho_bytes)}
          {anexo.legenda ? ` · ${anexo.legenda}` : ""}
        </p>
        <Versoes anteriores={anteriores} abrir={abrir} />
      </div>
      <SeletorTipo {...props} />
      <Acoes {...props} />
    </li>
  );
}
