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
from app.api.v1.contratacoes import router as contratacoes_router
from app.api.v1.fluxo import router as fluxo_router
from app.api.v1.demandas import router as demandas_router
from app.api.v1.demanda_tarefas import router as demanda_tarefas_router
from app.api.v1.workflows import router as workflows_router
from app.api.v1.documentos import router as documentos_router
from app.api.v1.central_alertas import router as central_alertas_router
from app.api.v1.automacoes import router as automacoes_router
from app.api.v1.dashboards import router as dashboards_router
from app.api.v1.gestao_demanda import router as gestao_demanda_router
from app.api.v1.planejamento_demanda import router as planejamento_demanda_router
from app.api.v1.protocolos import router as protocolos_router
from app.api.v1.comentarios import router as comentarios_router
from app.api.v1.autoridades import router as autoridades_router
from app.api.v1.visoes import router as visoes_router
from app.api.v1.demanda_financeiro import router as demanda_financeiro_router
from app.api.v1.checklists import router as checklists_router
from app.api.v1.busca import router as busca_router
from app.api.v1.relatorio_demanda import router as relatorio_demanda_router

api_router = APIRouter()
api_router.include_router(internal_router)
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(demandas_router)
api_router.include_router(demanda_tarefas_router)
api_router.include_router(workflows_router)
api_router.include_router(documentos_router)
api_router.include_router(protocolos_router)
api_router.include_router(checklists_router)
api_router.include_router(comentarios_router)
api_router.include_router(demanda_financeiro_router)
api_router.include_router(relatorio_demanda_router)
api_router.include_router(autoridades_router)
api_router.include_router(visoes_router)
api_router.include_router(busca_router)
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
api_router.include_router(obras_router, prefix="/convenios/{convenio_id}/obras")
api_router.include_router(obras_router, prefix="/demandas/{demanda_id}/obras")
api_router.include_router(relatorios_router)
api_router.include_router(alertas_router)
api_router.include_router(central_alertas_router)
api_router.include_router(automacoes_router)
api_router.include_router(dashboards_router)
api_router.include_router(gestao_demanda_router)
api_router.include_router(planejamento_demanda_router)
api_router.include_router(status_processo_router)
api_router.include_router(escalonamento_router)
api_router.include_router(contratacoes_router)
api_router.include_router(fluxo_router)
