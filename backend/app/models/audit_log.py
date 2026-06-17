from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True)
    action = Column(String(64), nullable=False)
    resource = Column(String(64))
    resource_id = Column(String(64))
    user_id = Column(String(36))
    details = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

