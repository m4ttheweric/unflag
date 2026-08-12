import { defineFeatures, input } from 'unflag';
import { z } from 'zod/v4';
import type { DemoFlags, PlanConfig } from '../rawConfig';

export const supportDeskFeatures = defineFeatures({
  inputs: { flags: input<DemoFlags>(), plan: input<PlanConfig>() },
  features: {
    ticketChat: {
      reads: { flags: ['ticket-chat-rollout', 'ticket-chat-bot-variant'] },
      output: z.enum(['agent-chat', 'bot-chat', 'disabled']),
      resolve: ({ flags }) =>
        !flags['ticket-chat-rollout'] ? 'disabled'
        : flags['ticket-chat-bot-variant'] ? 'bot-chat'
        : 'agent-chat',
    },
    attachments: {
      reads: { flags: ['sd-1234-attachments-kill-switch'] },
      output: z.boolean(),
      // kill switch polarity absorbed here, never visible to app code
      resolve: ({ flags }) => !flags['sd-1234-attachments-kill-switch'],
    },
    ticketLimits: {
      reads: { plan: ['tier', 'maxOpenTickets'] },
      output: z.object({ maxOpen: z.number(), upgradeNudge: z.boolean() }),
      resolve: ({ plan }) => ({
        maxOpen: plan.maxOpenTickets,
        upgradeNudge: plan.tier === 'free',
      }),
    },
  },
});
