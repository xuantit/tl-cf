from pydantic import BaseModel
from typing import Any, Optional


class CacheSettingsResponse(BaseModel):
    cache_level: Optional[str] = None
    browser_cache_ttl: Optional[int] = None
    always_online: Optional[str] = None
    development_mode: Optional[str] = None


class CacheSettingsUpdate(BaseModel):
    cache_level: Optional[str] = None
    browser_cache_ttl: Optional[int] = None
    always_online: Optional[str] = None
    development_mode: Optional[str] = None

