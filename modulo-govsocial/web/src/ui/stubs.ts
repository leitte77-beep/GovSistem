// Stub types — these match the runtime exports from compiled dist bundles

// @/ui/Chip → dist/Chip-B3bKZxwH.js (exports {C as default} → used as Chip)
export type CorChip = "neutro" | "primario" | "amber" | "danger" | "sensitive" | "paif" | "scfv" | "paefi" | "mse" | "beneficio" | "encaminhamento" | "visita";
export function Chip(_props: { cor?: CorChip; icone?: React.ReactNode; children?: React.ReactNode; className?: string }): React.ReactElement { return null as any; }

// @/ui/Botao → dist/index-CussEIir.js (exports Botao)
export function Botao(_props: any): React.ReactElement { return null as any; }

// @/ui/Skeleton → dist/index-CussEIir.js (exports Skeleton)
export function Skeleton(_props: { variante?: string; linhas?: number; className?: string }): React.ReactElement { return null as any; }

// @/ui/EstadoErro → dist/EstadoErro-D7x700xh.js
export function EstadoErro(_props: { problema: any; aoTentarNovamente?: () => void }): React.ReactElement { return null as any; }

// @/ui/EstadoVazio → dist/EstadoVazio-Dr6Yr2nJ.js
export function EstadoVazio(_props: { titulo: string; descricao?: string; acao?: { rotulo: string; aoClicar: () => void }; icone?: React.ReactNode }): React.ReactElement { return null as any; }

// @/ui/SlideOver → dist/SlideOver-CFgAN81O.js
export function SlideOver(_props: { aberto: boolean; aoFechar: () => void; titulo: string; largura?: string; children?: React.ReactNode; rodape?: React.ReactNode }): React.ReactElement { return null as any; }
