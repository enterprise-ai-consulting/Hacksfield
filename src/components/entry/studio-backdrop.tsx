import { Artwork } from "@/ui";

/** Public studio artwork, independent of any member's private library. */
const artwork = [
  "home/slide-image", "home/slide-video", "home/slide-cinema", "sample/1",
  "home/slide-audio", "sample/3", "home/slide-remix", "home/mcp-storyboard",
];

export function StudioBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -inset-x-[20%] -inset-y-[28%] grid -rotate-6 grid-cols-2 grid-rows-4 gap-3 sm:grid-cols-4 sm:grid-rows-2 sm:gap-5">
        {artwork.map(name => <Artwork key={name} name={name} className="size-full min-h-0 rounded-2xl" />)}
      </div>
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#08090b99_100%)]" />
    </div>
  );
}
