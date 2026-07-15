from fastapi import APIRouter

from app.api.v1.acoes_coletivas import router as acoes_coletivas_router
from app.api.v1.acompanhamentos import router as acompanhamentos_router
from app.api.v1.agenda import router as agenda_router
from app.api.v1.admin import router as admin_router
from app.api.v1.admin_domains import router as admin_domains_router
from app.api.v1.alertas import router as alertas_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.attendances import router as attendances_router
from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.autenticador_exportador import router as autenticador_router
from app.api.v1.beneficios import router as beneficios_router
from app.api.v1.case_files import router as case_files_router
from app.api.v1.cep import router as cep_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.documentos import router as documentos_router
from app.api.v1.domicilio import router as domicilio_router
from app.api.v1.domains import router as domains_router
from app.api.v1.encaminhamentos import router as encaminhamentos_router
from app.api.v1.families import router as families_router
from app.api.v1.finalizacao import router as finalizacao_router
from app.api.v1.gestao_pessoas import router as gestao_pessoas_router
from app.api.v1.habitacional import router as habitacional_router
from app.api.v1.importacao import router as importacao_router
from app.api.v1.internal import router as internal_router
from app.api.v1.ivs import router as ivs_router
from app.api.v1.lgpd import router as lgpd_router
from app.api.v1.localidades import router as localidades_router
from app.api.v1.notificacoes import router as notificacoes_router
from app.api.v1.onboarding import router as onboarding_router
from app.api.v1.persons import router as persons_router
from app.api.v1.pias import router as pias_router
from app.api.v1.professionals import router as professionals_router
from app.api.v1.questionarios import router as questionarios_router
from app.api.v1.reception import router as reception_router
from app.api.v1.rede_protecao import router as rede_protecao_router
from app.api.v1.relatorios import router as relatorios_router
from app.api.v1.reports import router as reports_router
from app.api.v1.rma import router as rma_router
from app.api.v1.search import router as search_router
from app.api.v1.shortcuts import router as shortcuts_router
from app.api.v1.sibec import router as sibec_router
from app.api.v1.sicon import router as sicon_router
from app.api.v1.socioeconomico import router as socioeconomico_router
from app.api.v1.teleatendimento import router as teleatendimento_router
from app.api.v1.units import router as units_router

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
api_router.include_router(reports_router)
api_router.include_router(dashboard_router)
api_router.include_router(importacao_router)
api_router.include_router(teleatendimento_router)
api_router.include_router(attachments_router)
api_router.include_router(reception_router)
api_router.include_router(audit_router)
api_router.include_router(admin_router)
api_router.include_router(domains_router)
api_router.include_router(domicilio_router)
api_router.include_router(onboarding_router)
api_router.include_router(internal_router)
api_router.include_router(sicon_router)
api_router.include_router(sibec_router)
api_router.include_router(socioeconomico_router)
api_router.include_router(gestao_pessoas_router)
api_router.include_router(notificacoes_router)
api_router.include_router(questionarios_router)
api_router.include_router(autenticador_router)
api_router.include_router(relatorios_router)
api_router.include_router(habitacional_router)
api_router.include_router(finalizacao_router)
api_router.include_router(ivs_router)
api_router.include_router(lgpd_router)
api_router.include_router(rede_protecao_router)
api_router.include_router(rma_router)
api_router.include_router(shortcuts_router)
api_router.include_router(admin_domains_router)
api_router.include_router(cep_router)
api_router.include_router(localidades_router)
api_router.include_router(documentos_router)
