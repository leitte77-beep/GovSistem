import type { Meta, StoryObj } from "@storybook/react";
import { EstadoVazio } from "./EstadoVazio";
import { EstadoErro } from "./EstadoErro";
import { EstadoSemPermissao } from "./EstadoSemPermissao";
import { Skeleton } from "./Skeleton";
import { BarraOffline } from "./BarraOffline";

const meta: Meta = { title: "Base/Estados de tela" };
export default meta;

type Story = StoryObj;

export const Vazio: Story = {
  render: () => (
    <EstadoVazio
      titulo="Nenhuma família encontrada"
      descricao="Não encontramos famílias para esta busca."
      acao={{ rotulo: "Cadastrar nova família", aoClicar: () => {} }}
    />
  ),
};

export const Erro: Story = {
  render: () => (
    <EstadoErro
      problema={{
        type: "about:blank",
        title: "Não foi possível carregar",
        status: 503,
        detail: "O serviço está temporariamente indisponível.",
      }}
      aoTentarNovamente={() => {}}
    />
  ),
};

export const SemPermissao: Story = { render: () => <EstadoSemPermissao /> };

export const Carregando: Story = {
  render: () => (
    <div className="space-y-4">
      <Skeleton variante="cartao" />
      <Skeleton variante="tabela" linhas={4} />
      <Skeleton variante="trilha" linhas={3} />
    </div>
  ),
};

export const Offline: Story = {
  render: () => (
    <div className="rounded-cartao border border-ink-soft/15">
      {/* Força a barra mostrando itens pendentes (independe do navigator.onLine). */}
      <BarraOffline pendentes={3} />
    </div>
  ),
};
