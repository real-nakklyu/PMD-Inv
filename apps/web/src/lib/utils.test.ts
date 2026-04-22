import { describe, expect, it } from "vitest";

import { currency, humanize } from "@/lib/utils";

describe("formatting helpers", () => {
  it("humanizes database enum values", () => {
    expect(humanize("return_in_progress")).toBe("Return In Progress");
  });

  it("formats equipment costs as dollars", () => {
    expect(currency(1280)).toBe("$1,280.00");
  });
});
