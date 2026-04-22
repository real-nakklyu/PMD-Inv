from dataclasses import dataclass
from typing import Annotated, Callable

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.core.settings import Settings, get_settings
from app.db.supabase import get_supabase


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    role: str | None
    app_role: str | None = None
    full_name: str | None = None


def get_authenticated_user(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Supabase bearer token.",
        )

    token = authorization.split(" ", 1)[1]

    try:
        response = httpx.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to validate Supabase bearer token.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Supabase bearer token.",
        )

    payload = response.json()
    return AuthUser(
        id=str(payload.get("id")),
        email=payload.get("email"),
        role=payload.get("role"),
    )


def get_current_user(user: Annotated[AuthUser, Depends(get_authenticated_user)]) -> AuthUser:
    response = get_supabase().table("profiles").select("full_name,role").eq("id", user.id).limit(1).execute()
    profile = response.data[0] if response.data else None
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated user does not have a staff profile.",
        )
    return AuthUser(
        id=user.id,
        email=user.email,
        role=user.role,
        app_role=profile["role"],
        full_name=profile["full_name"],
    )


def require_roles(*allowed_roles: str) -> Callable[[AuthUser], AuthUser]:
    def dependency(user: Annotated[AuthUser, Depends(get_current_user)]) -> AuthUser:
        if user.app_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your staff role cannot perform this action.",
            )
        return user

    return dependency
