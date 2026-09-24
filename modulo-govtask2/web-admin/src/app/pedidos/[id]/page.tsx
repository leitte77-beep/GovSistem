"use client";

/**
 * A tela do pedido, organizada por pergunta — não por entidade.
 *
 *   Cabeçalho   onde está, há quanto tempo, por quê, e o caminho percorrido
 *   Tramitação  o vai e vem, com quem está e o que fazer agora
 *   Documentos  o papelório, por encaminhamento, com upload
 *   Medições    o avanço da obra, com fotos (só para OBRA)
 *   Histórico   a linha do tempo, que só cresce
 *   Dados       origem, emenda, protocolo e financeiro
 *
 * Cada seção vive em `components/pedido/`. A tela se atualiza sozinha quando
 * outra pessoa mexe no pedido (tempo real).
 */

import { CornerUpLeft, Hand, Send } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { CardConquista } from "@/components/CardConquista";
import { Abas, type Aba } from "@/components/pedido/Abas";
import { Cabecalho } from "@/components/pedido/Cabecalho";
import { AbaDados } from "@/components/pedido/Dados";
import { AbaDocumentos } from "@/components/pedido/Documentos";
import { AbaHistorico } from "@/components/pedido/Historico";
import { AbaMedicoes } from "@/components/pedido/Medicoes";
import { AbaTramitacao } from "@/components/pedido/Tramitacao";
import { VisualizadorProvider } from "@/components/pedido/Visualizador";
import { api, type Pedido, type UsuarioResumo } from "@/lib/api";
import { useSessao } from "@/lib/sessao";
import { useAoMudar } from "@/lib/tempoReal";

export default function DetalheDoPedido() {
  const { id } = useParams<{ id: string }>();
  const { eu } = useSessao();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [limite, setLimite] = useState(15);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("tramitacao");
  const [vistoEm, setVistoEm] = useState<string | null>(null);

  // Última visita a este pedido, para marcar o que é novo. Grava a visita
  // atual ao sair (ou trocar de pedido).
  useEffect(() => {
    const chave = `govtask_visto_${id}`;
    try {
      setVistoEm(localStorage.getItem(chave));
    } catch {
      /* sem storage: nada é marcado como novo */
    }
    return () => {
      try {
        localStorage.setItem(chave, new Date().toISOString());
      } catch {
        /* ignora */
      }
    };
  }, [id]);

  const carregar = useCallback(
    () => api.obter(id).then(setPedido).catch((e) => setErro(e.message)),
    [id]
  );

  // Atalho vindo da Central (?acao=encaminhar): abre a ação assim que o pedido carrega.
  const carregado = pedido !== null;
  useEffect(() => {
    if (!carregado) return;
    const acao = new URLSearchParams(window.location.search).get("acao");
    if (!acao) return;
    window.history.replaceState({}, "", window.location.pathname);
    const t = setTimeout(
      () => window.dispatchEvent(new CustomEvent("govtask:acao", { detail: acao })),
      300
    );
    return () => clearTimeout(t);
  }, [carregado]);

  useEffect(() => {
    carregar();
    api.usuarios().then(setUsuarios).catch(() => setUsuarios([]));
    api.ajustes().then((a) => setLimite(a.dias_alerta_parado)).catch(() => {});
  }, [carregar]);

  useAoMudar(
    () => {
      carregar();
      toast("Este pedido acabou de ser atualizado.", { icon: "🔄", id: `atualizado-${id}` });
    },
    (p) => p.id === id
  );

  if (erro) return <p className="cartao p-6 text-sm text-estado-atrasado">{erro}</p>;
  if (!pedido) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="esqueleto h-5 w-40" />
        <div className="esqueleto h-72 rounded-card" />
        <div className="esqueleto h-12 rounded-card" />
        <div className="esqueleto h-96 rounded-card" />
      </div>
    );
  }

  const enc = pedido.encaminhamento_atual;
  const souDono = Boolean(enc && (enc.responsavel?.id === eu?.id || enc.participantes.some((p) => p.id === eu?.id)));
  const acaoPrincipal =
    eu?.pode_encaminhar && pedido.situacao === "COM_ASSESSOR"
      ? { rotulo: "Encaminhar a um setor", icone: Send, evento: "encaminhar" }
      : enc?.status === "EM_EXECUCAO" && souDono
        ? { rotulo: "Escrever resposta e devolver", icone: CornerUpLeft, evento: "responder" }
        : enc?.status === "AGUARDANDO" && eu?.pode_trabalhar && eu.setor === enc.setor
          ? { rotulo: "Assumir tarefa", icone: Hand, evento: "assumir" }
          : null;

  function executarAcao(evento: string) {
    setAba("tramitacao");
    setTimeout(() => window.dispatchEvent(new CustomEvent("govtask:acao", { detail: evento })), 50);
  }

  return (
    <VisualizadorProvider pedidoId={pedido.id}>
    <div className="animate-fade-subir space-y-5">
      <Cabecalho
        pedido={pedido}
        eu={eu}
        limite={limite}
        aoAtualizar={setPedido}
        aoDespachar={acaoPrincipal ? () => executarAcao(acaoPrincipal.evento) : undefined}
      />
      <CardConquista pedido={pedido} />

      <Abas aba={aba} setAba={setAba} pedido={pedido} vistoEm={vistoEm} />

      <div id="painel-pedido" role="tabpanel" aria-labelledby={`aba-${aba}`} tabIndex={0}>
        {aba === "tramitacao" && (
          <AbaTramitacao pedido={pedido} eu={eu} usuarios={usuarios} aoAtualizar={setPedido} />
        )}
        {aba === "documentos" && (
          <AbaDocumentos pedido={pedido} eu={eu} aoAtualizar={setPedido} />
        )}
        {aba === "medicoes" && <AbaMedicoes pedido={pedido} eu={eu} aoAtualizar={setPedido} />}
        {aba === "historico" && <AbaHistorico pedido={pedido} usuarios={usuarios} aoAtualizar={setPedido} />}
        {aba === "dados" && <AbaDados pedido={pedido} eu={eu} aoAtualizar={setPedido} />}
      </div>

      {acaoPrincipal && (
        <div className="pb-seguro fixed inset-x-0 bottom-[3.9rem] z-20 border-t border-line bg-paper/95 px-4 pt-2 backdrop-blur lg:hidden print:hidden">
          <button className="botao-primario w-full py-2.5" onClick={() => executarAcao(acaoPrincipal.evento)}>
            <acaoPrincipal.icone size={16} /> {acaoPrincipal.rotulo}
          </button>
        </div>
      )}
    </div>
    </VisualizadorProvider>
  );
}
