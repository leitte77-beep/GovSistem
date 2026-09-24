/**
 * Cliente HTTP central do GovInfra.
 *
 * A URL da API nunca é fixada no código: vem de `VITE_GOVINFRA_API_URL`
 * (gravado pelo resolvedor de portas). Sem a variável, usa caminho relativo —
 * o que funciona atrás do nginx do Docker e do proxy do Vite.
 *
 * A sessão é única: o token chega da plataforma GovSistem (login único) via
 * `?token=` na URL ou pela ponte de desenvolvimento. O GovInfra não emite nem
 * renova tokens próprios na interface.
 */

const BASE = (import.meta.env.VITE_GOVINFRA_API_URL as string | undefined)?.replace(/\/$/, '') || '';
export const PREFIXO = '/api/govinfra/v1';

export const URL_GOVSISTEM = 'https://admin.govsistem.com.br/';

const CHAVE_ACESSO = 'govinfra.token';

export class ErroApi extends Error {
  status: number;
  codigo: string;
  campos: { campo: string; detalhe: string }[];
  corpo: any;

  constructor(status: number, corpo: any) {
    super(corpo?.mensagem || 'Não foi possível concluir a operação.');
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = corpo?.erro || 'erro';
    this.campos = corpo?.campos || [];
    this.corpo = corpo;
  }
}

export const sessao = {
  token: () => localStorage.getItem(CHAVE_ACESSO),
  gravar(acesso: string) {
    localStorage.setItem(CHAVE_ACESSO, acesso);
  },
  limpar() {
    localStorage.removeItem(CHAVE_ACESSO);
  },
};

// Captura o token do SSO (`?token=`) ANTES de o React montar (mesmo motivo do
// GovDoc: a navegação do catch-all limparia a query string).
try {
  const tokenDaUrl = new URLSearchParams(window.location.search).get('token');
  if (tokenDaUrl) {
    sessao.gravar(tokenDaUrl);
    window.history.replaceState({}, '', window.location.pathname);
  }
} catch { /* URL inválida ou armazenamento indisponível: segue sem token */ }

type Opcoes = {
  metodo?: string;
  corpo?: unknown;
  formulario?: FormData;
  publico?: boolean;
  bruto?: boolean;
  sinal?: AbortSignal;
};

export async function requisitar<T = any>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, formulario, publico = false, bruto = false, sinal } = opcoes;
  const url = caminho.startsWith('http') ? caminho : `${BASE}${caminho.startsWith('/api') ? '' : PREFIXO}${caminho}`;

  const executar = async (): Promise<Response> => {
    const cabecalhos: Record<string, string> = {};
    if (!publico) {
      const token = sessao.token();
      if (token) cabecalhos.Authorization = `Bearer ${token}`;
    }
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    return fetch(url, {
      method: metodo,
      headers: cabecalhos,
      body: formulario ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
      signal: sinal,
    });
  };

  let resposta = await executar();

  if (resposta.status === 401 && !publico) {
    sessao.limpar();
    if (!location.pathname.startsWith('/entrar')) {
      location.href = '/entrar';
    }
  }

  if (bruto) {
    if (!resposta.ok) throw new ErroApi(resposta.status, await lerJson(resposta));
    return resposta as unknown as T;
  }

  if (resposta.status === 204) return undefined as T;

  const dados = await lerJson(resposta);
  if (!resposta.ok) throw new ErroApi(resposta.status, dados);
  return dados as T;
}

async function lerJson(resposta: Response) {
  try {
    return await resposta.json();
  } catch {
    return { mensagem: 'Resposta inesperada do servidor.' };
  }
}

export const api = {
  get: <T = any>(caminho: string, sinal?: AbortSignal) => requisitar<T>(caminho, { sinal }),
  post: <T = any>(caminho: string, corpo?: unknown) => requisitar<T>(caminho, { metodo: 'POST', corpo }),
  put: <T = any>(caminho: string, corpo?: unknown) => requisitar<T>(caminho, { metodo: 'PUT', corpo }),
  del: <T = any>(caminho: string, corpo?: unknown) => requisitar<T>(caminho, { metodo: 'DELETE', corpo }),
  publico: <T = any>(caminho: string, metodo = 'GET', corpo?: unknown) =>
    requisitar<T>(caminho, { metodo, corpo, publico: true }),
};

/** Envio de arquivo com progresso — usa XHR porque o fetch não reporta upload. */
export function enviarArquivo(
  caminho: string,
  formulario: FormData,
  aoProgredir?: (porcentagem: number) => void,
): { promessa: Promise<any>; cancelar: () => void } {
  const xhr = new XMLHttpRequest();
  const promessa = new Promise<any>((resolver, rejeitar) => {
    xhr.open('POST', `${BASE}${PREFIXO}${caminho}`);
    const token = sessao.token();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && aoProgredir) {
        aoProgredir(Math.round((evento.loaded / evento.total) * 100));
      }
    };
    xhr.onload = () => {
      let dados: any = {};
      try {
        dados = JSON.parse(xhr.responseText);
      } catch {
        dados = { mensagem: 'Resposta inesperada do servidor.' };
      }
      if (xhr.status >= 200 && xhr.status < 300) resolver(dados);
      else rejeitar(new ErroApi(xhr.status, dados));
    };
    xhr.onerror = () => rejeitar(new ErroApi(0, { mensagem: 'Falha de conexão com o servidor.' }));
    xhr.onabort = () => rejeitar(new ErroApi(0, { mensagem: 'Envio cancelado.', erro: 'cancelado' }));
    xhr.send(formulario);
  });
  return { promessa, cancelar: () => xhr.abort() };
}

/** Baixa um arquivo autenticado preservando o nome enviado pelo servidor. */
export async function baixar(caminho: string, nomeSugerido: string) {
  const resposta = (await requisitar<Response>(caminho, { bruto: true })) as unknown as Response;
  const blob = await resposta.blob();
  const disposicao = resposta.headers.get('Content-Disposition') || '';
  const encontrado = /filename="?([^"]+)"?/.exec(disposicao);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = encontrado ? encontrado[1] : nomeSugerido;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function urlPublica(caminho: string) {
  return `${BASE}${PREFIXO}${caminho}`;
}
