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


def list_dns_records(db: Session, zone_id: str, type: str | None = None) -> list[dict]:
    client = _client_for_zone(db, zone_id)
    if not client:
        return []
    return client.list_dns_records(zone_id, type=type)


def create_dns_record(db: Session, zone_id: str, data: dict) -> dict | None:
    client = _client_for_zone(db, zone_id)
    if not client:
        return None
    return client.create_dns_record(zone_id, data=data)


def update_dns_record(db: Session, zone_id: str, record_id: str, data: dict) -> dict | None:
    client = _client_for_zone(db, zone_id)
    if not client:
        return None
    return client.update_dns_record(zone_id, record_id, data=data)


def delete_dns_record(db: Session, zone_id: str, record_id: str) -> bool:
    client = _client_for_zone(db, zone_id)
    if not client:
        return False
    return client.delete_dns_record(zone_id, record_id)
