import Link from "next/link";

// Sticky top header (structure from FotMob's Predict header; PredGame wordmark
// and a generic account icon in place of their branded assets).
export function Header() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-logo" href="/" aria-label="PredGame home">
          Pred<span>Game</span>
        </Link>
        <button className="app-signin" type="button" aria-label="Sign in">
          <svg
            width="36"
            height="36"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M16 2.66675C23.3638 2.66675 29.3333 8.63628 29.3333 16.0001C29.3333 23.3639 23.3638 29.3334 16 29.3334C8.63616 29.3334 2.66663 23.3639 2.66663 16.0001C2.66663 8.63628 8.63616 2.66675 16 2.66675ZM16 17.3334C13.0544 17.3334 10.6666 18.5273 10.6666 20.0001C10.6666 21.4729 10.6666 22.6667 16 22.6667C21.3333 22.6667 21.3333 21.4729 21.3333 20.0001C21.3333 18.5273 18.9454 17.3334 16 17.3334ZM16 9.33342C14.5272 9.33342 13.3333 10.5273 13.3333 12.0001C13.3333 13.4729 14.5272 14.6667 16 14.6667C17.4728 14.6667 18.6666 13.4729 18.6666 12.0001C18.6666 10.5273 17.4728 9.33342 16 9.33342Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
