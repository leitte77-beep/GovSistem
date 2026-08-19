from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.convenios import router as convenios_router
from app.api.v1.etapas import router as etapas_router
from app.api.v1.tarefas import router as tarefas_router
from app.api.v1.anexos import router as anexos_router
from app.api.v1.contestacoes import router as contestacoes_router
from app.api.v1.notificacoes import router as notificacoes_router
from app.api.v1.admin import router as admin_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.internal import router as internal_router
from app.api.v1.diligencias import router as diligencias_router
from app.api.v1.repasses import router as repasses_router
from app.api.v1.medicoes import router as medicoes_router
from app.api.v1.financeiro import router as financeiro_router
from app.api.v1.contratos import router as contratos_router
from app.api.v1.licitacoes import router as licitacoes_router
from app.api.v1.prestacoes import router as prestacoes_router
from app.api.v1.entregas import router as entregas_router
from app.api.v1.auditoria import router as auditoria_router
from app.api.v1.favoritos import router as favoritos_router
from app.api.v1.obras import router as obras_router
from app.api.v1.relatorios import router as relatorios_router
from app.api.v1.alertas import router as alertas_router
from app.api.v1.status_processo import router as status_processo_router
from app.api.v1.escalonamento import router as escalonamento_router

api_router = APIRouter()
api_router.include_router(internal_router)
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(convenios_router)
api_router.include_router(etapas_router)
api_router.include_router(tarefas_router)
api_router.include_router(anexos_router)
api_router.include_router(contestacoes_router)
api_router.include_router(notificacoes_router)
api_router.include_router(admin_router)
api_router.include_router(diligencias_router)
api_router.include_router(repasses_router)
api_router.include_router(medicoes_router)
api_router.include_router(financeiro_router)
api_router.include_router(contratos_router)
api_router.include_router(licitacoes_router)
api_router.include_router(prestacoes_router)
api_router.include_router(entregas_router)
api_router.include_router(auditoria_router)
api_router.include_router(favoritos_router)
api_router.include_router(obras_router)
api_router.include_router(relatorios_router)
api_router.include_router(alertas_router)
api_router.include_router(status_processo_router)
api_router.include_router(escalonamento_router)
