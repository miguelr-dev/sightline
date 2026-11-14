import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEMO_VIDEO } from "./content";
import { VideoPlayer, type VideoSource } from "./VideoPlayer";

// Picks the demo source in this order:
//   1. DEMO_VIDEO.youtubeUrl, if set
//   2. public/landing/demo.mp4 (poster: public/landing/demo-poster.jpg; captions: demo.vtt)
//   3. public/landing/walkthrough.mp4, a silent placeholder clip
//   4. the poster alone, marked "coming soon"
// The check runs when the page is built, so redeploy after adding a file.

const inPublic = (p: string) => existsSync(join(process.cwd(), "public", p.replace(/^\//, "")));

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` : null;
}

function pickSource(): VideoSource {
  const embed = DEMO_VIDEO.youtubeUrl.trim() ? youtubeEmbed(DEMO_VIDEO.youtubeUrl.trim()) : null;
  const own = inPublic(DEMO_VIDEO.poster);
  const poster = own ? DEMO_VIDEO.poster : DEMO_VIDEO.fallbackPoster;
  const posterAlt = own ? DEMO_VIDEO.posterAlt : DEMO_VIDEO.fallbackPosterAlt;
  if (embed) return { kind: "youtube", embed, poster, posterAlt };
  if (inPublic(DEMO_VIDEO.file)) {
    const vtt = DEMO_VIDEO.file.replace(/\.mp4$/, ".vtt");
    return { kind: "file", src: DEMO_VIDEO.file, poster, posterAlt, captions: inPublic(vtt) ? vtt : undefined };
  }
  if (inPublic(DEMO_VIDEO.placeholderFile)) {
    return { kind: "file", src: DEMO_VIDEO.placeholderFile, poster: DEMO_VIDEO.fallbackPoster, posterAlt: DEMO_VIDEO.fallbackPosterAlt, silent: true };
  }
  return { kind: "none", poster: DEMO_VIDEO.fallbackPoster, posterAlt: DEMO_VIDEO.fallbackPosterAlt };
}

export function VideoDemo() {
  return <VideoPlayer source={pickSource()} title={DEMO_VIDEO.title} />;
}
