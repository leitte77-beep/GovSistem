import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  ClipboardList,
  Eye,
  FileSignature,
  FileSpreadsheet,
  Fuel,
  Gauge,
  Gift,
  Globe,
  HardHat,
  HeartPulse,
  History,
  IdCard,
  Images,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  MessageSquare,
  Radio,
  Reply,
  Search,
  ShieldCheck,
  SmilePlus,
  Smartphone,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NewsItem {
  title: string;
  desc: string;
  icon: LucideIcon;
}

export interface ModuleNews {
  /** Nome exibido quando o módulo não está no contexto do usuário. */
  name: string;
  version: string;
  /** Data da publicação (AAAA-MM-DD), quando conhecida. */
  date?: string;
  /** Uma frase sobre o que esta versão muda para quem usa. */
  summary: string;
  items: NewsItem[];
  fixes: string[];
}

export const MODULE_NEWS: Record<string, ModuleNews> = {
  govtask: {
    name: "GovTask",
    version: "3.0.0",
    date: "2026-09-23",
    summary:
      "O GovTask foi refeito do zero em torno de uma ideia só: do pedido do Prefeito ao pagamento, com o Assessor no centro.",
    items: [
      {
        title: "O pedido vai e vem",
        desc: "O Assessor encaminha cada pedido ao setor que resolve (Jurídico, Engenharia, Licitação, Contabilidade, Tesouraria) e recebe de volta com o documento anexado.",
        icon: ArrowLeftRight,
      },
      {
        title: "Painel do Prefeito",
        desc: "Indicadores do dia, o feed \"Aconteceu agora\", modo telão e balanço pronto para imprimir.",
        icon: LayoutDashboard,
      },
      {
        title: "Atualização em tempo real",
        desc: "Painéis e pedidos se atualizam sozinhos quando alguém movimenta um pedido, sem recarregar a página.",
        icon: Radio,
      },
      {
        title: "Próxima ação e saúde do pedido",
        desc: "Cada pedido diz em uma frase qual é o próximo passo e avisa quando está em atenção ou crítico, com o motivo por escrito.",
        icon: HeartPulse,
      },
      {
        title: "Conversa dentro do pedido",
        desc: "Comentários, checklist e rascunho ficam junto do encaminhamento, sem depender de mensagens soltas.",
        icon: MessageSquare,
      },
      {
        title: "Documentos abertos na tela",
        desc: "Arquivos Word e PDF abrem direto no navegador, e anexar de novo o mesmo documento gera uma nova versão sem apagar a anterior.",
        icon: Eye,
      },
      {
        title: "Medições de obra com fotos",
        desc: "Em pedidos de obra, cada medição registra período, valor, percentual executado, responsável e fotos.",
        icon: HardHat,
      },
      {
        title: "Avisos e espera de terceiros",
        desc: "O sino avisa sobre assunções, transferências e prazos. Pedidos que dependem de órgão externo param de contar como atraso da prefeitura.",
        icon: Bell,
      },
      {
        title: "Relatórios em PDF e Excel",
        desc: "Relatório completo por pedido e listas consolidadas por setor, por período e de atrasados.",
        icon: FileSpreadsheet,
      },
    ],
    fixes: [
      "\"Outro pedido formal\" não pede mais o nome de quem conseguiu nem o valor previsto.",
      "Pedido parado passa a contar a partir da última mudança de situação ou de setor, e mostra o motivo.",
      "O Departamento vê, em modo leitura, os pedidos que já passaram pelo seu setor.",
      "O perfil definido nas Configurações do GovTask não se perde mais a cada login.",
    ],
  },
  govfrota: {
    name: "GovFrota",
    version: "1.0.0",
    summary:
      "Frota, combustível e manutenção em um só lugar, com um aplicativo simples para o motorista usar no celular.",
    items: [
      {
        title: "Aplicativo do motorista",
        desc: "O motorista entra pelo celular com usuário e PIN, registra abastecimentos e informa problemas no veículo, sem precisar escolher órgão.",
        icon: Smartphone,
      },
      {
        title: "Estoque de combustível por tanque",
        desc: "Entradas de compra, saídas por abastecimento e o saldo atual de cada tanque.",
        icon: Fuel,
      },
      {
        title: "Ocorrência vira manutenção",
        desc: "Um problema relatado pode ser convertido em manutenção corretiva, com o histórico registrado.",
        icon: Wrench,
      },
      {
        title: "Controle de CNH",
        desc: "Relatório de CNHs vencidas e a vencer, e verificação da habilitação no acesso do motorista.",
        icon: IdCard,
      },
      {
        title: "Consumo e custo por veículo",
        desc: "Quilômetros rodados, litros, custo total e custo por km de cada veículo no período.",
        icon: Gauge,
      },
      {
        title: "Relatórios em PDF e Excel",
        desc: "Abastecimentos com filtros combináveis, estoque, entradas de combustível e relatório consolidado do veículo.",
        icon: FileSpreadsheet,
      },
      {
        title: "Busca e auditoria",
        desc: "Encontre veículos, motoristas e registros em uma busca só, com trilha de auditoria das alterações.",
        icon: Search,
      },
    ],
    fixes: [],
  },
  chatgov: {
    name: "ChatGov",
    version: "1.2.0",
    summary: "Atendimento pelo WhatsApp mais completo e agora confortável também no celular.",
    items: [
      { title: "Acesso pelo celular", desc: "Layout totalmente responsivo: no celular a navegação vira uma barra inferior e a lista de conversas alterna com o painel de atendimento.", icon: Smartphone },
      { title: "Protocolos de atendimento", desc: "Acompanhe e atualize o status de cada atendimento, com busca e filtro por departamento.", icon: ClipboardList },
      { title: "Responder citando mensagens", desc: "Responda a uma mensagem específica com a original em destaque, sincronizada com o WhatsApp do cidadão.", icon: Reply },
      { title: "Reações com emoji", desc: "Reaja a mensagens direto na conversa. A reação aparece também no WhatsApp.", icon: SmilePlus },
      { title: "Galeria de mídia da conversa", desc: "Fotos, vídeos, áudios e documentos de uma conversa reunidos em um só lugar.", icon: Images },
      { title: "Painel de Relatórios", desc: "Volume de conversas, tempo médio de 1ª resposta, taxa de resolução, ranking de atendentes e NPS.", icon: BarChart3 },
    ],
    fixes: [
      "Removidos os módulos sem uso para um menu mais limpo.",
      "Correção do status \"Aguardando mensagem\" em contatos com identificador LID.",
      "Correção do erro 503 causado pelo limite de requisições (rate limit).",
      "Tiques de entregue/lido corrigidos.",
    ],
  },
  diario: {
    name: "Diário Oficial",
    version: "1.2.0",
    summary: "Publicações com PDF personalizado, assinatura ICP-Brasil e autenticidade verificável pelo cidadão.",
    items: [
      { title: "Layouts de PDF personalizáveis", desc: "Personalize o layout dos PDFs das publicações do Diário Oficial.", icon: LayoutTemplate },
      { title: "Assinatura digital ICP-Brasil", desc: "Assine digitalmente as edições com certificado digital compatível com a ICP-Brasil.", icon: FileSignature },
      { title: "Verificação de autenticidade", desc: "Verifique a autenticidade de edições e publicações publicadas.", icon: ShieldCheck },
      { title: "Importação de edições legadas", desc: "Importe edições anteriores para manter o histórico completo.", icon: History },
      { title: "Portal público otimizado para buscas", desc: "Portal público com busca otimizada para localizar publicações e edições.", icon: Search },
      { title: "Acesso integrado à plataforma", desc: "Autenticação integrada ao GovSistem, com login centralizado.", icon: KeyRound },
    ],
    fixes: [
      "Configurações restritas a administradores.",
      "Redefinição de senha simplificada.",
    ],
  },
  govsocial: {
    name: "GovSocial",
    version: "1.1.0",
    summary: "Cadastro das famílias alinhado ao CadÚnico, com endereço preenchido automaticamente.",
    items: [
      { title: "Busca de CEP e localidades", desc: "Preencha endereços automaticamente com busca de CEP e localidades.", icon: MapPin },
      { title: "Composição familiar completa", desc: "Cadastre a composição familiar com todos os membros.", icon: Users },
      { title: "Campos do CadÚnico", desc: "Campos padronizados de acordo com o CadÚnico.", icon: IdCard },
      { title: "Gestão de tipos de benefício", desc: "Gerencie os tipos de benefício de forma centralizada.", icon: Gift },
      { title: "Integração com IBGE e ViaCEP", desc: "Dados de localidades integrados com IBGE e ViaCEP.", icon: Globe },
      { title: "Adicionar membro em uma janela", desc: "Adicione membros da família de forma rápida, sem sair da ficha.", icon: UserPlus },
    ],
    fixes: [
      "Escolaridade padronizada.",
      "Dados complementares do responsável.",
    ],
  },
};

export function formatNewsDate(date?: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
