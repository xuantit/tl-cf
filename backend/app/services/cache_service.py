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


CACHE_SETTING_IDS = ["cache_level", "browser_cache_ttl", "always_online", "development_mode"]


def get_cache_settings(db: Session, zone_id: str) -> dict | None:
    client = _client_for_zone(db, zone_id)
    if not client:
        return None
    all_settings = client.list_zone_settings(zone_id)
    out = {}
    for s in (all_settings or []):
        if isinstance(s, dict) and s.get("id") in CACHE_SETTING_IDS:
            out[s["id"]] = s.get("value")
    return out


def update_cache_setting(db: Session, zone_id: str, setting_id: str, value) -> dict | None:
    client = _client_for_zone(db, zone_id)
    if not client:
        return None
    return client.edit_zone_setting(zone_id, setting_id, value)

