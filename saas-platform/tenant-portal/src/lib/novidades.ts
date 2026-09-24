export interface NewsItem {
  title: string;
  desc: string;
}

export interface ModuleNews {
  version: string;
  items: NewsItem[];
  fixes: string[];
}

export const MODULE_NEWS: Record<string, ModuleNews> = {
  chatgov: {
    version: "1.2.0",
    items: [
      { title: "Acesso pelo celular", desc: "Layout totalmente responsivo: no celular a navegação vira uma barra inferior e a lista de conversas alterna com o painel de atendimento." },
      { title: "Protocolos de atendimento", desc: "Acompanhe e atualize o status de cada atendimento, com busca e filtro por departamento." },
      { title: "Responder citando mensagens", desc: "Responda a uma mensagem específica com a original em destaque, sincronizada com o WhatsApp do cidadão." },
      { title: "Reações com emoji", desc: "Reaja a mensagens direto na conversa — a reação aparece também no WhatsApp." },
      { title: "Galeria de mídia da conversa", desc: "Fotos, vídeos, áudios e documentos de uma conversa reunidos em um só lugar." },
      { title: "Painel de Relatórios", desc: "Volume de conversas, tempo médio de 1ª resposta, taxa de resolução, ranking de atendentes e NPS." },
    ],
    fixes: [
      "Removidos os módulos sem uso para um menu mais limpo.",
      "Correção do status \"Aguardando mensagem\" em contatos com identificador LID.",
      "Correção do erro 503 causado pelo limite de requisições (rate limit).",
      "Tiques de entregue/lido corrigidos.",
    ],
  },
  diario: {
    version: "1.2.0",
    items: [
      { title: "Layouts de PDF personalizáveis", desc: "Personalize o layout dos PDFs das publicações do Diário Oficial." },
      { title: "Assinatura digital ICP-Brasil", desc: "Assine digitalmente as edições com certificado digital compatível com a ICP-Brasil." },
      { title: "Verificação de autenticidade", desc: "Verifique a autenticidade de edições e publicações publicadas." },
      { title: "Importação de edições legadas", desc: "Importe edições anteriores para manter o histórico completo." },
      { title: "Portal público otimizado para buscas", desc: "Portal público com busca otimizada para localizar publicações e edições." },
      { title: "Acesso integrado à plataforma", desc: "Autenticação integrada ao GovSistem, com login centralizado." },
    ],
    fixes: [
      "Configurações restritas a administradores.",
      "Redefinição de senha simplificada.",
    ],
  },
  govsocial: {
    version: "1.1.0",
    items: [
      { title: "Busca de CEP e localidades", desc: "Preencha endereços automaticamente com busca de CEP e localidades." },
      { title: "Composição familiar completa", desc: "Cadastre a composição familiar com todos os membros." },
      { title: "Campos do CadÚnico", desc: "Campos padronizados de acordo com o CadÚnico." },
      { title: "Gestão de tipos de benefício", desc: "Gerencie os tipos de benefício de forma centralizada." },
      { title: "Integração com IBGE e ViaCEP", desc: "Dados de localidades integrados com IBGE e ViaCEP." },
      { title: "Modal de adicionar membro", desc: "Adicione membros da família de forma rápida e intuitiva." },
    ],
    fixes: [
      "Escolaridade padronizada.",
      "Dados complementares do responsável.",
    ],
  },
};

