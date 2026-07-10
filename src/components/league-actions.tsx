"use client";

import {
  AddTeamIcon,
  ArrowRight01Icon,
  Ticket01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Two entry points shown under the banner: create a private league or join one
// with an invite code. Persistence is a follow-up; for now each opens a form.
export function LeagueActions() {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <section className="league-actions" aria-label="Leagues">
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
              Start a private league and invite your friends to predict.
            </span>
          </span>
          <span className="league-card-arrow" aria-hidden="true">
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </span>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a league</DialogTitle>
            <DialogDescription>
              Give your league a name — you can invite friends once it&apos;s
              created.
            </DialogDescription>
          </DialogHeader>
          <form
            className="league-form"
            onSubmit={(event) => {
              event.preventDefault();
              setCreateOpen(false);
            }}
          >
            <div className="league-field">
              <Label htmlFor="league-name">League name</Label>
              <Input
                autoFocus
                className="h-10"
                id="league-name"
                name="league-name"
                placeholder="e.g. Office World Cup"
                required
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button size="lg" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button size="lg" type="submit">
                Create league
              </Button>
            </DialogFooter>
          </form>
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
              Got an invite code? Jump into a friends&apos; league.
            </span>
          </span>
          <span className="league-card-arrow" aria-hidden="true">
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </span>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a league</DialogTitle>
            <DialogDescription>
              Enter the invite code a friend shared with you.
            </DialogDescription>
          </DialogHeader>
          <form
            className="league-form"
            onSubmit={(event) => {
              event.preventDefault();
              setJoinOpen(false);
            }}
          >
            <div className="league-field">
              <Label htmlFor="invite-code">Invite code</Label>
              <Input
                autoFocus
                className="h-10"
                id="invite-code"
                name="invite-code"
                placeholder="e.g. PG-4F2K"
                required
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button size="lg" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button size="lg" type="submit">
                Join league
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
