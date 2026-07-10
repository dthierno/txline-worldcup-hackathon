import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Story discovery via Google News' public RSS feed (published syndication),
// filtered to FIFA's World Cup coverage. We show headline + source and link
// out; no FIFA imagery or private APIs are used.
const FEED_URL =
  "https://news.google.com/rss/search?q=site:fifa.com+world+cup&hl=en-US&gl=US&ceid=US:en";
const CACHE_TTL_MS = 10 * 60 * 1000;

type Story = {
  id: string;
  link: string;
  publishedAt: string | null;
  title: string;
};

let cache: { at: number; stories: Story[] } | null = null;

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ data: cache.stories, source: "cache" });
  }

  try {
    const response = await fetch(FEED_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Feed failed: ${response.status}`);
    }

    const xml = await response.text();
    const items = [...xml.matchAll(
      /<item><title>(.*?)<\/title><link>(.*?)<\/link><guid[^>]*>(.*?)<\/guid><pubDate>(.*?)<\/pubDate>/g,
    )];
    const stories: Story[] = items.slice(0, 12).map((match) => ({
      id: match[3],
      link: decodeEntities(match[2]),
      publishedAt: match[4] || null,
      title: decodeEntities(match[1]).replace(/\s*-\s*FIFA\s*$/i, ""),
    }));

    if (stories.length > 0) {
      cache = { at: Date.now(), stories };
    }

    return NextResponse.json({
      data: stories,
      source: "Google News RSS (site:fifa.com)",
    });
  } catch (error) {
    // Serve last-good on upstream failure; never break the page.
    return NextResponse.json({
      data: cache?.stories ?? [],
      error: error instanceof Error ? error.message : "Feed unavailable",
      source: cache ? "stale cache" : "unavailable",
    });
  }
}
