export type ProjectMedia = {
  image: {
    url: string;
    alt: string;
    sourceUrl: string;
    width?: number;
    height?: number;
    srcSet?: string;
  } | null;
  pending?: boolean;
};
export const projectImageSizes = "(max-width: 700px) 100vw, 50vw";

const seen = new Set<string>();
const queue: { url: string; srcSet?: string }[] = [];
let active = 0;
function drain() {
  while (active < 3 && queue.length) {
    const next = queue.shift()!;
    const image = new Image();
    active++;
    image.decoding = "async";
    image.fetchPriority = "low";
    const done = () => {
      active--;
      drain();
    };
    image.onload = done;
    image.onerror = () => {
      seen.delete(next.url);
      done();
    };
    if (next.srcSet) {
      image.sizes = projectImageSizes;
      image.srcset = next.srcSet;
    }
    image.src = next.url;
  }
}
/** Warm only the first few local thumbnails of a likely next view. */
export function preloadProjectImages(
  repos: { media?: ProjectMedia; owner?: { avatar_url: string } }[],
  limit = 4,
) {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (
    document.hidden ||
    connection?.saveData ||
    ["2g", "slow-2g"].includes(connection?.effectiveType || "")
  )
    return;
  for (const repo of repos.slice(0, limit)) {
    for (const image of [
      repo.media?.image,
      repo.owner ? { url: repo.owner.avatar_url } : null,
    ]) {
      if (
        !image?.url.startsWith("/api/observatory/images/") ||
        seen.has(image.url) ||
        queue.length >= 36
      )
        continue;
      seen.add(image.url);
      if (seen.size > 600) seen.delete(seen.values().next().value!);
      queue.push(image);
    }
  }
  drain();
}
