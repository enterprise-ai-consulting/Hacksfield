/**
 * Everything on screen that is ours rather than the design system's: page addresses, nav
 * labels, promo wording, hero copy and pictures. The layout, type, colour and spacing come
 * from the design; the words and images here are original. Change the product's voice
 * in this one file.
 */
import { brand } from "@/config/brand";

/** Every page address. Link with these, never with a typed-out string. */
export const routes = {
  home: "/",
  explore: "/explore",
  community: "/community",
  /** One public post: `${routes.post}/<post id>`. */
  post: "/community/post",
  /** A member's public page: `${routes.profile}/<handle>`. */
  profile: "/u",
  image: "/image",
  video: "/video",
  audio: "/audio",
  mcp: "/mcp",
  developer: "/developer",
  cinema: "/cinema",
  remix: "/remix",
  horizon: "/horizon",
  contests: "/contests",
  shorts: "/shorts",
  ads: "/ads",
  supercomputer: "/supercomputer",
  canvas: "/canvas",
  apps: "/apps",
  library: "/library",
  pricing: "/pricing",
  enterprise: "/enterprise",
  guide: "/guide",
  login: "/login",
  join: "/join",
  wallet: "/wallet",
  settings: "/settings",
  notifications: "/notifications",
  whatsNew: "/whats-new",
  search: "/search",
  invite: "/invite",
} as const;

export type NavId =
  | "explore"
  | "image"
  | "video"
  | "audio"
  | "mcp"
  | "developer"
  | "cinema"
  | "remix"
  | "horizon"
  | "contests"
  | "shorts"
  | "ads"
  | "supercomputer"
  | "canvas"
  | "apps"
  | "library"
  | "pricing"
  | "enterprise";

export interface NavLink {
  id: NavId;
  href: string;
  label: string;
  /** The small label after the name. `brand` is lime, `neutral` is grey. */
  tag?: { label: string; tone: "brand" | "neutral" };
  /** Drawn in the silver gradient. */
  chrome?: boolean;
}

/** Left of the divider in the top nav. */
export const navPrimary: NavLink[] = [
  { id: "explore", href: routes.explore, label: "Explore" },
  { id: "image", href: routes.image, label: "Image" },
  { id: "video", href: routes.video, label: "Video" },
  { id: "audio", href: routes.audio, label: "Audio" },
  { id: "mcp", href: routes.mcp, label: "MCP" },
  { id: "developer", href: routes.developer, label: "API" },
];

/** Right of the divider: the studios. */
export const navStudios: NavLink[] = [
  { id: "cinema", href: routes.cinema, label: "Cinema Studio" },
  { id: "remix", href: routes.remix, label: "Remix", tag: { label: "Top", tone: "brand" } },
  { id: "horizon", href: routes.horizon, label: "Horizon", tag: { label: "Soon", tone: "neutral" } },
  { id: "contests", href: routes.contests, label: "Contests", chrome: true },
  { id: "shorts", href: routes.shorts, label: "Shorts", tag: { label: "New", tone: "neutral" } },
  { id: "ads", href: routes.ads, label: "Ads Studio" },
];

/**
 * Shown beside "Pricing" and "Upgrade". It is the real saving from paying yearly
 * (ten months charged for twelve, see src/server/account/plans.ts). Empty hides it.
 */
export const pricingBadge = "-17%";

/**
 * The strip above the nav. It counts down to `endsAt` and removes itself after that.
 * Set `enabled` to false to drop it.
 *
 * Keep it true. The countdown is real: the code below is seeded by
 * migrations/100_launch.sql with the same end time, and the server refuses it afterwards.
 * To run a new offer, add a migration with the new code and change `id`, `code` and `endsAt`.
 */
export const promo = {
  enabled: true,
  /** Change this when the offer changes, so people who closed the last one see the new one. */
  id: "launch-week-2026-11",
  endsAt: "2026-11-20T08:00:00Z",
  code: "LAUNCH-WEEK",
  countdownLabel: "Offer ends in",
  /** Reads as: "Launch week: code LAUNCH-WEEK adds 100 free credits on [logo] Hacksfield". */
  text: "Launch week: code LAUNCH-WEEK adds 100 free credits on",
  cta: { label: "Create your free account", href: routes.join },
  /** For someone who already has an account: straight to the code field in their wallet. */
  memberCta: { label: "Enter your code", href: `${routes.wallet}#promo` },
} as const;

/** The empty state of each create page: four tiles, two lines, one sentence. */
export const heroes = {
  image: {
    tiles: ["/media/hero/tile-1.jpg", "/media/hero/tile-2.jpg", "/media/hero/tile-3.jpg", "/media/hero/tile-4.jpg"],
    lineOne: "Make your first image with",
    lineTwo: `${brand.name} Image`,
    sub: "Type a subject, a place, a mood or a style, then press Generate to see it",
    placeholder: "Describe the image you have in mind",
  },
} as const;

/** The pill at the top of an empty create page. */
export const guideHint = {
  id: "guide-hint-v1",
  title: "Not sure where to begin?",
  sub: "Follow the guide to your first image",
  cta: { label: "Open guide", href: routes.guide },
} as const;
