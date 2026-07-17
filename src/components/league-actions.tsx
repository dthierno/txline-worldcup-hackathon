"use client";

import { AddTeamIcon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadLeagues,
  saveLeague,
  saveSelectedBoard,
} from "@/lib/prediction-store";

// Invite codes look like PG-4F2K: unambiguous characters only.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "PG-";

  for (let index = 0; index < 4; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }

  return code;
}

// Two entry points shown under the banner: create a private league or join
// one with an invite code. Leagues persist on this device (same store as
// picks); creating or joining also switches the homepage leaderboard to it.
export function LeagueActions() {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  // After a create, the dialog swaps to the share step with the new code.
  const [created, setCreated] = useState<{ code: string; name: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  function createLeague(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = String(
      new FormData(event.currentTarget).get("league-name") ?? "",
    ).trim();

    if (!name) {
      return;
    }

    const code = generateCode();

    saveLeague({
      code,
      joinedAt: new Date().toISOString(),
      name,
      role: "owner",
    });
    saveSelectedBoard(code);
    setCreated({ code, name });
  }

  function joinLeague(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = String(new FormData(event.currentTarget).get("invite-code") ?? "")
      .trim()
      .toUpperCase();

    if (!code) {
      return;
    }

    // Without a backend the code is all we know: joining a code this device
    // has never seen files it under a name derived from the code.
    const existing = loadLeagues().find((league) => league.code === code);

    saveLeague(
      existing ?? {
        code,
        joinedAt: new Date().toISOString(),
        name: `League ${code.replace(/^PG-/, "")}`,
        role: "member",
      },
    );
    saveSelectedBoard(code);
    setJoinOpen(false);
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
          {created ? (
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
              <form className="league-form" onSubmit={createLeague}>
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
                    type="submit"
                  >
                    <span>Create league</span>
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

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
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
          <DialogDescription className="league-modal-desc">
            Enter the invite code a friend shared with you.
          </DialogDescription>
          <form className="league-form" onSubmit={joinLeague}>
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
            </div>
            <div className="lc-prompt-actions">
              <button className="lc-prompt-btn lc-prompt-btn-main" type="submit">
                <span>Join league</span>
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
        </DialogContent>
      </Dialog>
    </section>
  );
}
