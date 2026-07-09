from fastapi import APIRouter

from app.api.v1.acoes_coletivas import router as acoes_coletivas_router
from app.api.v1.acompanhamentos import router as acompanhamentos_router
from app.api.v1.agenda import router as agenda_router
from app.api.v1.admin import router as admin_router
from app.api.v1.alertas import router as alertas_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.attendances import router as attendances_router
from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.beneficios import router as beneficios_router
from app.api.v1.case_files import router as case_files_router
from app.api.v1.encaminhamentos import router as encaminhamentos_router
from app.api.v1.families import router as families_router
from app.api.v1.importacao import router as importacao_router
from app.api.v1.lgpd import router as lgpd_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.persons import router as persons_router
from app.api.v1.pias import router as pias_router
from app.api.v1.professionals import router as professionals_router
from app.api.v1.reception import router as reception_router
from app.api.v1.rma import router as rma_router
from app.api.v1.search import router as search_router
from app.api.v1.units import router as units_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.domains import router as domains_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(agenda_router)
api_router.include_router(units_router)
api_router.include_router(professionals_router)
api_router.include_router(search_router)
api_router.include_router(persons_router)
api_router.include_router(families_router)
api_router.include_router(case_files_router)
api_router.include_router(attendances_router)
api_router.include_router(acompanhamentos_router)
api_router.include_router(pias_router)
api_router.include_router(alertas_router)
api_router.include_router(beneficios_router)
api_router.include_router(acoes_coletivas_router)
api_router.include_router(encaminhamentos_router)
api_router.include_router(rma_router)
api_router.include_router(dashboard_router)
api_router.include_router(importacao_router)
api_router.include_router(lgpd_router)
api_router.include_router(attachments_router)
api_router.include_router(reception_router)
api_router.include_router(audit_router)
api_router.include_router(admin_router)
api_router.include_router(domains_router)
api_router.include_router(onboarding_router)
