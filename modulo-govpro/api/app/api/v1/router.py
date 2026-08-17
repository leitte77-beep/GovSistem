from fastapi import APIRouter

from app.api.v1.arquivo import router as arquivo_router
from app.api.v1.assinaturas import router as assinaturas_router
from app.api.v1.auditoria import router as auditoria_router
from app.api.v1.auth import router as auth_router
from app.api.v1.caixa import router as caixa_router
from app.api.v1.blocos import router as blocos_router
from app.api.v1.busca import router as busca_router
from app.api.v1.cidadao import router as cidadao_router
from app.api.v1.documentos import router as documentos_router
from app.api.v1.dominio import router as dominio_router
from app.api.v1.gestao import router as gestao_router
from app.api.v1.gestao_cidadao import router as gestao_cidadao_router
from app.api.v1.internal import router as internal_router
from app.api.v1.processos import router as processos_router
from app.api.v1.publico import router as publico_router
from app.api.v1.roteamento import router as roteamento_router
from app.api.v1.sigilo import router as sigilo_router
from app.api.v1.tramitacoes import router as tramitacoes_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(internal_router)
api_router.include_router(processos_router)
api_router.include_router(documentos_router)
api_router.include_router(dominio_router)
api_router.include_router(assinaturas_router)
api_router.include_router(tramitacoes_router)
api_router.include_router(busca_router)
api_router.include_router(sigilo_router)
api_router.include_router(blocos_router)
api_router.include_router(publico_router)
api_router.include_router(cidadao_router)
api_router.include_router(gestao_cidadao_router)
api_router.include_router(gestao_router)
api_router.include_router(arquivo_router)
api_router.include_router(roteamento_router)
api_router.include_router(auditoria_router)
api_router.include_router(caixa_router)
