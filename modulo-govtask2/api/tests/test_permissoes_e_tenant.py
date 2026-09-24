"""Quem pode o quê, e o que um tenant nunca pode ver do outro."""

import io
import uuid

import pytest
from sqlalchemy import select

from app.models import Organization, Role, User, UserRole

PEDIDO = {"titulo": "Ambulância para o posto central", "tipo": "AQUISICAO"}


async def _encaminhar(cliente, pedido_id, setor="ENGENHARIA"):
    return await cliente.post(
        f"/pedidos/{pedido_id}/encaminhar",
        json={"setor": setor, "assunto": "Fazer o que precisa"},
    )


@pytest.mark.asyncio
async def test_prefeito_abre_pedido_mas_nao_encaminha(como, prefeito, assessor):
    async with como(prefeito) as cliente:
        criado = await cliente.post("/pedidos", json=PEDIDO)
        assert criado.status_code == 201
        pedido = criado.json()

        assert (await _encaminhar(cliente, pedido["id"])).status_code == 403
        assert (
            await cliente.post(
                f"/pedidos/{pedido['id']}/cancelar", json={"motivo": "não quero mais"}
            )
        ).status_code == 403


@pytest.mark.asyncio
async def test_departamento_trabalha_mas_nao_abre_pedido(como, engenheiro):
    async with como(engenheiro) as cliente:
        assert (await cliente.post("/pedidos", json=PEDIDO)).status_code == 403


@pytest.mark.asyncio
async def test_departamento_assume_e_anexa(como, assessor, engenheiro):
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        corpo = await _encaminhar(cliente, pedido["id"])

    enc_id = corpo.json()["encaminhamento_atual"]["id"]

    async with como(engenheiro) as cliente:
        anexo = await cliente.post(
            f"/pedidos/{pedido['id']}/anexos",
            files={"arquivo": ("planta.pdf", io.BytesIO(b"%PDF conteudo"), "application/pdf")},
        )
        assert anexo.status_code == 201
        assumido = await cliente.post(
            f"/pedidos/{pedido['id']}/encaminhamentos/{enc_id}/assumir"
        )
        assert assumido.status_code == 200
        assert assumido.json()["responsavel_atual"]["email"] == "eva@teste.gov.br"


@pytest.mark.asyncio
async def test_pedido_de_outra_prefeitura_nao_existe_para_mim(como, db, assessor):
    """O isolamento vale mesmo com o id em mãos: 404, não 403."""
    outra = Organization(id=uuid.uuid4(), name="Outra Prefeitura", slug="outra")
    db.add(outra)
    await db.flush()
    role = await db.scalar(select(Role).where(Role.name == "ASSESSOR"))
    intruso = User(
        id=uuid.uuid4(), organization_id=outra.id, name="Beto", email="beto@outra.gov.br"
    )
    db.add(intruso)
    await db.flush()
    db.add(UserRole(id=uuid.uuid4(), user_id=intruso.id, role_id=role.id))
    await db.commit()

    async with como(assessor) as cliente:
        meu = (await cliente.post("/pedidos", json=PEDIDO)).json()

    async with como(intruso) as cliente:
        assert (await cliente.get(f"/pedidos/{meu['id']}")).status_code == 404
        assert (await _encaminhar(cliente, meu["id"])).status_code == 404
        lista = (await cliente.get("/pedidos")).json()
        assert lista["total"] == 0


@pytest.mark.asyncio
async def test_anexo_de_outro_tenant_nao_baixa(como, db, assessor):
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        detalhe = (
            await cliente.post(
                f"/pedidos/{pedido['id']}/anexos",
                files={"arquivo": ("nota.pdf", io.BytesIO(b"%PDF x"), "application/pdf")},
            )
        ).json()
    anexo_id = detalhe["anexos"][0]["id"]

    outra = Organization(id=uuid.uuid4(), name="Vizinha", slug="vizinha")
    db.add(outra)
    await db.flush()
    role = await db.scalar(select(Role).where(Role.name == "ASSESSOR"))
    vizinho = User(
        id=uuid.uuid4(), organization_id=outra.id, name="Caio", email="caio@vizinha.gov.br"
    )
    db.add(vizinho)
    await db.flush()
    db.add(UserRole(id=uuid.uuid4(), user_id=vizinho.id, role_id=role.id))
    await db.commit()

    async with como(vizinho) as cliente:
        resposta = await cliente.get(
            f"/pedidos/{pedido['id']}/anexos/{anexo_id}/download"
        )
        assert resposta.status_code == 404


