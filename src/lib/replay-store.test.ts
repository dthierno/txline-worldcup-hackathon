import { describe, expect, it } from "vitest";

import { readProjectedTeamLineup } from "@/lib/replay-store";

// Runs against the committed replay packs, so the projections here are the
// exact ones the lineups route serves for the two remaining fixtures.
describe("readProjectedTeamLineup", () => {
  it.each(["France", "England", "Spain", "Argentina"])(
    "projects a coherent XI for %s",
    (teamName) => {
      const projection = readProjectedTeamLineup(teamName);

      expect(projection).not.toBeNull();

      const starters = projection!.players.filter((player) => player.starter);
      const keepers = starters.filter((player) => player.position === "GK");

      expect(starters).toHaveLength(11);
      expect(keepers).toHaveLength(1);
    },
  );

  it("returns null for a team with no recorded matches", () => {
    expect(readProjectedTeamLineup("Narnia")).toBeNull();
  });
});
