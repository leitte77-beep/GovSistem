from app.worker import celery_app


@celery_app.task(name="health.check")
def health_check():
    return {"status": "ok", "service": "worker"}
