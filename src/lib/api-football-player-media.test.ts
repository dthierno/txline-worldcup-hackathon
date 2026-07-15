import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearApiFootballMediaCache,
  enrichLineupsWithApiFootballImages,
} from "@/lib/api-football-player-media";
import type { NormalizedLineups } from "@/lib/txline-normalize";

const NOW = Date.UTC(2026, 6, 13);

const lineups: NormalizedLineups = {
  teams: [
    {
      isHome: true,
      players: [
        {
          dateOfBirth: "1998-12-20",
          name: "Mbappe Lottin, Kylian",
          number: "10",
          position: "FWD",
          starter: true,
        },
      ],
      teamName: "France",
    },
    {
      isHome: false,
      players: [
        {
          dateOfBirth: "2000-07-21",
          name: "Haaland, Erling",
          number: "9",
          position: "FWD",
          starter: true,
        },
      ],
      teamName: "Norway",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function providerFetch() {
  return vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === "/teams" && url.searchParams.get("search") === "France") {
      return jsonResponse({
        errors: [],
        response: [
          {
            team: {
              country: "France",
              id: 2,
              name: "France",
              national: true,
            },
          },
        ],
      });
    }

    if (url.pathname === "/teams" && url.searchParams.get("search") === "Norway") {
      return jsonResponse({
        errors: [],
        response: [
          {
            team: {
              country: "Norway",
              id: 3,
              name: "Norway",
              national: true,
            },
          },
        ],
      });
    }

    if (url.pathname === "/players/squads" && url.searchParams.get("team") === "2") {
      return jsonResponse({
        errors: [],
        response: [
          {
            players: [
              {
                age: 27,
                id: 278,
                name: "K. Mbappé",
                number: 10,
                photo: "https://media.api-sports.io/football/players/278.png",
                position: "Attacker",
              },
            ],
            team: { id: 2, name: "France" },
          },
        ],
      });
    }

    if (url.pathname === "/players/squads" && url.searchParams.get("team") === "3") {
      return jsonResponse({
        errors: [],
        response: [
          {
            players: [
              {
                age: 25,
                id: 1100,
                name: "Erling Haaland",
                number: 9,
                photo: "https://media.api-sports.io/football/players/1100.png",
                position: "Attacker",
              },
            ],
            team: { id: 3, name: "Norway" },
          },
        ],
      });
    }

    return jsonResponse({ errors: [], response: [] });
  });
}

describe("API-Football player media enrichment", () => {
  beforeEach(() => {
    clearApiFootballMediaCache();
  });

  it("matches reordered and accented player names using squad-level requests", async () => {
    const fetcher = providerFetch();
    const result = await enrichLineupsWithApiFootballImages(lineups, {
      apiKey: "test-key",
      fetcher: fetcher as unknown as typeof fetch,
      now: NOW,
      origin: "https://provider.test",
    });

    expect(result.resolved).toBe(2);
    expect(result.lineups?.teams[0].players[0].imageUrl).toBe(
      "https://media.api-sports.io/football/players/278.png",
    );
    expect(result.lineups?.teams[1].players[0].imageUrl).toBe(
      "https://media.api-sports.io/football/players/1100.png",
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      "x-apisports-key": "test-key",
    });

    await enrichLineupsWithApiFootballImages(lineups, {
      apiKey: "test-key",
      fetcher: fetcher as unknown as typeof fetch,
      now: NOW + 1_000,
      origin: "https://provider.test",
    });

    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not guess when two squad candidates are equally plausible", async () => {
    const fetcher = providerFetch();
    fetcher.mockImplementation(async (input: string | URL | Request) => {
      const url = new URL(String(input));

      if (url.pathname === "/teams") {
        return jsonResponse({
          errors: [],
          response: [
            {
              team: {
                country: "France",
                id: 2,
                name: "France",
                national: true,
              },
            },
          ],
        });
      }

      return jsonResponse({
        errors: [],
        response: [
          {
            players: [
              {
                age: 27,
                name: "Kylian Mbappé",
                photo: "https://provider.test/one.png",
                position: "Attacker",
              },
              {
                age: 27,
                name: "Kylian Mbappé",
                photo: "https://provider.test/two.png",
                position: "Attacker",
              },
            ],
          },
        ],
      });
    });
    const oneTeam: NormalizedLineups = {
      teams: [{ ...lineups.teams[0], players: [{ ...lineups.teams[0].players[0], number: undefined }] }],
    };
    const result = await enrichLineupsWithApiFootballImages(oneTeam, {
      apiKey: "test-key",
      fetcher: fetcher as unknown as typeof fetch,
      now: NOW,
      origin: "https://ambiguous.test",
    });

    expect(result.resolved).toBe(0);
    expect(result.lineups?.teams[0].players[0].imageUrl).toBeUndefined();
  });

  it("returns the original lineups when unconfigured or the provider fails", async () => {
    const unconfiguredFetch = vi.fn();
    const unconfigured = await enrichLineupsWithApiFootballImages(lineups, {
      apiKey: "",
      fetcher: unconfiguredFetch as unknown as typeof fetch,
      now: NOW,
    });

    expect(unconfigured.configured).toBe(false);
    expect(unconfigured.lineups).toBe(lineups);
    expect(unconfiguredFetch).not.toHaveBeenCalled();

    const failingFetch = vi.fn(async () => jsonResponse({}, 503));
    const failed = await enrichLineupsWithApiFootballImages(lineups, {
      apiKey: "test-key",
      fetcher: failingFetch as unknown as typeof fetch,
      now: NOW,
      origin: "https://failure.test",
    });

    expect(failed.configured).toBe(true);
    expect(failed.lineups).toBe(lineups);
    expect(failed.resolved).toBe(0);
  });
});
