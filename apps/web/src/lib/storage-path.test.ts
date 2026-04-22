import { describe, expect, it } from "vitest";

import { makeAttachmentPath, sanitizeStorageSegment } from "@/lib/storage-path";

describe("storage path helpers", () => {
  it("sanitizes unsafe storage path segments", () => {
    expect(sanitizeStorageSegment("  Damage Photo #1.JPG  ")).toBe("damage-photo-1.jpg");
  });

  it("builds scoped attachment paths", () => {
    const path = makeAttachmentPath(
      "service-ticket",
      "Ticket 123",
      "Before Repair.pdf",
      new Date("2026-04-21T13:00:00.000Z")
    );

    expect(path).toBe("service-ticket/ticket-123/2026-04-21T13-00-00-000Z-before-repair.pdf");
  });
});
