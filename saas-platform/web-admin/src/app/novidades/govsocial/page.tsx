"use client";

import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";

interface Item {
  icon: string;
  title: string;
  desc: string;
}

const NOVIDADES: Item[] = [
  {
    icon: "location_on",
    title: "Busca de CEP e localidades",
    desc: "Preenchimento automático de endereço via CEP com proxy no backend (LGPD). Seletor de UF e município com dados oficiais do IBGE, com cascata dinâmica (UF → município).",
  },
  {
    icon: "group_add",
    title: "Composição familiar completa",
    desc: "Adicione cônjuge, filhos e demais membros à família diretamente na ficha. Busque pessoa existente ou cadastre nova com parentesco, raça/cor, estado civil e mais.",
  },
  {
    icon: "assignment",
    title: "Campos do CadÚnico",
    desc: "Formulário de cadastro ampliado com todos os campos do Cadastro Único: raça/cor (IBGE), estado civil, frequenta escola, situação no mercado de trabalho, gestante, amamentando, renda mensal, despesas familiares (aluguel, transporte, alimentação, medicamentos) e situação de rua.",
  },
  {
    icon: "category",
    title: "Gestão de tipos de benefício",
    desc: "Nova tela em Administração para criar, editar e desativar tipos de benefício (vale-gás, cesta básica, enxoval, medicamento, filtro de água, colchão, etc.). Seed nacional com 12 tipos pré-configurados.",
  },
  {
    icon: "school",
    title: "Escolaridade padronizada",
    desc: "Campo de escolaridade agora é uma lista fechada com a classificação oficial do SUAS/CadÚnico: não alfabetizado, fundamental incompleto/completo, médio incompleto/completo, superior incompleto/completo.",
  },
  {
    icon: "contacts",
    title: "Dados complementares do responsável",
    desc: "O cadastro do responsável familiar agora inclui todos os campos CadÚnico: raça/cor, estado civil, escolaridade, ocupação, mercado de trabalho, renda mensal, frequenta escola, gestante/amamentando e tipo de deficiência.",
  },
  {
    icon: "person_add",
    title: "Modal de adicionar membro",
    desc: "Novo modal na ficha da família com duas opções: buscar pessoa existente por nome e vincular, ou cadastrar uma nova pessoa já vinculada à família.",
  },
  {
    icon: "wifi",
    title: "Integração com IBGE e ViaCEP",
    desc: "APIs oficiais do IBGE (estados e municípios) e ViaCEP (consulta de endereço por CEP) integradas via proxy no backend, garantindo conformidade com a LGPD e cache eficiente.",
  },
];

const CORRECOES: string[] = [
  "Adicionado endpoint PATCH para edição de tipos de benefício (antes só era possível criar e desativar).",
  "Corrigida a importação do módulo httpx nos endpoints de CEP e localidades.",
  "Migração de banco de dados idempotente para novos campos do CadÚnico (não falha em re-deploys).",
  "Campo de escolaridade substituído de texto livre para lista fechada padronizada.",
  "Corrigida a duplicação do campo Município no formulário de cadastro de família.",
  "Adicionado fallback com `RACA_COR`, `ESTADO_CIVIL` e `SITUACAO_MERCADO` nos formulários.",
];

export default function NovidadesGovSocialPage() {
  return (
    <AppLayout title="Novidades — GovSocial">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-[#001631] mb-6"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Voltar ao painel
        </Link>

        {/* Cabeçalho */}
        <div className="bg-gradient-to-br from-[#1a5276] via-[#1a5276] to-[#2e86c1] rounded-xl p-6 text-white mb-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          <div className="relative flex items-center gap-4">
            <div className="flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
              <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>diversity_3</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-headline-lg font-bold">GovSocial</h2>
                <span className="px-2 py-0.5 bg-white/15 text-white text-[11px] rounded uppercase tracking-wider font-semibold">v1.0.0</span>
              </div>
              <p className="text-body-md text-white/85 mt-1">Novidades e correções desta versão.</p>
            </div>
          </div>
        </div>

        {/* Novidades */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#2e86c1]">auto_awesome</span>
            Novidades desta versão
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {NOVIDADES.map((n) => (
              <div key={n.title} className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 flex gap-3">
                <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg bg-[#1a5276]/10 text-[#1a5276]">
                  <span className="material-symbols-outlined">{n.icon}</span>
                </div>
                <div>
                  <h4 className="text-body-lg font-bold text-[#001631]">{n.title}</h4>
                  <p className="text-body-sm text-on-surface-variant mt-0.5 leading-relaxed">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Correções */}
        <section className="mb-10">
          <h3 className="text-headline-sm text-[#001631] mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1a5276]">build</span>
            Correções e melhorias
          </h3>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant divide-y divide-outline-variant">
            {CORRECOES.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <span className="material-symbols-outlined text-[#1a5276] text-xl shrink-0">check_circle</span>
                <p className="text-body-md text-on-surface-variant">{c}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
