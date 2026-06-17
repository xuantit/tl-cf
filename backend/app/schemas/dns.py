from pydantic import BaseModel
from typing import Optional


class DnsRecordCreate(BaseModel):
    type: str
    name: str
    content: str
    ttl: Optional[int] = 1  # 1 = auto
    proxied: Optional[bool] = False


class DnsRecordUpdate(BaseModel):
    type: Optional[str] = None
    name: Optional[str] = None
    content: Optional[str] = None
    ttl: Optional[int] = None
    proxied: Optional[bool] = None


class DnsRecordResponse(BaseModel):
    id: str
    type: str
    name: str
    content: str
    ttl: int
    proxied: bool

    class Config:
        from_attributes = True

