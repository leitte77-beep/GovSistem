"""Geração de edital a partir de template com variáveis (seções 38-39).

`{{numero_processo}}`, `{{objeto}}` etc. são resolvidas aqui em memória — nada
de motor de template externo, o suficiente para a POC e fácil de trocar por
um mecanismo mais robusto depois (arquitetura pronta para evoluir, seção 142).
"""

from app.models.processo import ProcessoInstancia


def resolver_variaveis(conteudo_base: str, processo: ProcessoInstancia, extra: dict[str, str] | None = None) -> str:
    valores = {
        "numero_processo": processo.numero_processo,
        "objeto": processo.objeto,
        "valor_estimado": f"{processo.valor_estimado:,.2f}" if processo.valor_estimado else "",
        "exercicio": str(processo.exercicio),
        **(extra or {}),
    }
    resultado = conteudo_base
    for chave, valor in valores.items():
        resultado = resultado.replace(f"{{{{{chave}}}}}", str(valor))
    return resultado
