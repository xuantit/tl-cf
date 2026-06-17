from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.dns import DnsRecordCreate, DnsRecordUpdate
from app.services.dns_service import list_dns_records, create_dns_record, update_dns_record, delete_dns_record

router = APIRouter()


@router.get("/{zone_id}/records")
def get_records(
    zone_id: str,
    type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    records = list_dns_records(db, zone_id, type=type)
    return {"records": [{"id": r.get("id"), "type": r.get("type"), "name": r.get("name"), "content": r.get("content"), "ttl": r.get("ttl"), "proxied": r.get("proxied")} for r in records]}


@router.post("/{zone_id}/records")
def create_record(
    zone_id: str,
    body: DnsRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = {"type": body.type, "name": body.name, "content": body.content, "ttl": body.ttl, "proxied": body.proxied}
    rec = create_dns_record(db, zone_id, data)
    if not rec:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create DNS record")
    return rec


@router.patch("/{zone_id}/records/{record_id}")
def patch_record(
    zone_id: str,
    record_id: str,
    body: DnsRecordUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    rec = update_dns_record(db, zone_id, record_id, data)
    if not rec:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update DNS record")
    return rec


@router.delete("/{zone_id}/records/{record_id}")
def remove_record(
    zone_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = delete_dns_record(db, zone_id, record_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete DNS record")
    return {"ok": True}
