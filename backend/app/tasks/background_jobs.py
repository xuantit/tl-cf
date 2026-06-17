import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.job import Job
from app.services.domain_service import add_domain
from app.services.template_service import apply_template
from app.tasks.celery_app import celery_app

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
Session = sessionmaker(bind=engine)


@celery_app.task(bind=True)
def bulk_add_domains_task(self, job_id: str, names: list[str], account_id: str):
    db = Session()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "running"
            db.commit()
        created, failed = [], []
        for name in names:
            dom = add_domain(db, name.strip(), account_id)
            if dom:
                created.append({"name": name, "id": dom.id})
            else:
                failed.append(name)
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "completed"
            job.result = {"created": created, "failed": failed}
            db.commit()
        return {"created": created, "failed": failed}
    except Exception as e:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.error = str(e)
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def bulk_apply_template_task(self, job_id: str, template_id: str, zone_ids: list[str]):
    db = Session()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "running"
            db.commit()
        results = []
        for zid in zone_ids:
            r = apply_template(db, template_id, zid)
            results.append({"zone_id": zid, **r})
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "completed"
            job.result = {"results": results}
            db.commit()
        return {"results": results}
    except Exception as e:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.error = str(e)
            db.commit()
        raise
    finally:
        db.close()
