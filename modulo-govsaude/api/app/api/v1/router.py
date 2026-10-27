"""Agregação dos roteadores da API v1 do GovSaúde."""

from fastapi import APIRouter

from app.api.v1.agendamentos import router as agendamentos_router
from app.api.v1.agendas import router as agendas_router
from app.api.v1.anexos import router as anexos_router
from app.api.v1.auditoria import router as auditoria_router
from app.api.v1.auth import router as auth_router
from app.api.v1.buscas_ativas import router as buscas_ativas_router
from app.api.v1.cidadaos import router as cidadaos_router
from app.api.v1.configuracoes import router as configuracoes_router
from app.api.v1.estoque import router as estoque_router
from app.api.v1.filas import router as filas_router
from app.api.v1.formularios import router as formularios_router
from app.api.v1.importacoes import router as importacoes_router
from app.api.v1.imunizacao import router as imunizacao_router
from app.api.v1.inscricoes_programa import router as inscricoes_programa_router
from app.api.v1.internal import router as internal_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.laboratorio import router as laboratorio_router
from app.api.v1.laboratorio import router_siscan as siscan_router
from app.api.v1.odontologia import router as odontologia_router
from app.api.v1.paineis import router as paineis_router
from app.api.v1.programacoes_programa import router as programacoes_programa_router
from app.api.v1.programas import router as programas_router
from app.api.v1.prontuarios import router as prontuarios_router
from app.api.v1.protocolos_risco import router as protocolos_router
from app.api.v1.recepcao import router as recepcao_router
from app.api.v1.rede import router as rede_router
from app.api.v1.referencia import router as referencia_router
from app.api.v1.relatorios import router as relatorios_router
from app.api.v1.sistema import router as sistema_router
from app.api.v1.tempo_real import router as tempo_real_router
from app.api.v1.territorios import router as territorios_router
from app.api.v1.usuarios import router as usuarios_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(sistema_router)
api_router.include_router(usuarios_router)
api_router.include_router(configuracoes_router)
api_router.include_router(auditoria_router)
api_router.include_router(jobs_router)
api_router.include_router(referencia_router)
api_router.include_router(tempo_real_router)
api_router.include_router(rede_router)
api_router.include_router(cidadaos_router)
api_router.include_router(territorios_router)
api_router.include_router(prontuarios_router)
api_router.include_router(estoque_router)
api_router.include_router(anexos_router)
api_router.include_router(imunizacao_router)
api_router.include_router(laboratorio_router)
api_router.include_router(siscan_router)
api_router.include_router(relatorios_router)
api_router.include_router(agendas_router)
api_router.include_router(protocolos_router)
api_router.include_router(agendamentos_router)
api_router.include_router(recepcao_router)
api_router.include_router(filas_router)
api_router.include_router(paineis_router)
api_router.include_router(programas_router)
api_router.include_router(inscricoes_programa_router)
api_router.include_router(programacoes_programa_router)
api_router.include_router(buscas_ativas_router)
api_router.include_router(formularios_router)
api_router.include_router(odontologia_router)
api_router.include_router(importacoes_router)
api_router.include_router(internal_router)
