import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import encrypt_api_token
from app.models.user import User
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountResponse

router = APIRouter()


@router.post("", response_model=AccountResponse)
def create_account(body: AccountCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    acc = Account(
        id=str(uuid.uuid4()),
        name=body.name,
        cf_account_id=body.cf_account_id,
        api_token_encrypted=encrypt_api_token(body.api_token),
        is_active=True,
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return AccountResponse(id=acc.id, name=acc.name, cf_account_id=acc.cf_account_id, is_active=acc.is_active)


@router.get("", response_model=list[AccountResponse])
def list_accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Account).filter(Account.is_active == True).all()
    return [AccountResponse(id=a.id, name=a.name, cf_account_id=a.cf_account_id, is_active=a.is_active) for a in rows]

