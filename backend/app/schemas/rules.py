from pydantic import BaseModel
from typing import Any, Optional


class PageRuleTarget(BaseModel):
    target: str = "url"
    constraint: dict  # e.g. {"operator": "matches", "value": "*example.com/*"}


class PageRuleAction(BaseModel):
    id: str  # e.g. "cache_level", "ssl", "forwarding_url"
    value: Any


class PageRuleCreate(BaseModel):
    targets: list[PageRuleTarget]
    actions: list[PageRuleAction]
    priority: int = 1


class PageRuleResponse(BaseModel):
    id: str
    targets: list
    actions: list
    priority: int

