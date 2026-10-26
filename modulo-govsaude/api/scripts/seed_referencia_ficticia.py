"""Recorte FICTÍCIO para desenvolvimento/testes — nunca usar em produção.

A importação real é feita por `importar_referencias.py` com artefatos oficiais.
Este script só roda com `ALLOW_FICTICIO=1` e ambiente não produtivo.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.database import async_session  # noqa: E402
from app.models.referencia import (  # noqa: E402
    Cbo,
    Ciap2,
    Cid10,
    Cnae,
    Imunobiologico,
    Medicamento,
    MunicipioIBGE,
    SigtapProcedimento,
    VersaoReferencia,
)


async def main() -> None:
    if settings.is_production or os.getenv("ALLOW_FICTICIO") != "1":
        raise SystemExit(
            "Recorte fictício bloqueado. Use ALLOW_FICTICIO=1 em desenvolvimento/teste."
        )
    async with async_session() as db:
        await db.merge(
            MunicipioIBGE(
                codigo_ibge="9999999",
                nome="[FICTICIO] Município de Teste",
                uf="PR",
                nome_busca="ficticio municipio de teste",
            )
        )
        await db.merge(Cbo(codigo="999999", descricao="[FICTICIO] Ocupação de teste"))
        await db.merge(Cid10(codigo="Z99", descricao="[FICTICIO] CID de teste"))
        await db.merge(Ciap2(codigo="Z99", descricao="[FICTICIO] CIAP de teste"))
        await db.merge(Cnae(codigo="9999999", descricao="[FICTICIO] CNAE de teste"))
        await db.merge(
            SigtapProcedimento(
                codigo="9999999999",
                competencia="202601",
                nome="[FICTICIO] Procedimento de teste",
            )
        )
        await db.merge(Imunobiologico(codigo="FICTICIO", nome="[FICTICIO] Imunobiológico"))
        await db.merge(Medicamento(codigo_obm="FICTICIO", nome="[FICTICIO] Medicamento"))
        await db.merge(
            VersaoReferencia(
                sistema="FICTICIO",
                versao=date.today().isoformat(),
                observacoes="Recorte de desenvolvimento; não é dado oficial.",
                importado_em=date.today(),
            )
        )
        await db.commit()
    print("Recorte FICTÍCIO carregado.")


if __name__ == "__main__":
    asyncio.run(main())
