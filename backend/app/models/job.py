from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.models.base import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True)
    type = Column(String(64), nullable=False)
    status = Column(String(32), default="pending")
    payload = Column(JSONB, default=dict)
    result = Column(JSONB)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

