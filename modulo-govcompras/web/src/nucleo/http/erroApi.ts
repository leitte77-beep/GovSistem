export interface CampoInvalido {
  campo: string;
  detalhe: string;
}

export class ErroApi extends Error {
  codigo: string;
  status: number;
  campos: CampoInvalido[];
  pendencias?: { descricao: string; satisfeito: boolean; obrigatorio: boolean }[];

  constructor(
    mensagem: string,
    codigo: string,
    status: number,
    campos: CampoInvalido[] = [],
    pendencias?: ErroApi["pendencias"],
  ) {
    super(mensagem);
    this.name = "ErroApi";
    this.codigo = codigo;
    this.status = status;
    this.campos = campos;
    this.pendencias = pendencias;
  }
}
