import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  brainDumps: defineTable({
    userId: v.id("users"),
    originalText: v.string(),
    summary: v.string(),
    whatMatters: v.array(v.string()),
    whatDoesnt: v.array(v.string()),
    actionableFocus: v.string(),
    processed: v.boolean(),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
