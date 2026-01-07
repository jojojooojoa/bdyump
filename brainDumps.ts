import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

export const createBrainDump = mutation({
  args: {
    originalText: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Must be logged in to create brain dump");
    }

    const brainDumpId = await ctx.db.insert("brainDumps", {
      userId,
      originalText: args.originalText,
      summary: "",
      whatMatters: [],
      whatDoesnt: [],
      actionableFocus: "",
      processed: false,
    });

    // Schedule processing
    await ctx.scheduler.runAfter(0, internal.brainDumps.processBrainDump, {
      brainDumpId,
    });

    return brainDumpId;
  },
});

export const getBrainDumps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    return await ctx.db
      .query("brainDumps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);
  },
});

export const getBrainDump = query({
  args: { id: v.id("brainDumps") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const brainDump = await ctx.db.get(args.id);
    if (!brainDump || brainDump.userId !== userId) {
      return null;
    }

    return brainDump;
  },
});

export const processBrainDump = internalAction({
  args: {
    brainDumpId: v.id("brainDumps"),
  },
  handler: async (ctx, args) => {
    const brainDump = await ctx.runQuery(api.brainDumps.getBrainDump, {
      id: args.brainDumpId,
    });

    if (!brainDump) {
      throw new Error("Brain dump not found");
    }

    try {
      const prompt = `
Analyze this brain dump and help the person find clarity. Extract:

1. A brief, empathetic summary (2-3 sentences)
2. What matters most (3-5 key points that are important/actionable)
3. What doesn't matter right now (2-4 things that are distractions or less urgent)
4. One clear, specific actionable focus for today

Be compassionate and practical. Help them feel heard while providing clarity.

Brain dump:
"${brainDump.originalText}"

Respond in this exact JSON format:
{
  "summary": "Brief empathetic summary here",
  "whatMatters": ["Important point 1", "Important point 2", "Important point 3"],
  "whatDoesnt": ["Distraction 1", "Less urgent item 2"],
  "actionableFocus": "One specific action they can take today"
}`;

      const response = await fetch(`${process.env.CONVEX_OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.CONVEX_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Parse the JSON response
      const analysis = JSON.parse(content);

      await ctx.runMutation(internal.brainDumps.updateBrainDumpAnalysis, {
        brainDumpId: args.brainDumpId,
        summary: analysis.summary,
        whatMatters: analysis.whatMatters,
        whatDoesnt: analysis.whatDoesnt,
        actionableFocus: analysis.actionableFocus,
      });
    } catch (error) {
      console.error("Error processing brain dump:", error);
      // Fallback analysis
      await ctx.runMutation(internal.brainDumps.updateBrainDumpAnalysis, {
        brainDumpId: args.brainDumpId,
        summary: "I can see you have a lot on your mind. Let's break this down into manageable pieces.",
        whatMatters: ["Take a deep breath", "Focus on one thing at a time"],
        whatDoesnt: ["Overwhelming yourself with everything at once"],
        actionableFocus: "Choose the most important item and spend 15 minutes on it",
      });
    }
  },
});

export const updateBrainDumpAnalysis = internalMutation({
  args: {
    brainDumpId: v.id("brainDumps"),
    summary: v.string(),
    whatMatters: v.array(v.string()),
    whatDoesnt: v.array(v.string()),
    actionableFocus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.brainDumpId, {
      summary: args.summary,
      whatMatters: args.whatMatters,
      whatDoesnt: args.whatDoesnt,
      actionableFocus: args.actionableFocus,
      processed: true,
    });
  },
});
