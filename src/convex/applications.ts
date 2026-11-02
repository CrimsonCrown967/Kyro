import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  can,
  hydrateUsers,
  logAudit,
  notify,
  requireProfile,
  requireServerAccess,
  requireUser,
  restrictionLevel,
  type Ctx,
} from "./lib";
import { PERMISSIONS } from "../lib/permissions";

const DEFAULT_QUESTIONS = [
  "Why do you want to join this community?",
  "What will you contribute?",
];
const MAX_ANSWER_LENGTH = 1000;

function questionsFor(server: { applicationQuestions?: string[] }): string[] {
  const questions = (server.applicationQuestions ?? [])
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(0, 5);
  return questions.length > 0 ? questions : DEFAULT_QUESTIONS;
}

async function requireStaff(ctx: Ctx, serverId: Id<"servers">) {
  const { id } = await requireUser(ctx);
  const access = await requireServerAccess(ctx, serverId, id);
  if (
    access.server.ownerId !== id &&
    !can(access.permissions, PERMISSIONS.BAN_MEMBERS) &&
    !can(access.permissions, PERMISSIONS.MANAGE_SERVER)
  ) {
    throw new Error("You don't have permission to review applications.");
  }
  return { id, server: access.server };
}

/** Application state for the signed-in visitor, used by the join screen. */
export const status = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id } = await requireUser(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) {
      return {
        applyToJoin: false,
        questions: [] as string[],
        application: null,
      };
    }
    const application = await ctx.db
      .query("joinApplications")
      .withIndex("by_user_server", (q) =>
        q.eq("userId", id).eq("serverId", serverId),
      )
      .order("desc")
      .first();
    return {
      applyToJoin: server.applyToJoin === true && server.isPublic,
      questions: server.applyToJoin === true ? questionsFor(server) : [],
      application: application
        ? {
            id: application._id as string,
            status: application.status,
            note: application.note ?? null,
            createdAt: application.createdAt,
            reviewedAt: application.reviewedAt ?? null,
          }
        : null,
    };
  },
});

export const submit = mutation({
  args: {
    serverId: v.id("servers"),
    answers: v.array(v.string()),
  },
  handler: async (ctx, { serverId, answers }) => {
    const { id, user } = await requireProfile(ctx);
    const server = await ctx.db.get(serverId);
    if (!server) throw new Error("That community no longer exists.");
    if (!server.isPublic) throw new Error("That community is invite-only.");
    if (server.applyToJoin !== true) {
      throw new Error("This community doesn't use applications.");
    }
    const banned = await ctx.db
      .query("bans")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", id),
      )
      .unique();
    if (banned) throw new Error("You're banned from this community.");
    if ((await restrictionLevel(ctx, id)) >= 3) {
      throw new Error("Your account is suspended while staff review it.");
    }
    const member = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", serverId).eq("userId", id),
      )
      .unique();
    if (member) throw new Error("You're already a member.");

    const existing = await ctx.db
      .query("joinApplications")
      .withIndex("by_user_server", (q) =>
        q.eq("userId", id).eq("serverId", serverId),
      )
      .order("desc")
      .first();
    if (existing?.status === "pending") {
      throw new Error("Your application is already waiting for review.");
    }

    const questions = questionsFor(server);
    const cleanAnswers = answers
      .slice(0, questions.length)
      .map((answer) => answer.trim().slice(0, MAX_ANSWER_LENGTH));
    if (cleanAnswers.some((answer) => answer.length < 2)) {
      throw new Error("Answer every question before submitting.");
    }
    const now = Date.now();
    const applicationId = await ctx.db.insert("joinApplications", {
      serverId,
      userId: id,
      answers: questions.map((question, index) => ({
        question,
        answer: cleanAnswers[index] ?? "",
      })),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, {
      serverId,
      actorId: id,
      action: "application.submitted",
      targetType: "application",
      targetId: applicationId,
      details: `${user.name ?? user.username} applied to join`,
    });
    await notify(ctx, {
      userId: server.ownerId,
      type: "system",
      title: `New application for ${server.name}`,
      body: `${user.name ?? user.username} wants to join`,
      actorId: id,
      link: `/dashboard/s/${serverId}/settings/members`,
      containerKey: `applications:${serverId}`,
    });
    return applicationId;
  },
});

/** Pending and recently reviewed applications for staff. */
export const list = query({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => {
    const { id: viewerId } = await requireStaff(ctx, serverId);
    const applications = await ctx.db
      .query("joinApplications")
      .withIndex("by_server_status", (q) => q.eq("serverId", serverId))
      .order("desc")
      .take(100);
    const users = await hydrateUsers(
      ctx,
      applications.map((application) => application.userId),
      viewerId,
    );
    return applications
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        return b.createdAt - a.createdAt;
      })
      .map((application) => ({
        id: application._id as string,
        status: application.status,
        answers: application.answers,
        note: application.note ?? null,
        createdAt: application.createdAt,
        reviewedAt: application.reviewedAt ?? null,
        applicant: users.get(application.userId) ?? null,
      }));
  },
});

export const decide = mutation({
  args: {
    applicationId: v.id("joinApplications"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { applicationId, approve, note }) => {
    const { id: reviewerId } = await requireUser(ctx);
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error("That application no longer exists.");
    if (application.status !== "pending") {
      throw new Error("That application has already been reviewed.");
    }
    await requireStaff(ctx, application.serverId);
    const server = await ctx.db.get(application.serverId);
    if (!server) throw new Error("That community no longer exists.");

    const existingMember = await ctx.db
      .query("serverMembers")
      .withIndex("by_server_user", (q) =>
        q.eq("serverId", application.serverId).eq("userId", application.userId),
      )
      .unique();
    if (approve && !existingMember) {
      await ctx.db.insert("serverMembers", {
        serverId: application.serverId,
        userId: application.userId,
        roleIds: [],
        joinedAt: Date.now(),
      });
    }

    const now = Date.now();
    const cleanNote = note?.trim().slice(0, 500) || undefined;
    await ctx.db.patch(applicationId, {
      status: approve ? "approved" : "rejected",
      note: cleanNote,
      reviewedById: reviewerId,
      reviewedAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, {
      serverId: application.serverId,
      actorId: reviewerId,
      action: approve ? "application.approved" : "application.rejected",
      targetType: "application",
      targetId: applicationId,
      details: cleanNote,
    });
    await notify(ctx, {
      userId: application.userId,
      type: "system",
      title: approve
        ? `You're in — ${server.name} approved your application`
        : `Your application to ${server.name} wasn't approved`,
      body: cleanNote ?? (approve ? "Welcome to the community!" : undefined),
      actorId: reviewerId,
      link: `/dashboard/s/${application.serverId}`,
      containerKey: `applications:${application.serverId}`,
    });
    return { approved: approve };
  },
});
