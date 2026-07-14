"use client";

import {
  FeedbackWidget,
  type FeedbackData,
} from "@/components/motion/feedback-widget";

const STORAGE_KEY = "fan-forecast.feedback.v1";

// App-wide feedback corner widget. Submissions are stored on the device
// (there is no backend in this demo) - honest storage, not a faked send.
export function Feedback() {
  const submit = async ({ message }: FeedbackData) => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const entries: Array<{ message: string; page: string; sentAt: string }> =
      raw ? JSON.parse(raw) : [];

    entries.push({
      message,
      page: window.location.pathname,
      sentAt: new Date().toISOString(),
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  };

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-0 z-40">
      <FeedbackWidget onSubmit={submit} />
    </div>
  );
}
