/**
 * Shared product identity. Hacksfield is derived from the MIT-licensed Parallax studio.
 */
export const brand = {
  name: "Hacksfield",
  tagline: "Your studio. Your providers. No membership fee.",
  description:
    "A membership-free creative studio with direct BytePlus and Decart connections. Bring your own provider accounts and control your spending.",
  /** Shown in the footer and the About dialog. */
  repoUrl: "https://github.com/enterprise-ai-consulting/Hacksfield",
  creditName: "credit",
  creditNamePlural: "credits",
} as const;

export interface NavItem {
  href: string;
  label: string;
  /** Short line shown under the label in menus and on the home page. */
  blurb: string;
}

/** Top-level destinations. Feature teams add pages under these paths. */
export const primaryNav: NavItem[] = [
  { href: "/explore", label: "Explore", blurb: "What people are making right now" },
  { href: "/image", label: "Image", blurb: "Stills from text and references" },
  { href: "/video", label: "Video", blurb: "Shots from text, frames and references" },
  { href: "/audio", label: "Audio", blurb: "Voices and music" },
  { href: "/apps", label: "Apps", blurb: "One-click tools built on the models" },
  { href: "/library", label: "Library", blurb: "Everything you have made" },
];
