import { ErroApi } from "@/nucleo/http/problemDetails";
import { criarAtendimento } from "@/nucleo/api/atendimento";
import { servicoGrupos } from "@/nucleo/api/grupos";
import { apagarRascunho } from "./rascunhos";
import {
  listarFila,
  registrarTentativa,
  removerDaFila,
  type ItemFila,
} from "./filaSync";

/**
 * Processa a fila de sincronização (§9/§10). Chamado ao reconectar.
 * - Sucesso: remove o item e apaga o rascunho associado.
 * - Conflito (409): "servidor vence" — remove o item mas PRESERVA o rascunho
 *   local para o usuário revisar.
 * - Erro de rede/transitório: mantém o item para nova tentativa depois.
 */
export type PayloadCriarAtendimentoFila = {
  case_file_id: string;
  atendimento: import("@/nucleo/api/atendimento").PayloadAtendimento;
  usuarioId: string;
  registroId: string;
};

export type PayloadFrequenciaFila = {
  acao_id: string;
  encontro_id: string;
  registros: import("@/tipos/grupos").FrequenciaRegistro[];
};

let processando = false;

async function processarItem(item: ItemFila): Promise<"ok" | "conflito" | "reter"> {
  try {
    if (item.tipo === "criar_atendimento") {
      const p = item.payload as PayloadCriarAtendimentoFila;
      await criarAtendimento(p.case_file_id, p.atendimento, item.chaveIdempotencia);
    } else if (item.tipo === "registrar_frequencia") {
      const p = item.payload as PayloadFrequenciaFila;
      await servicoGrupos.registrarFrequencia(
        p.acao_id,
        p.encontro_id,
        p.registros,
        item.chaveIdempotencia,
      );
    }
    return "ok";
  } catch (e) {
    if (e instanceof ErroApi) {
      if (e.problema.status === 409) return "conflito";
      // 4xx (exceto 409) não se resolve reenviando: descarta para não travar a fila.
      if (e.problema.status >= 400 && e.problema.status < 500) return "conflito";
    }
    return "reter";
  }
}

export async function sincronizarFila(): Promise<{ enviados: number; retidos: number }> {
  if (processando) return { enviados: 0, retidos: 0 };
  processando = true;
  let enviados = 0;
  let retidos = 0;
  try {
    const itens = await listarFila();
    for (const item of itens) {
      const r = await processarItem(item);
      if (r === "ok" || r === "conflito") {
        await removerDaFila(item.id);
        if (item.rascunhoChave) {
          // Sucesso: apaga rascunho. Conflito: mantém para o usuário decidir.
          if (r === "ok") await apagarRascunhoPorChave(item.rascunhoChave);
        }
        enviados += r === "ok" ? 1 : 0;
      } else {
        await registrarTentativa(item);
        retidos += 1;
      }
    }
  } finally {
    processando = false;
  }
  return { enviados, retidos };
}

async function apagarRascunhoPorChave(chave: string) {
  const [usuarioId, tipo, registroId] = chave.split("|");
  if (usuarioId && tipo && registroId) {
    await apagarRascunho(usuarioId, tipo, registroId);
  }
}
