import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  FlaskConical,
  Loader2,
  Plus,
} from "lucide-react";
import { trialPath } from "../trials";
import useTrialCatalog from "../useTrialCatalog";
import TrialCarousel from "./TrialCarousel";
import TrialIllustration from "./TrialIllustration";
import { preloadTrialLink } from "../navigationPreload";
import { trialPresentation } from "../trialPresentation";

export default function TrialLibrary() {
  const { catalog, error, retry } = useTrialCatalog();
  return (
    <div className="trial-library">
      <header className="trial-library-heading">
        <div>
          <span>
            <FlaskConical size={19} />
            项目试用
          </span>
          <h1>
            好不好用，
            <br className="trial-mobile-break" />
            动手就知道。
          </h1>
          <p>从一个小问题开始，把感兴趣的开源项目，变成你会用的工具。</p>
        </div>
        <a className="button outline-button" href="#/discover">
          <Plus size={17} />
          发现并生成试用
        </a>
      </header>
      <TrialCarousel trials={catalog?.trials} />
      <section className="trial-shelf">
        <div className="trial-shelf-heading">
          <h2>挑一个，试着做点什么</h2>
          <span>看懂用途，再动手体验</span>
        </div>
        {error && (
          <div className="trial-error" role="alert">
            {error}
            <button onClick={retry}>重新读取</button>
          </div>
        )}
        {!catalog && !error && (
          <p className="trial-fine-print">
            <Loader2 className="spin" size={16} />
            正在读取试用…
          </p>
        )}
        {catalog?.jobs.map((job) => (
          <a
            className={`trial-job-row ${job.state === "error" ? "failed" : ""}`}
            key={job.id}
            href={trialPath(job.repo)}
          >
            {job.state === "running" ? (
              <Loader2 className="spin" size={20} />
            ) : (
              <FlaskConical size={20} />
            )}
            <span>
              <strong>{job.repo}</strong>
              <small>{job.error || job.stage}</small>
            </span>
            <ArrowRight size={17} />
          </a>
        ))}
        <div className="trial-library-grid">
          {catalog?.trials.map((trial) => {
            const story = trialPresentation(trial);
            return (
              <a
                className="trial-library-card"
                href={trialPath(trial.repo)}
                key={trial.repo}
                onPointerEnter={() => preloadTrialLink(trial.repo)}
                onFocus={() => preloadTrialLink(trial.repo)}
                onTouchStart={() => preloadTrialLink(trial.repo)}
              >
                <TrialIllustration trial={trial} />
                <div className="trial-card-copy">
                  <h3>{story.title}</h3>
                  <p className="trial-card-project">
                    <strong>{trial.name}</strong>
                    <small>{trial.repo}</small>
                  </p>
                </div>
                <div className="trial-card-footer">
                  <span>
                    <Clock3 size={14} />
                    {trial.duration}
                    <span className="trial-card-format">{story.format}</span>
                  </span>
                  <span className="trial-card-action">
                    去体验
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
        {catalog && !catalog.trials.length && !catalog.jobs.length && (
          <div className="trial-library-empty">
            <BookOpen size={28} strokeWidth={1.4} />
            <div>
              <h3>下一个想试的项目，由你来选。</h3>
              <p>
                打开任意项目的“快速了解”，点击“生成项目试用”。AI
                会阅读资料，再选择适合它的体验方式。
              </p>
            </div>
            <a href="#/discover" className="text-action">
              去发现项目
              <ArrowRight size={16} />
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
