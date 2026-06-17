from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.rules import PageRuleCreate
from app.services.rules_service import list_pagerules, create_pagerule, delete_pagerule

router = APIRouter()


@router.get("/{zone_id}/page-rules")
def get_pagerules(zone_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rules = list_pagerules(db, zone_id)
    return {"rules": [{"id": r.get("id"), "targets": r.get("targets"), "actions": r.get("actions"), "priority": r.get("priority")} for r in rules]}


@router.post("/{zone_id}/page-rules")
def create_rule(
    zone_id: str,
    body: PageRuleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    targets = [t.model_dump() for t in body.targets]
    actions = [{"id": a.id, "value": a.value} for a in body.actions]
    r = create_pagerule(db, zone_id, targets=targets, actions=actions, priority=body.priority)
    if not r:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create page rule")
    return r


@router.delete("/{zone_id}/page-rules/{rule_id}")
def remove_rule(
    zone_id: str,
    rule_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = delete_pagerule(db, zone_id, rule_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete page rule")
    return {"ok": True}
