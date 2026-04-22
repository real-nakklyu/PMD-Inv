import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("humanizes enum labels", () => {
    render(<Badge>return_in_progress</Badge>);
    expect(screen.getByText("Return In Progress")).toBeInTheDocument();
  });
});
