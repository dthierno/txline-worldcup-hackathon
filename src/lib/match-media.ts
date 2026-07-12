// Per-fixture highlight media. FotMob gets these from media-partner feeds
// (WSC/TSN clips, FIFA digital hub) via its internal API; there is no public
// equivalent and TxLINE carries no media, so known links are curated here
// and every other finished match falls back to a YouTube highlights search.

export type MatchClip = {
  thumbnail: string;
  title: string;
  url: string;
};

export type MatchOfficialHighlights = {
  source: string;
  thumbnail?: string;
  url: string;
};

export type MatchMedia = {
  clip?: MatchClip;
  official?: MatchOfficialHighlights;
};

export const matchMedia: Record<number, MatchMedia> = {
  // Norway vs England (quarter-final, Jul 11)
  18213979: {
    clip: {
      thumbnail:
        "https://wsc.tsn.ca/games/0efeb2080863c8975fbcc885158ae2bf/a7c3f99c-34bb-48e7-a135-95e649a17a5d_0.jpg",
      title: "Norway vs. England",
      url: "https://wsc.tsn.ca/games/6a52b0028a0342599ed8870d.html?utm_source=Fotmob",
    },
    official: {
      source: "FIFA.com",
      thumbnail:
        "https://digitalhub.fifa.com/transform/a9cc55e6-7b7b-423f-b1d7-53f4b8fd59f7/norway-england-hl?focuspoint=0.5,0.5",
      url: "https://www.fifa.com/en/watch/6BptF8qH4saNhLcDzUOeQG?autoplay=true",
    },
  },
};

export function fallbackOfficialHighlights(
  homeTeam: string,
  awayTeam: string,
): MatchOfficialHighlights {
  const query = encodeURIComponent(
    `${homeTeam} vs ${awayTeam} World Cup 2026 highlights`,
  );

  return {
    source: "YouTube search",
    url: `https://www.youtube.com/results?search_query=${query}`,
  };
}
