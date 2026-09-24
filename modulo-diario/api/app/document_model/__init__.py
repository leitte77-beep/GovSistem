"""Motor de modelos documentais (Incremento 2).

Camadas (importe os submódulos diretamente):
  * ``schemas``  — config validada do modelo (campos, seções, condicionais).
  * ``fill``     — coerção/validação de valores e regras de obrigatoriedade.
  * ``renderer`` — renderização determinística para um SemanticDocument.
  * ``service``  — persistência versionada + ciclo de vida (versão ativa imutável).

Este ``__init__`` permanece leve (sem importar ``service``) para não criar ciclo
de import com ``app.models.document_model``.
"""
