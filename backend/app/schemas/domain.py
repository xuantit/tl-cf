from pydantic import BaseModel
from typing import Optional


class DomainCreate(BaseModel):
    name: str
    account_id: str
    template_id: Optional[str] = None


class DomainResponse(BaseModel):
    id: str
    name: str
    zone_id: Optional[str]
    status: str
    account_id: str
    ssl_mode: Optional[str] = None  # "off", "flexible", "full", "strict"

    class Config:
        from_attributes = True


class BulkDomainCreate(BaseModel):
    names: list[str]
    account_id: str
    template_id: Optional[str] = None


class SslModeUpdate(BaseModel):
    mode: str  # "off", "flexible", "full", "strict"

