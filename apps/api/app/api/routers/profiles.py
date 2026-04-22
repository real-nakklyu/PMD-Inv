from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.settings import get_settings
from app.core.auth import AuthUser, get_authenticated_user, get_current_user, require_roles
from app.db.supabase import get_supabase
from app.schemas.profile import (
    ProfileBootstrap,
    ProfileOut,
    ProfileUpdate,
    StaffAccessRequestCreate,
    StaffAccessRequestOut,
    StaffAccessRequestReview,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me")
def get_my_profile(user: Annotated[AuthUser, Depends(get_authenticated_user)]):
    client = get_supabase()
    response = client.table("profiles").select("*").eq("id", user.id).limit(1).execute()
    profile = response.data[0] if response.data else None
    existing = client.table("profiles").select("id", count="exact").limit(1).execute()
    request = None
    try:
        request_response = client.table("staff_access_requests").select("*").eq("user_id", user.id).limit(1).execute()
        request = request_response.data[0] if request_response.data else None
    except HTTPException as exc:
        if "staff_access_requests" not in str(exc.detail):
            raise
    return {
        "auth_user": {"id": user.id, "email": user.email},
        "profile": profile,
        "needs_profile": profile is None,
        "can_bootstrap_admin": profile is None and (existing.count or 0) == 0,
        "access_request": request,
    }


@router.post("/bootstrap-first-admin", response_model=ProfileOut, status_code=201)
def bootstrap_first_admin(
    payload: ProfileBootstrap,
    user: Annotated[AuthUser, Depends(get_authenticated_user)],
):
    client = get_supabase()
    existing = client.table("profiles").select("id", count="exact").limit(1).execute()
    if existing.count and existing.count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="First admin bootstrap is only available before any profiles exist.",
        )
    response = (
        client.table("profiles")
        .insert({"id": user.id, "full_name": payload.full_name, "role": "admin"})
        .execute()
    )
    return response.data[0]


@router.get("", response_model=list[ProfileOut])
def list_profiles(_: Annotated[AuthUser, Depends(require_roles("admin"))]):
    response = get_supabase().table("profiles").select("*").order("created_at", desc=True).execute()
    return response.data or []


@router.post("/access-requests", response_model=StaffAccessRequestOut, status_code=201)
def create_access_request(
    payload: StaffAccessRequestCreate,
    user: Annotated[AuthUser, Depends(get_authenticated_user)],
):
    client = get_supabase()
    profile = client.table("profiles").select("id").eq("id", user.id).limit(1).execute()
    if profile.data:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This user already has staff access.")

    existing = client.table("staff_access_requests").select("*").eq("user_id", user.id).limit(1).execute()
    request_payload = {
        "user_id": user.id,
        "email": user.email or "",
        "full_name": payload.full_name,
        "requested_role": payload.requested_role,
        "message": payload.message,
        "status": "pending",
        "reviewed_by": None,
        "reviewed_at": None,
    }
    if existing.data:
        current = existing.data[0]
        if current["status"] == "approved":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This access request is already approved.")
        response = client.table("staff_access_requests").update(request_payload).eq("id", current["id"]).execute()
    else:
        response = client.table("staff_access_requests").insert(request_payload).execute()

    request = response.data[0]
    _notify_admin_access_request(request)
    return request


@router.get("/access-requests", response_model=list[StaffAccessRequestOut])
def list_access_requests(_: Annotated[AuthUser, Depends(require_roles("admin"))], status_filter: str = "pending"):
    query = get_supabase().table("staff_access_requests").select("*")
    if status_filter != "all":
        query = query.eq("status", status_filter)
    response = query.order("created_at", desc=True).execute()
    return response.data or []


@router.patch("/access-requests/{request_id}", response_model=StaffAccessRequestOut)
def review_access_request(
    request_id: str,
    payload: StaffAccessRequestReview,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
):
    client = get_supabase()
    lookup = client.table("staff_access_requests").select("*").eq("id", request_id).limit(1).execute()
    if not lookup.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found.")

    request = lookup.data[0]
    if payload.action == "approve":
        client.table("profiles").insert(
            {"id": request["user_id"], "full_name": request["full_name"], "role": payload.role}
        ).execute()
        status_value = "approved"
    else:
        status_value = "denied"

    response = (
        client.table("staff_access_requests")
        .update(
            {
                "status": status_value,
                "reviewed_by": user.id,
                "reviewed_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("id", request_id)
        .execute()
    )
    return response.data[0]


@router.patch("/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: str,
    payload: ProfileUpdate,
    user: Annotated[AuthUser, Depends(require_roles("admin"))],
):
    client = get_supabase()
    current = client.table("profiles").select("*").eq("id", profile_id).limit(1).execute()
    if not current.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    if payload.role and payload.role != "admin":
        if profile_id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins cannot remove their own admin role.",
            )
        admins = client.table("profiles").select("id").eq("role", "admin").execute()
        admin_ids = [item["id"] for item in admins.data or []]
        if len(admin_ids) <= 1 and profile_id in admin_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one admin profile must remain.",
            )

    response = (
        client
        .table("profiles")
        .update(payload.model_dump(exclude_unset=True))
        .eq("id", profile_id)
        .execute()
    )
    return response.data[0]


def _notify_admin_access_request(request: dict):
    settings = get_settings()
    if not settings.admin_approval_email or not settings.resend_api_key:
        return

    import httpx

    try:
        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.approval_from_email,
                "to": [settings.admin_approval_email],
                "subject": "PMDInv staff access request",
                "text": (
                    f"{request['full_name']} ({request['email']}) requested PMDInv access.\n\n"
                    "Open the Staff page in PMDInv to approve or deny this request."
                ),
            },
            timeout=10,
        )
    except httpx.HTTPError:
        return
