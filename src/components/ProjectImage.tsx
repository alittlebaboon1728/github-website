import { useEffect, useRef, useState } from "react";
import type { Repository } from "../catalog";
import { getProjectGuide } from "../projectGuides";

type Media = { image: { url: string; alt: string; sourceUrl: string } | null };
const cache = new Map<string, Promise<Media>>();
function loadMedia(repo: Repository) {
  const key = repo.fullName.toLowerCase();
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(
        `/api/observatory/project-media?repo=${encodeURIComponent(repo.fullName)}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("media unavailable");
          const value = await response.json();
          return value.data as Media;
        })
        .catch(() => ({ image: null })),
    );
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}
export default function ProjectImage({
  repo,
  onPreview,
}: {
  repo: Repository;
  onPreview?: () => void;
}) {
  return (
    <RepositoryImage key={repo.fullName} repo={repo} onPreview={onPreview} />
  );
}
function RepositoryImage({
  repo,
  onPreview,
}: {
  repo: Repository;
  onPreview?: () => void;
}) {
  const known = getProjectGuide(repo)?.image;
  const [media, setMedia] = useState<Media | null>(
    known
      ? {
          image: {
            url: known,
            alt: `${repo.name} 项目官方截图`,
            sourceUrl: `${repo.url}#readme`,
          },
        }
      : null,
  );
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (known) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadMedia(repo).then((value) => {
          if (active) setMedia(value);
        });
      },
      { rootMargin: "300px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [repo.fullName, known]);
  if (!media?.image || failed)
    return (
      <span ref={ref} className="project-media-sentinel" aria-hidden="true" />
    );
  const image = (
    <img
      src={media.image.url}
      alt={media.image.alt || `${repo.name} README 项目图片`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (
          naturalWidth < 240 ||
          naturalHeight < 100 ||
          naturalWidth / naturalHeight > 6
        )
          setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
  return onPreview ? (
    <button
      className="trend-card-cover"
      onClick={onPreview}
      aria-label={`查看 ${repo.name} 的项目配图`}
      title="来自项目 README，点击了解项目"
    >
      {image}
    </button>
  ) : (
    <a
      className="trend-card-cover"
      href={media.image.sourceUrl}
      target="_blank"
      rel="noreferrer"
      title="查看项目图片来源"
    >
      {image}
    </a>
  );
}
