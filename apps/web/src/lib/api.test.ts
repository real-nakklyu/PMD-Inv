import { describe, expect, it } from "vitest";

import { formatApiErrorBody } from "@/lib/api";

describe("formatApiErrorBody", () => {
  it("returns readable FastAPI detail strings", () => {
    expect(formatApiErrorBody(JSON.stringify({ detail: "Serial number already exists." }), 409)).toBe("Serial number already exists.");
  });

  it("returns readable validation messages", () => {
    const body = JSON.stringify({ detail: [{ msg: "Field required" }, { msg: "Must be positive" }] });
    expect(formatApiErrorBody(body, 422)).toBe("Field required Must be positive");
  });

  it("uses friendly auth messages", () => {
    expect(formatApiErrorBody("{}", 403)).toBe("You do not have permission to perform this action.");
  });
});
