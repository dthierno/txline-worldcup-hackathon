"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { AddTeamIcon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useConvexAuth, useMutation } from "convex/react";
import { useState } from "react";

import { api } from "@/../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSelectedBoard } from "@/lib/prediction-store";

// The signed-in fan's display name for a league board row. Points are no longer
// passed from the device - the server seeds them from the fan's settlements.
function useDisplayName() {
  const { user } = useUser();

  return (
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "You"
  );
}

// Shown inside a dialog when the fan isn't signed in - leagues need an account.
function SignInPrompt({ verb }: { verb: string }) {
  return (
    <>
      <p className="league-modal-desc">
        Leagues live across every device, so you need an account to {verb} one.
      </p>
      <div className="lc-prompt-actions lc-prompt-actions-single">
        <SignInButton mode="modal">
          <button className="lc-prompt-btn lc-prompt-btn-main" type="button">
            <span>Sign in</span>
          </button>
        </SignInButton>
      </div>
    </>
  );
}

// Two entry points under the banner: create a private league or join one with
// an invite code. Both persist in Convex and update every member's board live.
export function LeagueActions() {
  const { isAuthenticated } = useConvexAuth();
  const displayName = useDisplayName();
  const createLeague = useMutation(api.leagues.createLeague);
  const joinLeague = useMutation(api.leagues.joinLeague);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [created, setCreated] = useState<{ code: string; name: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = String(
      new FormData(event.currentTarget).get("league-name") ?? "",
    ).trim();

    if (!name || busy) {
      return;
    }

    setBusy(true);

    try {
      const { code } = await createLeague({ displayName, name });

      saveSelectedBoard(code);
      setCreated({ code, name });
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = String(new FormData(event.currentTarget).get("invite-code") ?? "")
      .trim()
      .toUpperCase();

    if (!code || busy) {
      return;
    }

    setBusy(true);
    setJoinError(false);

    try {
      const leagueId = await joinLeague({ code, displayName });

      if (!leagueId) {
        setJoinError(true);

        return;
      }

      saveSelectedBoard(code);
      setJoinOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!created) {
      return;
    }

    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable - the code stays visible to copy by hand.
    }
  }

  return (
    <section className="league-actions" aria-label="Leagues">
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);

          if (!open) {
            setCreated(null);
            setCopied(false);
          }
        }}
      >
        <DialogTrigger
          render={
            <button className="league-card league-card--create" type="button" />
          }
        >
          <span className="league-card-icon">
            <HugeiconsIcon icon={AddTeamIcon} strokeWidth={1.8} />
          </span>
          <span className="league-card-body">
            <span className="league-card-title">Create a league</span>
            <span className="league-card-desc">
              Set one up and invite your friends to predict.
            </span>
          </span>
          <span className="league-card-add" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </DialogTrigger>
        <DialogContent className="lc-prompt league-modal">
          {!isAuthenticated ? (
            <>
              <DialogTitle className="league-modal-title">
                Create a league
              </DialogTitle>
              <SignInPrompt verb="create" />
            </>
          ) : created ? (
            <>
              <DialogTitle className="league-modal-title">
                {created.name} is live
              </DialogTitle>
              <DialogDescription className="league-modal-desc">
                Share this code - friends join from the card next door and
                you battle on the leaderboard.
              </DialogDescription>
              <div className="league-code">{created.code}</div>
              <div className="lc-prompt-actions">
                <button
                  className="lc-prompt-btn lc-prompt-btn-main"
                  onClick={copyCode}
                  type="button"
                >
                  <span>{copied ? "Copied" : "Copy code"}</span>
                </button>
                <button
                  className="lc-prompt-btn lc-prompt-btn-alt"
                  onClick={() => setCreateOpen(false)}
                  type="button"
                >
                  <span>Done</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="league-modal-title">
                Create a league
              </DialogTitle>
              <DialogDescription className="league-modal-desc">
                Name it, get an invite code, rule the leaderboard.
              </DialogDescription>
              <form className="league-form" onSubmit={onCreate}>
                <div className="league-field">
                  <Label htmlFor="league-name">League name</Label>
                  <Input
                    autoFocus
                    className="league-input"
                    id="league-name"
                    name="league-name"
                    placeholder="e.g. Office World Cup"
                    required
                  />
                </div>
                <div className="lc-prompt-actions">
                  <button
                    className="lc-prompt-btn lc-prompt-btn-main"
                    disabled={busy}
                    type="submit"
                  >
                    <span>{busy ? "Creating…" : "Create league"}</span>
                  </button>
                  <button
                    className="lc-prompt-btn lc-prompt-btn-alt"
                    onClick={() => setCreateOpen(false)}
                    type="button"
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={joinOpen}
        onOpenChange={(open) => {
          setJoinOpen(open);

          if (!open) {
            setJoinError(false);
          }
        }}
      >
        <DialogTrigger
          render={
            <button className="league-card league-card--join" type="button" />
          }
        >
          <span className="league-card-icon">
            <HugeiconsIcon icon={Ticket01Icon} strokeWidth={1.8} />
          </span>
          <span className="league-card-body">
            <span className="league-card-title">Join a league</span>
            <span className="league-card-desc">
              Got a code from a friend? Jump straight in.
            </span>
          </span>
          <span className="league-card-add" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </DialogTrigger>
        <DialogContent className="lc-prompt league-modal">
          <DialogTitle className="league-modal-title">
            Join a league
          </DialogTitle>
          {!isAuthenticated ? (
            <SignInPrompt verb="join" />
          ) : (
            <>
              <DialogDescription className="league-modal-desc">
                Enter the invite code a friend shared with you.
              </DialogDescription>
              <form className="league-form" onSubmit={onJoin}>
                <div className="league-field">
                  <Label htmlFor="invite-code">Invite code</Label>
                  <Input
                    autoFocus
                    className="league-input"
                    id="invite-code"
                    name="invite-code"
                    placeholder="e.g. PG-4F2K"
                    required
                  />
                  {joinError ? (
                    <span className="league-error">
                      No league with that code. Check it and try again.
                    </span>
                  ) : null}
                </div>
                <div className="lc-prompt-actions">
                  <button
                    className="lc-prompt-btn lc-prompt-btn-main"
                    disabled={busy}
                    type="submit"
                  >
                    <span>{busy ? "Joining…" : "Join league"}</span>
                  </button>
                  <button
                    className="lc-prompt-btn lc-prompt-btn-alt"
                    onClick={() => setJoinOpen(false)}
                    type="button"
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
