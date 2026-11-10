## Overview

KyroFree is a React community chat application with a Convex backend. Start with
the [technical architecture overview](docs/architecture.md) for the framework,
database/schema, authentication, API structure, features and dependencies.

The [Bot Developer Platform guide](docs/bot-platform.md) documents application
creation, installation consent, permissions, REST endpoints, slash commands,
signed webhooks and deployment. The [kyro.js SDK](sdk/kyro.js/README.md) is
distributed from this repository and has not been published to npm.

This project uses the following tech stack:

- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Convex (for backend & database)
- Convex Auth (for authentication)
- Framer Motion (for animations)

Frontend and Convex functions live in `src/`; Vercel functions are in `api/`,
supporting Node services in `server/`, and the bot SDK in `sdk/kyro.js/`.

Use bun for the package manager. `package-lock.json` is the source of truth
for npm-based environments (CI, Vercel); run `bun install` only after a
dependency change and keep both locks in sync.

## Deploying to Vercel

The frontend is a Vite SPA; Vercel builds it with `npm run build` and serves
`dist/` (see `vercel.json` — SPA rewrites are configured there, so deep links
like `/invite/<code>` work). Steps:

1. Import the repo into Vercel. If the repo is deployed from git, make sure
   `src/convex/_generated/` is committed — offline codegen lives there (this
   repo intentionally commits it; `.gitignore` no longer excludes it).
2. Set the frontend env var in Project → Settings → Environment Variables:
   `VITE_CONVEX_URL` = your Convex deployment URL, e.g. `https://<deployment>.convex.cloud/`.
   (Without it the app still boots using the fallback documented in `src/main.tsx`,
   but always set it in new deployments.)
3. `VITE_VLY_APP_ID` and `VITE_VLY_MONITORING_URL` are the Freebuff platform
   monitoring hook; they are optional and only affect error reporting.
4. Deploy. The Convex functions themselves are **not** deployed by Vercel —
   push backend changes with `npx convex deploy` (production) or
   `npx convex dev` (local dev deployment) using your Convex CLI login.
   If the app reports `Could not find public function for 'files:registerUpload'`,
   the deployed backend is stale: run `npx convex deploy` against the
   deployment in `VITE_CONVEX_URL`.

After any change to Convex function files, regenerate the static api stub:
`npm run gen:convex` (it mirrors what `npx convex codegen` produces).

## Founder identity

Founder and admin authority is bound to an immutable Convex user id, never a
username (handles can be renamed). On any deployment where platform staff
features are needed:

1. Find the founder account's `_id` in the `users` table (Convex dashboard →
   Data → users, or `npx convex run`).
2. Set it on the deployment: `npx convex env set KYRO_FOUNDER_USER_ID <id>`.
   Until it is set, founder-only features are simply unavailable (fail-closed).

## Password reset

Codes are hashed with a deployment pepper before storage. Set
`npx convex env set KYRO_RESET_PEPPER <random secret>` once per deployment so
stored reset codes can't be replayed from a database dump.

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

## Environment Variables

The project is set up with project specific CONVEX_DEPLOYMENT and VITE_CONVEX_URL environment variables on the client side.

The convex server has a separate set of environment variables that are accessible by the convex backend.

Currently, these variables include auth-specific keys: JWKS, JWT_PRIVATE_KEY, and SITE_URL.

Optional product integrations:

- `KLIPY_API_KEY` (Convex) enables GIF search and share attribution.
- `VITE_ADSENSE_CLIENT` (Vercel/client) is the public AdSense publisher ID,
  such as `ca-pub-…`.
- `VITE_ADSENSE_SETTINGS_SLOT` (Vercel/client) is the public responsive ad-unit
  slot shown at the bottom of Settings. The banner is not rendered unless both
  AdSense values are configured.

# Using Authentication (Important!)

You must follow these conventions when using authentication.

## Auth is already set up.

Authentication uses Convex Auth with a custom password provider, optional TOTP
and recovery codes, and optional email verification. The active provider is
`src/convex/auth/passwordWithTwoFactor.ts`; account creation is implemented in
`src/convex/users/createAccount.ts`.

Also, DO NOT MODIFY THESE AUTH FILES: `src/convex/auth.config.ts` and `src/convex/auth.ts`.

## Using Convex Auth on the backend

On the `src/convex/users.ts` file, you can use the `getCurrentUser` function to get the current user's data.

## Using Convex Auth on the frontend

The `/auth` page is already set up to use auth. Navigate to `/auth` for all log in / sign up sequences.

You MUST use this hook to get user data. Never do this yourself without the hook:

```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

## Protected Routes

The starter `/dashboard` route is protected with `RequireAuth`. Extend that page
for the product's authenticated experience, and reuse `RequireAuth` when adding
another protected route — do NOT hand-roll a redirect to `/auth`, since landing
on a bare sign-in form with no explanation of what was blocked is confusing.

`RequireAuth` states the block on the page the visitor asked for and sends them
to `/auth?returnTo=<current route>` when they choose to sign in, so they come
back to it. Pass `title` and `description` to say what the page is:

```tsx
<Route
  path="/dashboard"
  element={
    <RequireAuth
      title="Sign in to view your dashboard"
      description="Your projects and settings live here."
    >
      <Dashboard />
    </RequireAuth>
  }
/>
```

Pass `redirectImmediately` for a route where bouncing straight to `/auth` really
is better.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Send sign-in and sign-up actions
to `/auth`.

## Authorization

You can perform authorization checks on the frontend and backend.

On the frontend, you can use the `useAuth` hook to get the current user's data and authentication state.

You should also be protecting queries, mutations, and actions at the base level, checking for authorization securely.

## Adding a redirect after auth

The `/auth` route in `src/main.tsx` redirects to `/dashboard` by default. If the
product's main authenticated route is different, update `redirectAfterAuth` to
that route. A validated same-origin `returnTo` query parameter takes priority so
users can resume the protected page they originally requested. Never leave an
authenticated product redirecting back to the public landing page.

## Complete authenticated products

When the requested product implies accounts, a workspace, a dashboard, or other
signed-in functionality, the task is not complete with only a landing page and
auth form. Build the main authenticated experience, protect its route, and verify
that signing in reaches it.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.

- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.

## Landing Pages

You must always create good-looking designer-level styles to your application.

- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.

### Other Items to animate

- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.

## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead.

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.

## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```

## Common Convex Mistakes To Avoid

When using convex, make sure:

- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.
- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.
