"""O seed de demonstração precisa rodar sem erros e ser idempotente — é o
que garante que `docker compose up` sempre entrega a POC navegável."""

import pytest
from sqlalchemy import func, select

from app.models.ata import AtaRegistroPreco
from app.models.contrato import Contrato
from app.models.organizacao import Organizacao, User
from app.models.processo import ProcessoInstancia
from scripts.seed import seed

pytestmark = pytest.mark.asyncio


async def test_seed_cria_cenario_completo(db):
    criou = await seed(db)
    assert criou is True

    assert (await db.scalar(select(func.count(User.id)))) == 7
    assert (await db.scalar(select(func.count(ProcessoInstancia.id)))) == 8
    assert (await db.scalar(select(func.count(Contrato.id)))) == 3
    assert (await db.scalar(select(func.count(AtaRegistroPreco.id)))) == 1


async def test_seed_e_idempotente(db):
    primeira = await seed(db)
    segunda = await seed(db)
    assert primeira is True
    assert segunda is False
    assert (await db.scalar(select(func.count(Organizacao.id)))) == 1
