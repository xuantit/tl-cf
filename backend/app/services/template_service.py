import uuid
from sqlalchemy.orm import Session

from app.models.template import Template
from app.services.dns_service import list_dns_records
from app.services.cache_service import get_cache_settings
from app.services.rules_service import list_pagerules
from app.core.security import decrypt_api_token
from app.models.domain import Domain
from app.models.account import Account
from app.core.cloudflare import CloudflareClient


def _client_for_zone(db: Session, zone_id: str) -> CloudflareClient | None:
    dom = db.query(Domain).filter(Domain.zone_id == zone_id).first()
    if not dom:
        return None
    acc = db.query(Account).filter(Account.id == dom.account_id, Account.is_active == True).first()
    if not acc:
        return None
    token = decrypt_api_token(acc.api_token_encrypted)
    return CloudflareClient(api_token=token)


def create_template(db: Session, name: str, category: str | None, dns_records: list, cache_settings: dict, page_rules: list, firewall_rules: list) -> Template:
    t = Template(
        id=str(uuid.uuid4()),
        name=name,
        category=category,
        dns_records=dns_records or [],
        cache_settings=cache_settings or {},
        page_rules=page_rules or [],
        firewall_rules=firewall_rules or [],
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def create_template_from_domain(db: Session, name: str, category: str | None, zone_id: str) -> Template | None:
    recs = list_dns_records(db, zone_id)
    dns_list = [{"type": r.get("type"), "name": r.get("name"), "content": r.get("content"), "ttl": r.get("ttl"), "proxied": r.get("proxied")} for r in recs]
    cache = get_cache_settings(db, zone_id) or {}
    rules = list_pagerules(db, zone_id)
    page_list = [{"targets": r.get("targets"), "actions": r.get("actions"), "priority": r.get("priority")} for r in rules]
    return create_template(db, name, category, dns_list, cache, page_list, [])


def apply_template(db: Session, template_id: str, zone_id: str) -> dict:
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        return {"ok": False, "error": "Template not found"}
    client = _client_for_zone(db, zone_id)
    if not client:
        return {"ok": False, "error": "Zone not found"}
    applied = {"dns": 0, "cache": 0, "pagerules": 0}
    for d in (t.dns_records or []):
        data = {"type": d.get("type"), "name": d.get("name"), "content": d.get("content"), "ttl": d.get("ttl", 1), "proxied": d.get("proxied", False)}
        if client.create_dns_record(zone_id, data):
            applied["dns"] += 1
    for k, v in (t.cache_settings or {}).items():
        if client.edit_zone_setting(zone_id, k, v):
            applied["cache"] += 1
    for pr in (t.page_rules or []):
        targets = pr.get("targets", [])
        actions = pr.get("actions", [])
        prio = pr.get("priority", 1)
        if client.create_pagerule(zone_id, targets=targets, actions=actions, priority=prio):
            applied["pagerules"] += 1
    return {"ok": True, "applied": applied}


def update_template(db: Session, template_id: str, name: str | None = None, category: str | None = None, dns_records: list | None = None, cache_settings: dict | None = None, page_rules: list | None = None, firewall_rules: list | None = None) -> Template | None:
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        return None
    if name is not None:
        t.name = name
    if category is not None:
        t.category = category
    if dns_records is not None:
        t.dns_records = dns_records
    if cache_settings is not None:
        t.cache_settings = cache_settings
    if page_rules is not None:
        t.page_rules = page_rules
    if firewall_rules is not None:
        t.firewall_rules = firewall_rules
    db.commit()
    db.refresh(t)
    return t
