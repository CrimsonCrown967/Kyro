import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  BUG_LIST_LIMIT,
  hydrateUsers,
  isPlatformStaff,
  isPlatformTrialStaff,
  requireActiveUser,
  requireUser,
} from "./lib";

/** Any platform staff badge (Staff and above) may triage bug reports. */
export function isAdminOrMod(user: Doc<"users">): boolean {
  return isPlatformStaff(user);
}

/** What kind of bug a report is, so staff can triage at a glance. */
const BUG_CATEGORIES = [
  "crash",
  "ui",
  "chat",
  "server",
  "auth",
  "mobile",
  "performance",
  "other",
] as const;

/** File a bug from Settings → My Account → Bug hunting. */
export const create = mutation({
  args: {
    title: v.string(),
    details: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { title, details, category }) => {
    const { id } = await requireActiveUser(ctx);
    const cleanTitle = title.trim().slice(0, 120);
    if (cleanTitle.length < 3) {
      throw new Error("Give the bug a short title — at least 3 characters.");
    }
    const cleanCategory = (BUG_CATEGORIES as readonly string[]).includes(
      category ?? "",
    )
      ? category
      : "other";
    const reportId = await ctx.db.insert("bugReports", {
      reporterId: id,
      title: cleanTitle,
      details: details?.trim().slice(0, 2000) || undefined,
      category: cleanCategory,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return reportId;
  },
});

/** Bug reports this user filed, newest first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const { id } = await requireUser(ctx);
    const reports = await ctx.db
      .query("bugReports")
      .withIndex("by_reporter", (q) => q.eq("reporterId", id))
      .order("desc")
      .take(25);
    return reports.map((report) => ({
      id: report._id as string,
      title: report.title,
      details: report.details ?? null,
      category: report.category ?? "other",
      status: report.status,
      staffNote: report.staffNote ?? null,
      createdAt: report.createdAt,
    }));
  },
});

/** Every bug report — Trial Staff may read; Staff and above may triage. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { id, user } = await requireActiveUser(ctx);
    if (!isPlatformTrialStaff(user)) return [];
    const reports = await ctx.db
      .query("bugReports")
      .order("desc")
      .take(BUG_LIST_LIMIT);
    const reporters = await hydrateUsers(
      ctx,
      reports.map((report) => report.reporterId),
      id,
    );
    return reports.map((report) => ({
      id: report._id as string,
      title: report.title,
      details: report.details ?? null,
      category: report.category ?? "other",
      status: report.status,
      staffNote: report.staffNote ?? null,
      createdAt: report.createdAt,
      reporter: reporters.get(report.reporterId) ?? null,
    }));
  },
});

/** Update a bug's status / staff note — admins only. */
export const updateStatus = mutation({
  args: {
    reportId: v.id("bugReports"),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("fixed"),
      v.literal("not_a_bug"),
    ),
    staffNote: v.optional(v.string()),
  },
  handler: async (ctx, { reportId, status, staffNote }) => {
    const { user } = await requireActiveUser(ctx);
    if (!isAdminOrMod(user)) {
      throw new Error("Only Kyro staff can triage bug reports.");
    }
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error("That bug report no longer exists.");
    await ctx.db.patch(reportId, {
      status,
      staffNote: staffNote?.trim().slice(0, 500) || undefined,
      updatedAt: Date.now(),
    });
  },
});
