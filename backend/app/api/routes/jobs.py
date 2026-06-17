import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.job import Job
from app.tasks.background_jobs import bulk_add_domains_task, bulk_apply_template_task

router = APIRouter()


@router.post("/bulk-domains")
def queue_bulk_domains(
    body: dict,  # { names: str[], account_id: str }
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    names = body.get("names") or []
    account_id = body.get("account_id") or ""
    if not names or not account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="names and account_id required")
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="bulk_domains", status="pending", payload={"names": names, "account_id": account_id})
    db.add(job)
    db.commit()
    bulk_add_domains_task.delay(job_id, names, account_id)
    return {"job_id": job_id}


@router.post("/bulk-apply")
def queue_bulk_apply(
    body: dict,  # { template_id: str, zone_ids: str[] }
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    template_id = body.get("template_id") or ""
    zone_ids = body.get("zone_ids") or []
    if not template_id or not zone_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="template_id and zone_ids required")
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="bulk_apply", status="pending", payload={"template_id": template_id, "zone_ids": zone_ids})
    db.add(job)
    db.commit()
    bulk_apply_template_task.delay(job_id, template_id, zone_ids)
    return {"job_id": job_id}


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return {"id": job.id, "type": job.type, "status": job.status, "payload": job.payload, "result": job.result, "error": job.error}