@pytest.mark.asyncio
async def test_extensao_perigosa_e_recusada(como, assessor):
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        resposta = await cliente.post(
            f"/pedidos/{pedido['id']}/anexos",
            files={"arquivo": ("script.sh", io.BytesIO(b"rm -rf /"), "text/x-sh")},
        )
    assert resposta.status_code == 415


@pytest.mark.asyncio
async def test_nome_de_arquivo_com_travessia_nao_escapa_da_pasta(como, db, assessor):
    """`../../../etc/passwd.pdf` é rótulo, nunca caminho."""
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        resposta = await cliente.post(
            f"/pedidos/{pedido['id']}/anexos",
            files={
                "arquivo": (
                    "../../../etc/passwd.pdf",
                    io.BytesIO(b"%PDF x"),
                    "application/pdf",
                )
            },
        )
    assert resposta.status_code == 201

    from app.core.storage import RAIZ
    from app.models import Anexo

    anexo = await db.scalar(select(Anexo))
    assert ".." not in anexo.caminho
    gravado = (RAIZ / anexo.caminho).resolve()
    assert gravado.is_relative_to(RAIZ)
    assert gravado.is_file()
    assert anexo.nome_original == "../../../etc/passwd.pdf"


@pytest.mark.asyncio
async def test_consulta_so_le(como, db, organizacao):
    role = await db.scalar(select(Role).where(Role.name == "CONSULTA"))
    leitor = User(
        id=uuid.uuid4(),
        organization_id=organizacao.id,
        name="Lia Leitora",
        email="lia@teste.gov.br",
    )
    db.add(leitor)
    await db.flush()
    db.add(UserRole(id=uuid.uuid4(), user_id=leitor.id, role_id=role.id))
    await db.commit()

    async with como(leitor) as cliente:
        assert (await cliente.get("/pedidos")).status_code == 200
        assert (await cliente.post("/pedidos", json=PEDIDO)).status_code == 403


@pytest.mark.asyncio
async def test_eu_descreve_o_que_o_usuario_pode(como, assessor):
    async with como(assessor) as cliente:
        eu = (await cliente.get("/eu")).json()
    assert eu["papeis"] == ["ASSESSOR"]
    assert eu["pode_criar"] and eu["pode_encaminhar"] and eu["pode_trabalhar"]


@pytest.mark.asyncio
async def test_criador_abre_o_proprio_pedido(como, assessor):
    """Regressão: o usuário logado aparece como `criado_por` do pedido.

    O `populate_existing` do detalhe expirava `user_roles` desse mesmo objeto
    e a checagem de permissão disparava um lazy load — MissingGreenlet, 500.
    """
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        resposta = await cliente.get(f"/pedidos/{pedido['id']}")

    assert resposta.status_code == 200
    assert resposta.json()["criado_por"]["email"] == "ana@teste.gov.br"


@pytest.mark.asyncio
async def test_departamento_nao_ve_pedido_de_outro_setor(como, assessor, engenheiro, juridico):
    async with como(assessor) as cliente:
        pedido = (await cliente.post("/pedidos", json=PEDIDO)).json()
        await _encaminhar(cliente, pedido["id"], setor="ENGENHARIA")

    async with como(juridico) as cliente:
        assert (await cliente.get(f"/pedidos/{pedido['id']}")).status_code == 403

    async with como(engenheiro) as cliente:
        assert (await cliente.get(f"/pedidos/{pedido['id']}")).status_code == 200


@pytest.mark.asyncio
async def test_assessor_lota_usuario_num_setor(como, assessor, juridico):
    async with como(assessor) as cliente:
        resposta = await cliente.patch(
            f"/usuarios/{juridico.id}", json={"setor": "GABINETE"}
        )
        assert resposta.status_code == 200
        assert resposta.json()["setor"] == "GABINETE"
        pessoas = (await cliente.get("/usuarios")).json()
        alvo = next(p for p in pessoas if p["id"] == str(juridico.id))
        assert alvo["setor"] == "GABINETE"


@pytest.mark.asyncio
async def test_setor_invalido_e_recusado(como, assessor, juridico):
    async with como(assessor) as cliente:
        resposta = await cliente.patch(
            f"/usuarios/{juridico.id}", json={"setor": "INEXISTENTE"}
        )
    assert resposta.status_code == 422


@pytest.mark.asyncio
async def test_prefeito_nao_lota_usuario(como, prefeito, juridico):
    async with como(prefeito) as cliente:
        assert (
            await cliente.patch(f"/usuarios/{juridico.id}", json={"setor": "JURIDICO"})
        ).status_code == 403
