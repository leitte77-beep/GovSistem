"""Servico de geracao de documentos via IA (ChatGPT/OpenAI).

Cada tenant configura suas credenciais (email + API key) no model AIConfig.
A API key e armazenada criptografada com Fernet em nivel de coluna.
"""

import json
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_text
from app.models.ai_config import AIConfig

logger = logging.getLogger("govsocial.ai")

# ── Templates de prompt por tipo de documento ──────────────────────

TEMPLATES: dict[str, str] = {
    "relatorio_social": (
        "Voce e um assistente social que atua no Sistema Unico de Assistencia Social (SUAS). "
        "Redija um RELATORIO SOCIAL profissional com base nas informacoes abaixo. "
        "O relatorio deve ter linguagem tecnica, objetiva e impessoal, "
        "seguindo as normas da Resolucao CFESS no 557/2009. "
        "Estruture o texto com: 1) Identificacao do usuario/familia, "
        "2) Descricao da situacao, 3) Analise tecnica, 4) Encaminhamentos. "
        "Nao invente dados que nao foram fornecidos.\n\n"
        "DADOS:\n{contexto}"
    ),
    "oficio": (
        "Voce e um profissional da assistencia social. "
        "Redija um OFICIO formal com base nas informacoes abaixo. "
        "Use linguagem formal, protocolar, com timbre, numero de oficio, "
        "local e data, destinatario, assunto, corpo do texto e assinatura. "
        "O documento deve ser adequado para comunicacao entre orgaos publicos "
        "no ambito do SUAS.\n\n"
        "DADOS:\n{contexto}"
    ),
    "evolucao": (
        "Voce e um tecnico de nivel superior do SUAS. "
        "Redija um REGISTRO DE EVOLUCAO DE ACOMPANHAMENTO com base nas informacoes abaixo. "
        "O texto deve ser tecnico, descritivo, registrar avancos, retrocessos e observacoes "
        "relevantes sobre o acompanhamento familiar. "
        "Inclua: periodo de referencia, profissional responsavel, "
        "descricao das acoes realizadas, resultados observados e proximos passos. "
        "Nao invente dados que nao foram fornecidos.\n\n"
        "DADOS:\n{contexto}"
    ),
    "declaracao": (
        "Voce e um profissional da assistencia social. "
        "Redija uma DECLARACAO formal com base nas informacoes abaixo. "
        "A declaracao deve conter: identificacao do orgao emissor, "
        "identificacao do declarante/beneficiario, objeto da declaracao, "
        "finalidade, local, data e assinatura. "
        "Use linguagem formal e objetiva.\n\n"
        "DADOS:\n{contexto}"
    ),
    "parecer_tecnico": (
        "Voce e um assistente social ou psicologo que atua no SUAS. "
        "Redija um PARECER TECNICO profissional com base nas informacoes abaixo. "
        "O parecer deve seguir a estrutura: 1) Identificacao, "
        "2) Relatorio circunstanciado (descricao da demanda), "
        "3) Fundamentacao teorico-metodologica, "
        "4) Analise tecnica, 5) Conclusao/Parecer. "
        "Fundamente com base na politica de assistencia social, "
        "Tipificacao Nacional dos Servicos Socioassistenciais (Res. CNAS 109/2009) "
        "e legislacao pertinente. Nao invente dados.\n\n"
        "DADOS:\n{contexto}"
    ),
}


def _build_context(context_data: dict) -> str:
    """Serializa os dados de contexto em formato legivel para o prompt."""
    return json.dumps(context_data, ensure_ascii=False, indent=2)


def _system_prompt(template_type: str) -> str:
    template = TEMPLATES.get(template_type)
    if template is None:
        raise ValueError(
            f"Tipo de documento '{template_type}' nao reconhecido. "
            f"Tipos disponiveis: {', '.join(sorted(TEMPLATES.keys()))}"
        )
    return template


async def get_ai_config(
    db: AsyncSession,
    tenant_id: str,
) -> Optional[AIConfig]:
    """Busca a configuracao de IA ativa do tenant."""
    result = await db.execute(
        select(AIConfig).where(
            AIConfig.tenant_id == tenant_id,
            AIConfig.enabled == True,
        )
    )
    return result.scalar_one_or_none()


async def generate_document(
    db: AsyncSession,
    tenant_id: str,
    template_type: str,
    context_data: dict,
) -> str:
    """Gera um documento usando IA com base no template e dados fornecidos.

    Args:
        db: Sessao assincrona do banco.
        tenant_id: ID do tenant/orgao.
        template_type: Tipo de documento (relatorio_social, oficio, etc.).
        context_data: Dicionario com dados da familia/pessoa.

    Returns:
        Texto do documento gerado.

    Raises:
        ValueError: Se o template_type nao for reconhecido.
        RuntimeError: Se o tenant nao tiver configuracao de IA habilitada.
    """
    config = await get_ai_config(db, tenant_id)

    if config is None:
        raise RuntimeError(
            "Este orgao ainda nao configurou o servico de IA para geracao de "
            "documentos. Acesse Configuracoes > Integracoes > IA e configure "
            "suas credenciais da OpenAI."
        )

    if not config.enabled:
        raise RuntimeError(
            "O servico de IA esta desabilitado para este orgao. "
            "Acesse as configuracoes para ativa-lo."
        )

    # Descriptografa a API key armazenada (Fernet column-level encryption).
    api_key = decrypt_text(config.encrypted_password)
    if not api_key:
        raise RuntimeError(
            "Nao foi possivel descriptografar a credencial de IA configurada. "
            "Por favor, reconfigure a API key da OpenAI nas configuracoes."
        )

    system_content = _system_prompt(template_type)
    user_content = _build_context(context_data)

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)

        response = await client.chat.completions.create(
            model=config.model,
            max_tokens=config.max_tokens,
            temperature=0.3,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content},
            ],
        )

        generated = response.choices[0].message.content or ""
        return generated.strip()

    except Exception as exc:
        logger.exception("Erro ao gerar documento com IA: %s", exc)
        raise RuntimeError(
            f"Falha ao gerar documento: {str(exc)}. "
            "Verifique se as credenciais estao corretas e se o servico "
            "da OpenAI esta disponivel."
        ) from exc
