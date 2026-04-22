import { describe, expect, it, vi } from "vitest";

import { downloadCsv } from "@/lib/export";

describe("downloadCsv", () => {
  it("creates a csv download for provided rows", () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.spyOn(document, "createElement").mockReturnValue({ click } as unknown as HTMLAnchorElement);

    downloadCsv("inventory.csv", [{ serial: "ABC-123", status: "available" }]);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv");

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("does nothing when there are no rows", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");

    downloadCsv("empty.csv", []);

    expect(createObjectURL).not.toHaveBeenCalled();
    createObjectURL.mockRestore();
  });
});
