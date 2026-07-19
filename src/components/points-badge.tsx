// The rounded-hexagon points token used on prediction cards and live-call rows.
// Lives in its own module so both the homepage and the profile popup can use it
// without an import cycle. Zero is always grey; green is a positive score.
export function PointsBadge({
  muted,
  points,
}: {
  muted?: boolean;
  points: number;
}) {
  const grey = muted || points === 0;
  const gradientId = grey ? "pc-badge-fill-muted" : "pc-badge-fill";

  return (
    <span
      aria-label={
        muted
          ? "No prediction made - 0 points"
          : points === 0
            ? "0 points earned"
            : `${points} points earned`
      }
      className="pc-points-badge"
      role="img"
    >
      <svg aria-hidden="true" fill="none" viewBox="0 0 12 12">
        <defs>
          {grey ? (
            <linearGradient id={gradientId} x1="0" x2="12" y1="12" y2="0">
              <stop offset="0" stopColor="#3a3a42" />
              <stop offset="1" stopColor="#71717c" />
            </linearGradient>
          ) : (
            <linearGradient id={gradientId} x1="0" x2="12" y1="12" y2="0">
              <stop offset="0" stopColor="#2f9e44" />
              <stop offset="1" stopColor="#a3e635" />
            </linearGradient>
          )}
        </defs>
        <path
          d="M4.9 0.28a2.2 2.2 0 0 1 2.2 0l3.5 1.95c0.68 0.38 1.1 1.07 1.1 1.82v3.9c0 0.75-0.42 1.44-1.1 1.82l-3.5 1.95a2.2 2.2 0 0 1-2.2 0l-3.5-1.95a2.1 2.1 0 0 1-1.1-1.82v-3.9c0-0.75 0.42-1.44 1.1-1.82z"
          fill={`url(#${gradientId})`}
        />
      </svg>
      <span className="pc-points-num">{points}</span>
    </span>
  );
}
