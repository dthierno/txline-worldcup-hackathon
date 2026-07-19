import { render } from "@testing-library/react";

import { PointsBadge } from "@/components/home-page";

// The rounded-hexagon fills reference one of two gradient ids; that id is the
// green-vs-grey decision.
const GREY = "url(#pc-badge-fill-muted)";
const GREEN = "url(#pc-badge-fill)";

function fill(container: HTMLElement) {
  return container.querySelector("path")?.getAttribute("fill");
}

describe("PointsBadge is grey for any zero", () => {
  it("greys a zero score even without the muted flag (prediction made, scored 0)", () => {
    const { container } = render(<PointsBadge points={0} />);

    expect(fill(container)).toBe(GREY);
  });

  it("greys a zero when muted (no prediction made)", () => {
    const { container } = render(<PointsBadge muted points={0} />);

    expect(fill(container)).toBe(GREY);
  });

  it("stays green for a positive score", () => {
    const { container } = render(<PointsBadge points={8} />);

    expect(fill(container)).toBe(GREEN);
  });
});
