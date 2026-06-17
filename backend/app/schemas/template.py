from pydantic import BaseModel
from typing import Any, Optional


class TemplateCreate(BaseModel):
    name: str
    category: Optional[str] = None
    dns_records: list[dict] = []
    cache_settings: dict = {}
    page_rules: list[dict] = []
    firewall_rules: list[dict] = []


class TemplateFromDomain(BaseModel):
    name: str
    category: Optional[str] = None
    zone_id: str


class TemplateApply(BaseModel):
    zone_id: str


class TemplateBulkApply(BaseModel):
    zone_ids: list[str]


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    dns_records: Optional[list[dict]] = None
    cache_settings: Optional[dict] = None
    page_rules: Optional[list[dict]] = None
    firewall_rules: Optional[list[dict]] = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    category: Optional[str]
    dns_records: list
    cache_settings: dict
    page_rules: list
    firewall_rules: list

    class Config:
        from_attributes = True

