import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Botao } from "./Botao";

type ErroState = { erro: Error | null };

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Captura erros em runtime (ex.: falha ao carregar chunks lazy).
 * Previne tela branca em caso de code-splitting ou erro de render.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErroState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro: Error): ErroState {
    return { erro };
  }

  componentDidCatch(erro: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary capturou:", erro, info);
  }

  private aoRecarregarPagina = () => {
    window.location.reload();
  };

  private aoVoltarInicio = () => {
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  render() {
    if (this.state.erro) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div role="alert" className="flex min-h-screen items-center justify-center bg-paper p-6">
          <div className="flex flex-col items-center gap-4 rounded-cartao border border-ink-soft/15 bg-surface p-8 text-center max-w-md">
            <AlertTriangle className="h-10 w-10 text-danger" aria-hidden />
            <h2 className="text-xl font-bold text-ink">Algo deu errado</h2>
            <p className="text-sm text-ink-soft">
              Ocorreu um erro inesperado ao carregar esta página. Tente novamente.
            </p>
            {import.meta.env.DEV && (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-ink/5 p-3 text-left text-xs text-ink-soft">
                {this.state.erro.message}
              </pre>
            )}
            <div className="flex gap-2">
              <Botao variante="primario" onClick={this.aoRecarregarPagina}>
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Botao>
              <Botao variante="secundario" onClick={this.aoVoltarInicio}>
                <Home className="h-4 w-4" />
                Voltar ao início
              </Botao>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
