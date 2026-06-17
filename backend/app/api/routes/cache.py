from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.cache import CacheSettingsUpdate
from app.services.cache_service import get_cache_settings, update_cache_setting

router = APIRouter()


@router.get("/{zone_id}/settings")
def get_settings(zone_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_cache_settings(db, zone_id)
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return {"settings": s}


@router.patch("/{zone_id}/settings")
def patch_settings(
    zone_id: str,
    body: CacheSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    updates = body.model_dump(exclude_unset=True)
    for sid, val in updates.items():
        r = update_cache_setting(db, zone_id, sid, val)
        if not r:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to update {sid}")
    s = get_cache_settings(db, zone_id)
    return {"settings": s or {}}
