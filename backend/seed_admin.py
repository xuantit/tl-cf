"""
Tạo tài khoản admin mặc định. Chạy 1 lần sau khi đã chạy migration.

  cd backend
  python seed_admin.py

Tài khoản:
  Email:    admin@example.com
  Password: Admin@123
"""
import uuid
import sys

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin@123"


def main():
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == ADMIN_EMAIL).first():
            print(f"Admin da ton tai: {ADMIN_EMAIL}")
            return 0
        user = User(
            id=str(uuid.uuid4()),
            email=ADMIN_EMAIL,
            hashed_password=hash_password(ADMIN_PASSWORD),
            role="admin",
        )
        db.add(user)
        db.commit()
        print(f"Da tao admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        return 0
    except Exception as e:
        print(f"Loi: {e}", file=sys.stderr)
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())

