import { brand } from "@/config/brand";
import { cn } from "@/ui";

/**
 * An H on a lime tile distinguishes this fork from Parallax. `size` is the tile's side.
 */
export function LogoMark({ size = 20, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
    >
      <rect width="20" height="20" rx="6" fill="#C5F74F" />
      <path d="M5.5 5h3v3.5h3V5h3v10h-3v-3.5h-3V15h-3z" fill="#131517" />
    </svg>
  );
}

/** The mark with the name beside it, for footers and dialogs. */
export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="font-display text-base leading-5 font-bold tracking-[-0.01em] text-text-primary">{brand.name}</span>
    </span>
  );
}

/** A model maker's badge: the first letter of the maker's name. We ship no third-party logos. */
export function VendorGlyph({ vendor, className }: { vendor: string; className?: string }) {
  return (
    <span aria-hidden className={cn("font-display text-xs leading-4 font-bold text-text-primary uppercase", className)}>
      {vendor.trim().charAt(0) || "·"}
    </span>
  );
}
