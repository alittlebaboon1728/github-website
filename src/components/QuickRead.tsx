import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Star,
} from "lucide-react";
import type { Repository } from "../catalog";
import { formatNumber } from "../catalog";
import { getProjectGuide } from "../projectGuides";
import Dialog from "./Dialog";
import ProjectIntroduction from "./ProjectIntroduction";
import TrialLaunch from "./TrialLaunch";
import { conversationPath } from "../observatoryApi";
import "./quick-read-ask.css";

export default function QuickRead({
  repo,
  saved,
  position,
  total,
  onClose,
  onSave,
  onOpen,
  onPrevious,
  onNext,
}: {
  repo: Repository;
  saved: boolean;
  position: number;
  total: number;
  onClose: () => void;
  onSave: () => void;
  onOpen?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState({ repo: repo.fullName, text: "" });
  const question = draft.repo === repo.fullName ? draft.text : "";
  useEffect(() => {
    content.current?.scrollTo(0, 0);
    setDraft({ repo: repo.fullName, text: "" });
  }, [repo.fullName]);
  return (
    <Dialog
      title={`${repo.name} 快速了解`}
      onClose={onClose}
      className="quick-read-dialog"
      focusInput={false}
    >
      <div className="quick-read-toolbar">
        <span>
          快速了解{" "}
          <small>
            {position + 1} / {total}
          </small>
        </span>
        <div className="quick-read-pager" role="group" aria-label="切换项目">
          <button
            className="bare-control"
            disabled={!onPrevious}
            aria-label="上一个项目"
            onClick={onPrevious}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="bare-control"
            disabled={!onNext}
            aria-label="下一个项目"
            onClick={onNext}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="quick-read-scroll" ref={content}>
        <header className="quick-read-heading">
          <span>
            {repo.generated?.category ||
              getProjectGuide(repo)?.category ||
              repo.language}
          </span>
          <h2>{repo.name}</h2>
          <p>
            {repo.fullName}
            <span>
              <Star size={13} />
              {formatNumber(repo.stars)}
            </span>
          </p>
        </header>
        <ProjectIntroduction key={repo.fullName} repo={repo} compact />
        <TrialLaunch
          key={`trial:${repo.fullName}`}
          repo={repo.fullName}
          onClose={onClose}
        />
      </div>
      <div className="quick-read-bottom">
        <form
          className="quick-read-ask"
          onSubmit={(event) => {
            event.preventDefault();
            if (!question.trim()) return;
            const path = conversationPath({
              repo: repo.fullName,
              turns: [question.trim()],
              overrides: [],
            });
            onClose();
            window.location.hash = path;
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
        >
          <MessageCircle size={18} aria-hidden="true" />
          <input
            aria-label={`向 AI 提问 ${repo.fullName}`}
            placeholder="问 AI，了解这个项目…"
            maxLength={500}
            value={question}
            onChange={(event) =>
              setDraft({ repo: repo.fullName, text: event.target.value })
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.nativeEvent.isComposing || event.keyCode === 229)
              )
                event.preventDefault();
            }}
          />
          <button
            type="submit"
            disabled={!question.trim()}
            aria-label="发送项目问题"
            title="发送问题"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </form>
        <footer className="quick-read-actions">
          <button
            className="button outline-button"
            aria-pressed={saved}
            onClick={onSave}
          >
            <Bookmark size={15} fill={saved ? "currentColor" : "none"} />
            {saved ? "已收藏" : "收藏项目"}
          </button>
          {onOpen && (
            <button className="button primary-button" onClick={onOpen}>
              打开项目详情
              <ArrowUpRight size={15} />
            </button>
          )}
          <a
            className="text-action"
            href={repo.url}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight size={15} />
          </a>
        </footer>
      </div>
    </Dialog>
  );
}
