import { clerkMiddleware } from "@clerk/nextjs/server";

// The whole app is browsable without an account - signing in is a feature
// (leagues, your identity across devices), not a gate. Clerk still runs on
// every route so auth() is available; individual features opt in to it.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
