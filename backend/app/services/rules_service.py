from app.core.cloudflare import CloudflareClient
from app.core.security import decrypt_api_token
from app.models.domain import Domain
from app.models.account import Account
from sqlalchemy.orm import Session


def _client_for_zone(db: Session, zone_id: str) -> CloudflareClient | None:
    dom = db.query(Domain).filter(Domain.zone_id == zone_id).first()
    if not dom:
        return None
    acc = db.query(Account).filter(Account.id == dom.account_id, Account.is_active == True).first()
    if not acc:
        return None
    token = decrypt_api_token(acc.api_token_encrypted)
    return CloudflareClient(api_token=token)


def list_pagerules(db: Session, zone_id: str) -> list[dict]:
    client = _client_for_zone(db, zone_id)
    if not client:
        return []
    return client.list_pagerules(zone_id) or []


def create_pagerule(db: Session, zone_id: str, targets: list, actions: list, priority: int = 1) -> dict | None:
    client = _client_for_zone(db, zone_id)
    if not client:
        return None
    return client.create_pagerule(zone_id, targets=targets, actions=actions, priority=priority)


def delete_pagerule(db: Session, zone_id: str, rule_id: str) -> bool:
    client = _client_for_zone(db, zone_id)
    if not client:
        return False
    return client.delete_pagerule(zone_id, rule_id)

