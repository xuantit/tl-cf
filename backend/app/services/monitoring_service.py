from sqlalchemy.orm import Session
from app.models.domain import Domain
from app.models.template import Template
from app.models.job import Job
from app.models.account import Account


def get_dashboard(db: Session) -> dict:
    domains_count = db.query(Domain).count()
    templates_count = db.query(Template).count()
    accounts_count = db.query(Account).filter(Account.is_active == True).count()
    domains_recent = db.query(Domain).order_by(Domain.created_at.desc()).limit(10).all()
    jobs_recent = db.query(Job).order_by(Job.created_at.desc()).limit(10).all()
    by_status = {}
    for d in db.query(Domain.status).distinct():
        by_status[d[0] or "unknown"] = db.query(Domain).filter(Domain.status == d[0]).count()
    return {
        "domains_count": domains_count,
        "templates_count": templates_count,
        "accounts_count": accounts_count,
        "domains_by_status": by_status,
        "domains_recent": [{"id": d.id, "name": d.name, "status": d.status, "zone_id": d.zone_id} for d in domains_recent],
        "jobs_recent": [{"id": j.id, "type": j.type, "status": j.status, "created_at": str(j.created_at) if j.created_at else None} for j in jobs_recent],
    }
