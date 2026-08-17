"""Testes do agendamento Celery (beat) e registro das tarefas de manutenção."""

import app.tasks.manutencao  # noqa: F401 — garante o registro das tasks
from app.celery_app import celery_app


def test_tasks_registradas():
    nomes = set(celery_app.tasks.keys())
    assert "app.tasks.manutencao.desclassificar_sigilos_expirados" in nomes
    assert "app.tasks.manutencao.reativar_sobrestamentos_expirados" in nomes


def test_beat_schedule_configurado():
    schedule = celery_app.conf.beat_schedule
    assert "desclassificar-sigilos-expirados" in schedule
    assert "reativar-sobrestamentos-expirados" in schedule
    assert (
        schedule["desclassificar-sigilos-expirados"]["task"]
        == "app.tasks.manutencao.desclassificar_sigilos_expirados"
    )
    assert (
        schedule["reativar-sobrestamentos-expirados"]["task"]
        == "app.tasks.manutencao.reativar_sobrestamentos_expirados"
    )
