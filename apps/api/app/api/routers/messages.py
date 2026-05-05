from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import AuthUser, get_current_user
from app.db.supabase import get_supabase
from app.schemas.messages import (
    MessageAttachmentCreate,
    MessageCreate,
    MessageThreadCreate,
    MessageThreadMembersAdd,
)

router = APIRouter(prefix="/messages", tags=["messages"])
MESSAGE_PAGE_SIZE = 100


@router.get("/staff")
def list_message_staff(
    user: Annotated[AuthUser, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("profiles")
        .select("id,full_name,role,created_at")
        .order("full_name")
        .limit(limit)
        .execute()
    )
    return [
        {
            **profile,
            "is_me": profile["id"] == user.id,
        }
        for profile in response.data or []
    ]


@router.get("/threads")
def list_threads(user: Annotated[AuthUser, Depends(get_current_user)]) -> list[dict[str, Any]]:
    client = get_supabase()
    try:
        response = client.rpc("list_message_threads", {"requesting_user_id": str(user.id)})
        return response.data or []
    except HTTPException:
        pass

    memberships = (
        client.table("message_thread_members")
        .select("*")
        .eq("user_id", user.id)
        .is_("deleted_at", "null")
        .execute()
        .data
        or []
    )
    threads = [_thread_summary(client, membership["thread_id"], user.id, membership) for membership in memberships]
    return sorted(
        [thread for thread in threads if thread],
        key=lambda item: (item.get("latest_message") or {}).get("created_at") or item["updated_at"],
        reverse=True,
    )


@router.post("/threads", status_code=201)
def create_thread(payload: MessageThreadCreate, user: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    member_ids = list(dict.fromkeys([str(user.id), *[str(member_id) for member_id in payload.member_ids]]))
    profiles = _profiles_by_id(client, member_ids)
    missing = [member_id for member_id in member_ids if member_id not in profiles]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more staff members were not found.")

    thread_type = "group" if payload.thread_type == "group" or len(member_ids) > 2 else "direct"
    title = None if thread_type == "direct" else payload.title
    direct_key = _direct_key(member_ids) if thread_type == "direct" else None

    if direct_key:
        existing = _find_direct_thread(client, direct_key, member_ids, user.id)
        if existing:
            _restore_direct_thread_members(client, existing["id"])
            return _thread_summary(client, existing["id"], user.id) or existing

    thread = (
        client.table("message_threads")
        .insert({"thread_type": thread_type, "title": title, "direct_key": direct_key, "created_by": user.id})
        .execute()
        .data[0]
    )
    client.table("message_thread_members").insert(
        [
            {
                "thread_id": thread["id"],
                "user_id": member_id,
                "last_read_at": datetime.now(UTC).isoformat() if member_id == str(user.id) else None,
            }
            for member_id in member_ids
        ]
    ).execute()
    return _thread_summary(client, thread["id"], user.id) or thread


@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str, user: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, bool]:
    client = get_supabase()
    _ensure_thread_member(client, thread_id, user.id)
    client.table("message_thread_members").update({"deleted_at": datetime.now(UTC).isoformat()}).eq("thread_id", thread_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.post("/threads/{thread_id}/members", status_code=201)
def add_thread_members(
    thread_id: str,
    payload: MessageThreadMembersAdd,
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> dict[str, Any]:
    client = get_supabase()
    _ensure_thread_member(client, thread_id, user.id)
    thread = client.table("message_threads").select("*").eq("id", thread_id).single().execute().data
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    if thread["thread_type"] != "group":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Staff can only be added to group conversations.")

    member_ids = list(dict.fromkeys(str(member_id) for member_id in payload.member_ids))
    profiles = _profiles_by_id(client, member_ids)
    missing = [member_id for member_id in member_ids if member_id not in profiles]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more staff members were not found.")

    memberships = client.table("message_thread_members").select("*").eq("thread_id", thread_id).execute().data or []
    memberships_by_user = {membership["user_id"]: membership for membership in memberships}
    active_member_ids = {membership["user_id"] for membership in memberships if not membership.get("deleted_at")}
    requested_member_ids = [member_id for member_id in member_ids if member_id not in active_member_ids]
    restore_member_ids = [
        member_id
        for member_id in requested_member_ids
        if memberships_by_user.get(member_id, {}).get("deleted_at")
    ]
    insert_member_ids = [member_id for member_id in requested_member_ids if member_id not in memberships_by_user]

    if restore_member_ids:
        (
            client.table("message_thread_members")
            .update({"deleted_at": None, "last_read_at": None})
            .eq("thread_id", thread_id)
            .in_("user_id", restore_member_ids)
            .execute()
        )
    if insert_member_ids:
        client.table("message_thread_members").insert(
            [{"thread_id": thread_id, "user_id": member_id} for member_id in insert_member_ids]
        ).execute()
    if restore_member_ids or insert_member_ids:
        client.table("message_threads").update({"updated_at": datetime.now(UTC).isoformat()}).eq("id", thread_id).execute()

    return _thread_summary(client, thread_id, user.id) or thread


@router.get("/threads/{thread_id}/messages")
def list_messages(thread_id: str, user: Annotated[AuthUser, Depends(get_current_user)]) -> list[dict[str, Any]]:
    client = get_supabase()
    _ensure_thread_member(client, thread_id, user.id)
    messages = _latest_messages_for_thread(client, thread_id)
    sender_ids = list({message["sender_id"] for message in messages})
    profiles = _profiles_by_id(client, sender_ids)
    message_ids = [message["id"] for message in messages]
    attachments_by_message = _attachments_by_message(client, message_ids)
    _mark_thread_read(client, thread_id, user.id)
    return [
        {
            **message,
            "sender": profiles.get(message["sender_id"]),
            "attachments": attachments_by_message.get(message["id"], []),
            "is_mine": message["sender_id"] == user.id,
        }
        for message in messages
    ]


@router.post("/threads/{thread_id}/messages", status_code=201)
def create_message(thread_id: str, payload: MessageCreate, user: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, Any]:
    client = get_supabase()
    _ensure_thread_member(client, thread_id, user.id)
    body = payload.body.strip()
    message = (
        client.table("messages")
        .insert({"thread_id": thread_id, "sender_id": user.id, "body": body})
        .execute()
        .data[0]
    )
    _restore_direct_thread_members(client, thread_id)
    client.table("message_threads").update({"updated_at": datetime.now(UTC).isoformat()}).eq("id", thread_id).execute()
    _mark_thread_read(client, thread_id, user.id)
    profile = _profiles_by_id(client, [user.id]).get(user.id)
    return {**message, "sender": profile, "attachments": [], "is_mine": True}


@router.post("/messages/{message_id}/attachments", status_code=201)
def create_message_attachment(
    message_id: str,
    payload: MessageAttachmentCreate,
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> dict[str, Any]:
    client = get_supabase()
    message = client.table("messages").select("*").eq("id", message_id).single().execute().data
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    _ensure_thread_member(client, message["thread_id"], user.id)
    if message["sender_id"] != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only attach files to your own messages.")

    attachment = (
        client.table("message_attachments")
        .insert(
            {
                "message_id": message_id,
                "bucket": payload.bucket,
                "storage_path": payload.storage_path,
                "file_name": payload.file_name,
                "mime_type": payload.mime_type,
                "file_size": payload.file_size,
            }
        )
        .execute()
        .data[0]
    )
    return attachment


@router.patch("/threads/{thread_id}/read")
def mark_thread_read(thread_id: str, user: Annotated[AuthUser, Depends(get_current_user)]) -> dict[str, bool]:
    client = get_supabase()
    _ensure_thread_member(client, thread_id, user.id)
    _mark_thread_read(client, thread_id, user.id)
    return {"ok": True}


def _thread_summary(client: Any, thread_id: str, user_id: str, membership: dict[str, Any] | None = None) -> dict[str, Any] | None:
    thread_response = client.table("message_threads").select("*").eq("id", thread_id).single().execute()
    thread = thread_response.data
    if not thread:
        return None
    members = client.table("message_thread_members").select("*").eq("thread_id", thread_id).execute().data or []
    profiles = _profiles_by_id(client, [member["user_id"] for member in members])
    latest = (
        client.table("messages")
        .select("*")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    own_membership = membership or next((member for member in members if member["user_id"] == user_id), None)
    if own_membership and own_membership.get("deleted_at"):
        return None
    unread_query = (
        client.table("messages")
        .select("id", count="exact", head=True)
        .eq("thread_id", thread_id)
        .neq("sender_id", user_id)
    )
    if own_membership and own_membership.get("last_read_at"):
        unread_query = unread_query.gt("created_at", own_membership["last_read_at"])
    unread_count = unread_query.execute().count or 0

    return {
        **thread,
        "members": [{**member, "profile": profiles.get(member["user_id"])} for member in members],
        "latest_message": latest[0] if latest else None,
        "unread_count": unread_count,
    }


def _latest_messages_for_thread(client: Any, thread_id: str) -> list[dict[str, Any]]:
    messages = (
        client.table("messages")
        .select("*")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(MESSAGE_PAGE_SIZE)
        .execute()
        .data
        or []
    )
    return list(reversed(messages))


def _ensure_thread_member(client: Any, thread_id: str, user_id: str | UUID) -> dict[str, Any]:
    response = (
        client.table("message_thread_members")
        .select("*")
        .eq("thread_id", thread_id)
        .eq("user_id", str(user_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return response.data[0]


def _mark_thread_read(client: Any, thread_id: str, user_id: str | UUID) -> None:
    client.table("message_thread_members").update({"last_read_at": datetime.now(UTC).isoformat()}).eq("thread_id", thread_id).eq("user_id", str(user_id)).execute()


def _restore_direct_thread_members(client: Any, thread_id: str) -> None:
    thread = client.table("message_threads").select("thread_type").eq("id", thread_id).single().execute().data
    if not thread or thread.get("thread_type") != "direct":
        return
    client.table("message_thread_members").update({"deleted_at": None}).eq("thread_id", thread_id).execute()


def _direct_key(member_ids: list[str]) -> str:
    return ":".join(sorted(member_ids))


def _find_direct_thread(client: Any, direct_key: str, member_ids: list[str], user_id: str) -> dict[str, Any] | None:
    response = (
        client.table("message_threads")
        .select("*")
        .eq("thread_type", "direct")
        .eq("direct_key", direct_key)
        .is_("archived_at", "null")
        .limit(1)
        .execute()
    )
    thread = response.data[0] if response.data else None
    if not thread:
        thread = _find_legacy_direct_thread(client, member_ids, user_id)
    if not thread:
        return None
    membership = (
        client.table("message_thread_members")
        .select("*")
        .eq("thread_id", thread["id"])
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if thread.get("direct_key") != direct_key:
        client.table("message_threads").update({"direct_key": direct_key}).eq("id", thread["id"]).execute()
    return thread if membership else None


def _find_legacy_direct_thread(client: Any, member_ids: list[str], user_id: str) -> dict[str, Any] | None:
    expected = set(member_ids)
    memberships = client.table("message_thread_members").select("*").eq("user_id", user_id).execute().data or []
    for membership in memberships:
        thread = client.table("message_threads").select("*").eq("id", membership["thread_id"]).eq("thread_type", "direct").is_("archived_at", "null").limit(1).execute().data or []
        if not thread:
            continue
        members = client.table("message_thread_members").select("user_id").eq("thread_id", membership["thread_id"]).execute().data or []
        if {member["user_id"] for member in members} == expected:
            return thread[0]
    return None


def _profiles_by_id(client: Any, user_ids: list[str | UUID]) -> dict[str, dict[str, Any]]:
    ids = [str(user_id) for user_id in user_ids if user_id]
    if not ids:
        return {}
    profiles = client.table("profiles").select("id,full_name,role").in_("id", ids).execute().data or []
    return {profile["id"]: profile for profile in profiles}


def _attachments_by_message(client: Any, message_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    if not message_ids:
        return {}
    attachments = client.table("message_attachments").select("*").in_("message_id", message_ids).execute().data or []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for attachment in attachments:
        grouped.setdefault(attachment["message_id"], []).append(attachment)
    return grouped
