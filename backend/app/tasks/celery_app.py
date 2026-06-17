from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "cftool",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.background_jobs"],
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

