from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.models.base import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    cf_account_id = Column(String(64), unique=True, nullable=False)
    api_token_encrypted = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

