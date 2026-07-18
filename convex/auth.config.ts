// Server-side auth: Convex validates Clerk access tokens minted from the
// "convex" JWT template. CLERK_JWT_ISSUER_DOMAIN is set on the Convex
// deployment (the Clerk Frontend API URL).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
