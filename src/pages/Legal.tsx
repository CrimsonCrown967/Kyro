import { Link } from "react-router";

type Section = { heading: string; body: string[] };

const TERMS: Section[] = [
  {
    heading: "1. What Kyro is",
    body: [
      "Kyro is a free communication platform for communities: servers, channels, direct messages, roles, moderation and search. Kyro is provided as-is for personal and community use.",
      "Kyro is completely free. There are no paid plans, premium tiers, subscriptions or paywalled features, and we will not charge for the features that exist today.",
    ],
  },
  {
    heading: "2. Your account",
    body: [
      "You may create an account with your email and password. You are responsible for the activity that happens under your account.",
      "Handles (@usernames) are unique and may be reclaimed if they violate these terms or remain associated with abandoned accounts.",
      "You must be at least 13 years old (or the minimum age required in your country) to use Kyro.",
    ],
  },
  {
    heading: "3. Acceptable use",
    body: [
      "Do not use Kyro to harass or threaten people, share content that is illegal, distribute malware, impersonate others, or disrupt communities with spam and abuse.",
      "Community moderators set the rules for their own communities. Following moderator decisions — including kicks, bans and channel restrictions — is a condition of participating there.",
      "Attempting to bypass bans, scrape other users' data, or probe or overload the service is not permitted.",
    ],
  },
  {
    heading: "4. Your content",
    body: [
      "You keep ownership of everything you post. You give Kyro the technical licence needed to store, transmit and display that content as part of operating the service.",
      "You can delete your account at any time from settings; that removes your profile, messages and community memberships from the live service.",
    ],
  },
  {
    heading: "5. Moderation and enforcement",
    body: [
      "We may remove content or suspend accounts that break these terms or the law. Where possible, we will tell you what happened.",
      "Community owners and moderators control their own communities; decisions made by them are their responsibility, though you can report abuse through the in-app reporting tools.",
    ],
  },
  {
    heading: "6. Availability",
    body: [
      "The service is provided without warranty. Features may change, and the service may be interrupted for maintenance or operational reasons.",
      "To the extent permitted by law, Kyro is not liable for indirect or consequential damages arising from your use of the platform.",
    ],
  },
  {
    heading: "7. Changes",
    body: [
      "If these terms change materially, we will surface the update in the product or on this page. Continuing to use Kyro after a change means you accept the updated terms.",
    ],
  },
];

const PRIVACY: Section[] = [
  {
    heading: "What we collect",
    body: [
      "Account data: the email address used to sign in, the @username and display name you choose, avatar, bio, status and preferences.",
      "Content data: messages, replies, attachments, reactions and community membership records you create.",
      "Operational data: session records used to keep you signed in and to let you review or revoke active devices, plus basic timestamps needed for read state and notifications.",
      "Advertising data: on screens where a banner is enabled, Google AdSense may process device and browser information, IP address, cookie identifiers and consent signals to serve, secure and measure ads, subject to your region and consent choices.",
    ],
  },
  {
    heading: "How it is used",
    body: [
      "To run the product: deliver messages, show presence, count unread items, moderate communities and keep the service reliable.",
      "To protect the service: enforce bans, blocks, privacy settings and rate limits, and to investigate abuse reports.",
      "Limited banner advertising helps fund the free service. Kyro does not sell your private messages or read them to build advertising profiles.",
    ],
  },
  {
    heading: "What is shared",
    body: [
      "Other users see what you choose to make visible: your display name, handle, avatar, status, messages in communities you join, and whether you are online if you allow presence to be shown.",
      "Community moderators can see your messages in their communities and manage your membership. Server audit logs record moderator actions.",
      "When an advertising placement is enabled, Google receives the request, device and consent information needed to serve and measure that placement under Google's own privacy terms.",
      "We do not disclose your data to third parties except where required by law or to operate core infrastructure (for example, message and file storage).",
    ],
  },
  {
    heading: "Your controls",
    body: [
      "Privacy settings let you restrict who can send you direct messages or friend requests, hide your presence (including an invisible mode), and mute communities.",
      "From account settings you can review and revoke sessions, export a copy of the data Kyro holds about you, and permanently delete your account.",
      "Blocking a user stops direct contact in both directions.",
    ],
  },
  {
    heading: "Retention and contact",
    body: [
      "Messages and attachments are retained while the account and the communities they belong to exist. Deleting your account removes your profile and messages from the live service; backup copies age out on a routine schedule.",
      "Questions about this policy can be raised through the in-app support channels linked in your account settings.",
    ],
  },
];

function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">
              K
            </span>
            Kyro
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {updated}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          {intro}
        </p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-3 text-sm leading-relaxed text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          Kyro is free for everyone — there are no paid tiers, and nothing in
          these documents describes one.
        </div>
      </main>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 2026"
      intro="These terms govern your use of Kyro. By creating an account or using the platform you agree to them."
      sections={TERMS}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 2026"
      intro="This policy explains what Kyro stores, why it is stored, and the controls you have over it."
      sections={PRIVACY}
    />
  );
}
