import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { chatModel } from "../models/chat.model";

function organizationIdOf(user: { organizationId: number | null }) {
  return user.organizationId ?? 1;
}

export const chatRouter = router({
  contacts: protectedProcedure.query(({ ctx }) =>
    chatModel.listContacts(organizationIdOf(ctx.user), ctx.user.id),
  ),

  threads: protectedProcedure.query(({ ctx }) =>
    chatModel.listThreads(organizationIdOf(ctx.user), ctx.user.id),
  ),

  messages: protectedProcedure
    .input(z.object({ counterpartId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      chatModel.listMessages(organizationIdOf(ctx.user), ctx.user.id, input.counterpartId),
    ),

  send: protectedProcedure
    .input(
      z.object({
        recipientId: z.number().int().positive(),
        body: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(({ ctx, input }) =>
      chatModel.sendMessage({
        organizationId: organizationIdOf(ctx.user),
        senderId: ctx.user.id,
        recipientId: input.recipientId,
        body: input.body,
      }),
    ),

  markRead: protectedProcedure
    .input(z.object({ counterpartId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      chatModel.markRead(organizationIdOf(ctx.user), ctx.user.id, input.counterpartId),
    ),
});
