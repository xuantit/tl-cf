from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str
    cf_account_id: str
    api_token: str


class AccountResponse(BaseModel):
    id: str
    name: str
    cf_account_id: str
    is_active: bool

    class Config:
        from_attributes = True

