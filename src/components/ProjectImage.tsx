import { useEffect, useRef, useState } from "react";
import type { Repository } from "../catalog";
import { getProjectGuide } from "../projectGuides";
import { projectImageSizes } from "../projectMedia";
import type { ProjectMedia as Media } from "../projectMedia";

const cache = new Map<string, Promise<Media>>();
const resolved = new Map<string, Media>();
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
        .catch(() => ({ image: null, pending: true }))
        .then((value) => {
          resolved.set(key, value);
          if (value.pending) {
            cache.delete(key);
            resolved.delete(key);
          }
          if (resolved.size > 500)
            resolved.delete(resolved.keys().next().value!);
          return value;
        }),
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
  const supplied: Media | undefined = known
    ? {
        image: {
          url: known,
          alt: `${repo.name} 项目官方截图`,
          sourceUrl: `${repo.url}#readme`,
        },
      }
    : repo.media;
  const [media, setMedia] = useState<Media | null>(
    known
      ? {
          image: {
            url: known,
            alt: `${repo.name} 项目官方截图`,
            sourceUrl: `${repo.url}#readme`,
          },
        }
      : resolved.get(repo.fullName.toLowerCase()) || null,
  );
  const [failed, setFailed] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (supplied) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const load = () =>
      void loadMedia(repo).then((value) => {
        if (!active) return;
        setMedia(value);
        if (value.pending && attempts++ < 2) retry = setTimeout(load, 30_000);
      });
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "300px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false;
      clearTimeout(retry);
      observer.disconnect();
    };
  }, [repo.fullName, known, repo.media]);
  const selected = supplied || media;
  if (!selected?.image || failed === selected.image.url)
    return (
      <span ref={ref} className="project-media-sentinel" aria-hidden="true" />
    );
  const image = (
    <img
      src={selected.image.url}
      srcSet={selected.image.srcSet}
      sizes={selected.image.srcSet ? projectImageSizes : undefined}
      width={selected.image.width}
      height={selected.image.height}
      alt={selected.image.alt || `${repo.name} README 项目图片`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        const width = selected.image!.width || naturalWidth;
        const height = selected.image!.height || naturalHeight;
        if (width < 240 || height < 100 || width / height > 6)
          setFailed(selected.image!.url);
      }}
      onError={() => setFailed(selected.image!.url)}
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
      href={selected.image.sourceUrl}
      target="_blank"
      rel="noreferrer"
      title="查看项目图片来源"
    >
      {image}
    </a>
  );
}
