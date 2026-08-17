"""Motor de workflow: avançar, devolver, cancelar, bloqueio por pendência e
cálculo de SLA (núcleo do sistema — seções 11-19, 89-90, 109-111)."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.enums import TipoProcesso
from app.models.planejamento import Dfd
from app.services import workflow

pytestmark = pytest.mark.asyncio


async def _abrir_processo_pregao(db, mundo, objeto="Processo de teste"):
    setores = mundo["setores"]
    return await workflow.abrir_processo(
        db,
        organizacao_id=mundo["organizacao"].id,
        tipo_processo=TipoProcesso.PREGAO.value,
        secretaria_id=setores["_secretaria_saude"].id,
        setor_id=setores["solicitante_saude"].id,
        objeto=objeto,
        valor_estimado=10000.0,
        usuario=mundo["usuarios"]["solicitante"],
    )


async def test_avancar_bloqueado_por_requisito_pendente(client, db, token, mundo):
    processo = await _abrir_processo_pregao(db, mundo)
    await db.commit()

    # solicitacao -> dfd (sem requisito, deve funcionar)
    r1 = await client.post(f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("solicitante"))
    assert r1.status_code == 200, r1.text
    assert r1.json()["etapa_atual_codigo"] == "dfd"

    # dfd -> etp (bloqueado: DFD ainda não aprovado)
    r2 = await client.post(f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("compras"))
    assert r2.status_code == 422
    corpo = r2.json()
    assert corpo["erro"] == "pendencias_etapa"
    assert corpo["pendencias"][0]["descricao"] == "DFD aprovado"
    assert corpo["pendencias"][0]["satisfeito"] is False


async def test_avancar_libera_apos_satisfazer_requisito(client, db, token, mundo):
    processo = await _abrir_processo_pregao(db, mundo)
    await db.commit()
    await client.post(f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("solicitante"))

    db.add(
        Dfd(
            processo_id=processo.id,
            descricao_necessidade="Necessidade de teste",
            status="aprovado",
        )
    )
    await db.commit()

    r = await client.post(f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("compras"))
    assert r.status_code == 200, r.text
    assert r.json()["etapa_atual_codigo"] == "etp"


async def test_devolver_exige_justificativa(client, db, token, mundo):
    processo = await _abrir_processo_pregao(db, mundo)
    await db.commit()
    await client.post(f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("solicitante"))

    sem_justificativa = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/devolver", json={"justificativa": ""}, headers=token("compras")
    )
    assert sem_justificativa.status_code == 422

    com_justificativa = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/devolver",
        json={"justificativa": "Faltou detalhar o quantitativo na solicitação."},
        headers=token("compras"),
    )
    assert com_justificativa.status_code == 200, com_justificativa.text
    corpo = com_justificativa.json()
    assert corpo["etapa_atual_codigo"] == "solicitacao"

    historico = await client.get(f"/api/govcompras/v1/processos/{processo.id}/historico", headers=token("compras"))
    resultados = [item["resultado"] for item in historico.json()["itens"]]
    assert "devolvida" in resultados


async def test_cancelar_processo_exige_justificativa_e_muda_status(client, db, token, mundo):
    processo = await _abrir_processo_pregao(db, mundo)
    await db.commit()

    sem_justificativa = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/cancelar", json={"justificativa": ""}, headers=token("administrador")
    )
    assert sem_justificativa.status_code == 422

    resposta = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/cancelar",
        json={"justificativa": "Necessidade deixou de existir."},
        headers=token("administrador"),
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["status_geral"] == "cancelado"

    # Não é possível avançar um processo cancelado.
    bloqueado = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("administrador")
    )
    assert bloqueado.status_code == 409


@pytest.mark.parametrize(
    "dias_decorridos,sla_dias,esperado",
    [
        (1, 10, "dentro_do_prazo"),
        (8, 10, "atencao"),
        (11, 10, "atrasado"),
        (16, 10, "critico"),
    ],
)
async def test_calcular_status_sla_faixas(dias_decorridos, sla_dias, esperado):
    iniciada_em = datetime.now(timezone.utc) - timedelta(days=dias_decorridos)
    resultado = workflow.calcular_status_sla(iniciada_em, sla_dias)
    assert resultado.value == esperado


async def test_avancar_sem_permissao_falha(client, db, token, mundo):
    processo = await _abrir_processo_pregao(db, mundo)
    await db.commit()
    resposta = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/avancar", headers=token("fiscal")
    )
    assert resposta.status_code == 403
