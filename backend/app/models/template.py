from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.models.base import Base


class Template(Base):
    __tablename__ = "templates"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(64))
    dns_records = Column(JSONB, default=list)
    cache_settings = Column(JSONB, default=dict)
    page_rules = Column(JSONB, default=list)
    firewall_rules = Column(JSONB, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

