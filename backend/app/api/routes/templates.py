from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.template import Template
from app.schemas.template import TemplateCreate, TemplateFromDomain, TemplateApply, TemplateBulkApply, TemplateUpdate, TemplateResponse
from app.services.template_service import create_template, create_template_from_domain, apply_template, update_template

router = APIRouter()


@router.get("", response_model=list[TemplateResponse])
def list_templates(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Template).all()
    return [TemplateResponse(id=t.id, name=t.name, category=t.category, dns_records=t.dns_records or [], cache_settings=t.cache_settings or {}, page_rules=t.page_rules or [], firewall_rules=t.firewall_rules or []) for t in rows]


@router.post("", response_model=TemplateResponse)
def create_from_body(body: TemplateCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = create_template(db, body.name, body.category, body.dns_records, body.cache_settings, body.page_rules, body.firewall_rules)
    return TemplateResponse(id=t.id, name=t.name, category=t.category, dns_records=t.dns_records, cache_settings=t.cache_settings, page_rules=t.page_rules, firewall_rules=t.firewall_rules)


@router.post("/from-domain", response_model=TemplateResponse)
def create_from_domain(body: TemplateFromDomain, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = create_template_from_domain(db, body.name, body.category, body.zone_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zone not found or no data")
    return TemplateResponse(id=t.id, name=t.name, category=t.category, dns_records=t.dns_records, cache_settings=t.cache_settings, page_rules=t.page_rules, firewall_rules=t.firewall_rules)


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateResponse(id=t.id, name=t.name, category=t.category, dns_records=t.dns_records or [], cache_settings=t.cache_settings or {}, page_rules=t.page_rules or [], firewall_rules=t.firewall_rules or [])


@router.patch("/{template_id}", response_model=TemplateResponse)
def update_template_route(template_id: str, body: TemplateUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = update_template(
        db, template_id,
        name=body.name,
        category=body.category,
        dns_records=body.dns_records,
        cache_settings=body.cache_settings,
        page_rules=body.page_rules,
        firewall_rules=body.firewall_rules,
    )
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateResponse(id=t.id, name=t.name, category=t.category, dns_records=t.dns_records or [], cache_settings=t.cache_settings or {}, page_rules=t.page_rules or [], firewall_rules=t.firewall_rules or [])


@router.post("/{template_id}/apply")
def apply_to_zone(template_id: str, body: TemplateApply, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = apply_template(db, template_id, body.zone_id)
    if not r.get("ok"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=r.get("error", "Apply failed"))
    return r


@router.post("/{template_id}/bulk-apply")
def bulk_apply_template(template_id: str, body: TemplateBulkApply, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    results = []
    for zone_id in body.zone_ids:
        r = apply_template(db, template_id, zone_id)
        results.append({"zone_id": zone_id, **r})
    return {"results": results}


@router.delete("/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
