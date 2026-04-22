export const attachmentBucket = "service-attachments";

export type AttachmentScope = "service-ticket" | "equipment-damage";

export function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 96) || "file";
}

export function makeAttachmentPath(scope: AttachmentScope, ownerId: string, fileName: string, now = new Date()) {
  const safeOwnerId = sanitizeStorageSegment(ownerId);
  const safeName = sanitizeStorageSegment(fileName);
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${scope}/${safeOwnerId}/${timestamp}-${safeName}`;
}
