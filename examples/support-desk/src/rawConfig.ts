// Simulates LaunchDarkly-style flags and a tenant config document.
export type DemoFlags = {
  'ticket-chat-rollout': boolean;
  'ticket-chat-bot-variant': boolean;
  'sd-1234-attachments-kill-switch': boolean; // inverted kill switch, on purpose
};

export type PlanConfig = { tier: 'free' | 'pro'; maxOpenTickets: number };

export const defaultFlags: DemoFlags = {
  'ticket-chat-rollout': true,
  'ticket-chat-bot-variant': false,
  'sd-1234-attachments-kill-switch': false,
};

export const defaultPlan: PlanConfig = { tier: 'pro', maxOpenTickets: 25 };
