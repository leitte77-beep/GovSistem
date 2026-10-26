"""Seeds idempotentes do GovSaúde.

Uso:
    python scripts/seed.py

Cria o catálogo de integrações (global) e, para cada organização existente,
permissões, grupos nacionais e configurações padrão. Se ``SEED_ORG_ID`` e
``SEED_ADMIN_EMAIL``/``SEED_ADMIN_PASSWORD`` forem informados, cria também uma
organização e um administrador local inicial.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.integracoes import IntegracaoSistema
from app.models.nucleo import Organizacao, Usuario  # noqa: E402
from app.services.provisionamento import (  # noqa: E402
    provisionar_organizacao,
    provisionar_usuario,
)
from app.services.seeds import (  # noqa: E402
    garantir_configuracoes_padrao,
    garantir_grupos_tenant,
    garantir_permissoes,
    garantir_prioridades_configuraveis,
)

INTEGRACOES = [
    ("LEDI_APS", "LEDI APS / e-SUS APS / SIAPS", "Fichas e-SUS APS e envio por lote."),
    ("RNDS", "RNDS (HL7 FHIR R4)", "RIA, RAC, REL, RIRA, REDFM e REPM."),
    ("BNAFAR", "BNAFAR", "REPE e RESMPE diários."),
    ("CADSUS", "CADSUS", "Consulta e validação de cidadão por CPF/CNS."),
    ("CNES", "CNES", "Estabelecimentos, profissionais, equipes e vínculos."),
    ("SIGTAP", "SIGTAP", "Procedimentos e compatibilidades por competência."),
    ("SIA", "SIA / BPA", "Exportação BPA-C/BPA-I."),
    ("SIH", "SIH / AIH", "Exportação AIH."),
    ("RAAS", "RAAS", "Exportação RAAS."),
    ("APAC", "APAC", "Exportação APAC."),
    ("SISCAN", "SISCAN", "Requisições e resultados de colo/mama."),
    ("BPS", "Banco de Preços em Saúde", "Dados de compras no layout vigente."),
    ("SIOPS", "SIOPS", "Apoio operacional (obrigação fiscal no Lote 01)."),
    ("LOTE01", "Lote 01 (contábil, compras e protocolo)", "Integração por API."),
    ("LABORATORIO", "Equipamentos de laboratório", "ASTM/HL7 v2 por adaptador."),
    ("GEOPROCESSAMENTO", "Geoprocessamento municipal", "Importação/consulta territorial."),
]


async def seed() -> None:
    async with async_session() as db:
        await garantir_permissoes(db)
        existentes = {
            codigo
            for (codigo,) in (
                await db.execute(select(IntegracaoSistema.codigo))
            ).all()
        }
        for codigo, nome, descricao in INTEGRACOES:
            if codigo not in existentes:
                db.add(
                    IntegracaoSistema(codigo=codigo, nome=nome, descricao=descricao, ativo=True)
                )
        await db.flush()

        org_seed = os.getenv("SEED_ORG_ID", "").strip()
        if org_seed:
            organizacao = await provisionar_organizacao(
                db,
                organization_id=org_seed,
                nome=os.getenv("SEED_ORG_NOME", "Município"),
                slug=os.getenv("SEED_ORG_SLUG", "municipio"),
                uf=os.getenv("SEED_ORG_UF"),
                municipio_ibge=os.getenv("SEED_ORG_IBGE"),
            )
        else:
            organizacao = None

        organizacoes = (
            await db.execute(select(Organizacao).where(Organizacao.ativa.is_(True)))
        ).scalars().all()
        for org in organizacoes:
            await garantir_grupos_tenant(db, org.id)
            await garantir_configuracoes_padrao(db, org.id)
            await garantir_prioridades_configuraveis(db, org.id)

        email = os.getenv("SEED_ADMIN_EMAIL", "").strip()
        senha = os.getenv("SEED_ADMIN_PASSWORD", "")
        if organizacao and email and senha:
            existente = await db.scalar(
                select(Usuario).where(
                    Usuario.tenant_id == organizacao.id, Usuario.email == email.lower()
                )
            )
            if existente is None:
                usuario = await provisionar_usuario(
                    db,
                    user_id=uuid.uuid4(),
                    organization_id=organizacao.id,
                    nome=os.getenv("SEED_ADMIN_NOME", "Administrador"),
                    email=email,
                    papeis=["ADMIN"],
                )
                usuario.password_hash = hash_password(senha)
                usuario.nome_acesso = email.split("@")[0].lower()
                await db.flush()
                print(f"Administrador criado: {email}")
            else:
                print(f"Administrador já existe: {email}")
        await db.commit()
    print("Seed concluído.")


if __name__ == "__main__":
    asyncio.run(seed())
