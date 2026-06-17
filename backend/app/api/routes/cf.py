from fastapi import APIRouter
from pydantic import BaseModel

from app.core.cloudflare import CloudflareClient

router = APIRouter()


class VerifyBody(BaseModel):
    api_token: str


@router.post("/verify")
def verify_token(body: VerifyBody):
    client = CloudflareClient(api_token=body.api_token)
    ok = client.verify_token()
    return {"ok": ok}


@router.post("/zones")
def list_zones(body: VerifyBody):
    client = CloudflareClient(api_token=body.api_token)
    zones = client.list_zones()
    return {"zones": [{"id": z.get("id"), "name": z.get("name"), "status": z.get("status")} for z in zones]}

