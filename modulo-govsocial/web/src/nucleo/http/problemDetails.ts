export class ErroApi extends Error {
  problema: any;
  offline: boolean;
  constructor(problema: any, offline?: boolean) { super(""); this.problema = problema; this.offline = offline ?? false; }
}
