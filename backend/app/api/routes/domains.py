from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.account import Account
from app.models.domain import Domain
from app.schemas.domain import DomainCreate, DomainResponse, BulkDomainCreate, SslModeUpdate
from app.services.domain_service import add_domain, delete_domain, get_ssl_mode, update_ssl_mode, apply_default_settings_to_all_domains, apply_default_settings_to_domain

router = APIRouter()


@router.get("", response_model=list[DomainResponse])
def list_domains(
    account_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Domain)
    if account_id:
        q = q.filter(Domain.account_id == account_id)
    rows = q.all()
    result = []
    for d in rows:
        ssl = get_ssl_mode(db, d.id) if d.zone_id else None
        result.append(DomainResponse(
            id=d.id,
            name=d.name,
            zone_id=d.zone_id,
            status=d.status,
            account_id=d.account_id,
            ssl_mode=ssl
        ))
    return result


@router.post("", response_model=DomainResponse)
def create_domain(body: DomainCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Check if account exists
    acc = db.query(Account).filter(Account.id == body.account_id, Account.is_active == True).first()
    if not acc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Account not found: {body.account_id}")
    try:
        dom = add_domain(db, name=body.name, account_id=body.account_id)
        if not dom:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to add domain {body.name}. Check Cloudflare API token permissions or if domain already exists.")
        ssl = get_ssl_mode(db, dom.id) if dom.zone_id else None
        return DomainResponse(id=dom.id, name=dom.name, zone_id=dom.zone_id, status=dom.status, account_id=dom.account_id, ssl_mode=ssl)
    except ValueError as e:
        # Re-raise ValueError from create_zone (domain exists, permission errors)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/bulk")
def bulk_create_domains(body: BulkDomainCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    created, failed = [], []
    for name in body.names:
        dom = add_domain(db, name=name.strip(), account_id=body.account_id)
        if dom:
            created.append({"name": name, "id": dom.id})
        else:
            failed.append(name)
    return {"created": created, "failed": failed}


@router.post("/bulk-apply-default-settings")
def apply_default_settings(
    account_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Apply default settings (SSL mode = flexible, cache settings) to all existing domains.
    If account_id is provided as query parameter, only apply to domains in that account.
    """
    try:
        results = apply_default_settings_to_all_domains(db, account_id=account_id)
        return results
    except Exception as e:
        import logging
        logging.error(f"Failed to apply default settings: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to apply default settings: {str(e)}")


@router.delete("/{domain_id}")
def remove_domain(domain_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ok = delete_domain(db, domain_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    return {"ok": True}


@router.get("/{domain_id}/ssl")
def get_domain_ssl(domain_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ssl_mode = get_ssl_mode(db, domain_id)
    if ssl_mode is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found or SSL mode unavailable")
    return {"ssl_mode": ssl_mode}


@router.patch("/{domain_id}/ssl")
def update_domain_ssl(
    domain_id: str,
    body: SslModeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    valid_modes = ["off", "flexible", "full", "strict"]
    if body.mode not in valid_modes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid SSL mode. Must be one of: {', '.join(valid_modes)}")
    ok = update_ssl_mode(db, domain_id, body.mode)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update SSL mode")
    return {"ok": True, "ssl_mode": body.mode}


@router.post("/{domain_id}/apply-default-settings")
def apply_default_settings_to_single_domain(
    domain_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Apply default settings (SSL mode = flexible, cache settings) to a single domain.
    """
    try:
        result = apply_default_settings_to_domain(db, domain_id)
        if not result.get("success", False) and "error" in result:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("error", "Failed to apply settings"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.error(f"Failed to apply default settings to domain {domain_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to apply default settings: {str(e)}")
