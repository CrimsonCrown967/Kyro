/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../src/convex/schema";
import { api, internal } from "../../src/convex/_generated/api";

const modules = import.meta.glob("../../src/convex/**/*.{ts,tsx}");
const email = "recipient@kyro-test.invalid";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("KYRO_RESET_PEPPER", "test-pepper-".repeat(8));
  vi.stubEnv("KYRO_EMAIL_VERIFY_PEPPER", "verify-pepper-".repeat(8));
  vi.stubEnv("EMAIL_DISPATCH_URL", "https://kyro-chat.cyou/api/email/dispatch");
  vi.stubEnv("EMAIL_DISPATCH_SECRET", "test-dispatch-secret");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => ({
    staff: await ctx.db.insert("users", {
      role: "admin",
      username: "staff",
      name: "Staff",
    }),
    user: await ctx.db.insert("users", {
      email,
      username: "member",
      name: "Member",
      requiresEmailVerification: true,
    }),
  }));
  return { t, ...ids };
}

describe("transactional email delivery", () => {
  it("queues staff warnings and sends directly to the canonical authenticated endpoint", async () => {
    const { t, staff, user } = await fixture();
    await t
      .withIdentity({ subject: staff })
      .mutation(api.warnings.warn, {
        userId: user,
        reason: "Please follow the community rules.",
      });
    const row = await t.run((ctx) => ctx.db.query("emailOutbox").unique());
    expect(row?.template).toBe("warning");
    expect(row?.to).toBe(email);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, messageId: "smtp-accepted" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.emailDelivery.deliver, { outboxId: row!._id });
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://www.kyro-chat.cyou/api/email/dispatch");
    expect(request.redirect).toBe("manual");
    expect(request.headers.Authorization).toBe("Bearer test-dispatch-secret");
    expect(JSON.parse(request.body).to).toBe(email);
    expect((await t.run((ctx) => ctx.db.get(row!._id)))?.status).toBe("sent");
  });

  it("keeps warnings saved when dispatch fails, retries safely, and rejects redirects", async () => {
    const { t, staff, user } = await fixture();
    await t
      .withIdentity({ subject: staff })
      .mutation(api.warnings.warn, {
        userId: user,
        reason: "Test warning delivery failure",
      });
    const row = await t.run((ctx) => ctx.db.query("emailOutbox").unique());
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, {
            status: 308,
            headers: { Location: "https://untrusted.invalid" },
          }),
        ),
    );
    await t.action(internal.emailDelivery.deliver, { outboxId: row!._id });
    const failed = await t.run((ctx) => ctx.db.get(row!._id));
    expect(failed?.lastErrorCode).toBe("DISPATCH_REDIRECT");
    expect(failed?.status).toBe("failed");
    expect(
      await t.run((ctx) => ctx.db.query("warnings").collect()),
    ).toHaveLength(1);
    expect(
      await t.mutation(internal.emailOutbox.claim, { outboxId: row!._id }),
    ).toBeNull();
    vi.setSystemTime(failed!.nextAttemptAt);
    expect(
      await t.mutation(internal.emailOutbox.claim, { outboxId: row!._id }),
    ).not.toBeNull();
  });

  it("queues password-reset codes and removes the plaintext payload after sending", async () => {
    const { t, user } = await fixture();
    await t.mutation(internal.passwordResetInternal.prepare, {
      email,
      userId: user,
      code: "123456",
    });
    const row = await t.run((ctx) => ctx.db.query("emailOutbox").unique());
    expect(row?.template).toBe("password_reset");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ok: true, messageId: "reset-accepted" }),
        ),
    );
    await t.action(internal.emailDelivery.deliver, { outboxId: row!._id });
    const sent = await t.run((ctx) => ctx.db.get(row!._id));
    expect(sent?.status).toBe("sent");
    expect(sent?.payload).toBe("{}");
  });

  it("does not deliver replaced or expired reset codes from the retry queue", async () => {
    const { t, user } = await fixture();
    await t.mutation(internal.passwordResetInternal.prepare, {
      email,
      userId: user,
      code: "123456",
    });
    const old = await t.run((ctx) => ctx.db.query("emailOutbox").unique());
    vi.setSystemTime(Date.now() + 61000);
    await t.mutation(internal.passwordResetInternal.prepare, {
      email,
      userId: user,
      code: "654321",
    });
    expect(
      await t.mutation(internal.emailOutbox.claim, { outboxId: old!._id }),
    ).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(old!._id)))?.lastErrorCode).toBe(
      "CODE_SUPERSEDED",
    );
    const current = await t.run((ctx) =>
      ctx.db.query("emailOutbox").order("desc").first(),
    );
    vi.setSystemTime(Date.now() + 600001);
    expect(
      await t.mutation(internal.emailOutbox.claim, { outboxId: current!._id }),
    ).toBeNull();
    expect(
      (await t.run((ctx) => ctx.db.get(current!._id)))?.lastErrorCode,
    ).toBe("CODE_EXPIRED");
  });

  for (const kind of ["reset", "verification"] as const) {
    it(`persists wrong ${kind} attempts and cancels the code on the fifth attempt`, async () => {
      const { t, user } = await fixture();
      const prepare =
        kind === "reset"
          ? internal.passwordResetInternal.prepare
          : internal.emailVerificationInternal.prepare;
      const verify =
        kind === "reset"
          ? internal.passwordResetInternal.verify
          : internal.emailVerificationInternal.verify;
      const table =
        kind === "reset" ? "passwordResetCodes" : "emailVerificationCodes";
      await t.mutation(prepare, { email, userId: user, code: "123456" });
      for (let attempt = 1; attempt <= 5; attempt++) {
        expect((await t.mutation(verify, { email, code: "000000" })).ok).toBe(
          false,
        );
        const row = await t.run((ctx) => ctx.db.query(table).unique());
        if (attempt < 5) expect(row?.attempts).toBe(attempt);
        else expect(row).toBeNull();
      }
      expect((await t.mutation(verify, { email, code: "123456" })).ok).toBe(
        false,
      );
    });
  }

  it("does not allow an ordinary member to issue warnings", async () => {
    const { t, staff, user } = await fixture();
    await expect(
      t
        .withIdentity({ subject: user })
        .mutation(api.warnings.warn, {
          userId: staff,
          reason: "Unauthorized test",
        }),
    ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query("emailOutbox").collect()),
    ).toHaveLength(0);
  });
});
