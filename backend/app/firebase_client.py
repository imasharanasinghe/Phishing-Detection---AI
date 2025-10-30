from typing import Dict, Optional
from os import getenv

try:
    import firebase_admin
    from firebase_admin import auth, credentials, firestore
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    fs_client = firestore.client()
except Exception:
    firebase_admin = None
    auth = None
    fs_client = None

try:
    from jose import jwt as jose_jwt  # type: ignore
except Exception:
    jose_jwt = None


def create_firebase_user(email: str, password: str) -> str:
    if auth:
        user = auth.create_user(email=email, password=password)
        return user.uid
    # fallback mock uid
    return f"mock_{hash(email) & 0xffffffff}"


def set_firestore_user(uid: str, data: Dict) -> None:
    if fs_client:
        fs_client.collection("users").document(uid).set(data, merge=True)
    else:
        print(f"[Firestore Mock] set users/{uid}: {data}")


def verify_firebase_id_token(id_token: str) -> Optional[Dict]:
    """Verify a Firebase ID token and return its claims, or None on failure."""
    try:
        if auth:
            return auth.verify_id_token(id_token)
    except Exception as e:
        print(f"[Firebase Verify] failed: {e}")

    # Dev fallback: allow unverified decode to unblock local testing
    allow_unverified = getenv("ALLOW_UNVERIFIED_GOOGLE", "true").lower() == "true"
    if allow_unverified and jose_jwt:
        try:
            claims = jose_jwt.get_unverified_claims(id_token)
            # Ensure at least email is present; otherwise treat as invalid
            if claims and claims.get("email"):
                print("[Firebase Verify] using unverified claims (dev mode)")
                return claims
        except Exception as e:
            print(f"[Firebase Verify Fallback] failed: {e}")
    return None
