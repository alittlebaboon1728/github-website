import { useId } from "react";
import {
  ArrowUpRight,
  Braces,
  Check,
  Code2,
  Database,
  FileCode2,
  Folder,
  Globe2,
  Layers,
  Mail,
  Music2,
  Search,
  Server,
  Sparkles,
  Terminal,
} from "lucide-react";
import { presentProject } from "../presentation";
import type { Repository } from "../catalog";

// Original concept illustrations, not screenshots of the represented products.
export default function ProjectArtwork({
  repo,
  large = false,
}: {
  repo: Repository;
  large?: boolean;
}) {
  const p = presentProject(repo);
  const id = useId();
  return (
    <div
      className={`project-artwork artwork-${p.visual} ${large ? "artwork-large" : ""}`}
      style={
        { "--art-ink": p.color, "--art-paper": p.paper } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="artwork-grain" />
      {p.visual === "whiteboard" ? (
        <div className="art-whiteboard">
          <div className="art-sketch-note">想法</div>
          <svg width="54" height="30" viewBox="0 0 54 30">
            <path d="M3 17Q25 8 47 15m-9-7 10 7-10 7" />
          </svg>
          <div className="art-sketch-note">
            一起画
            <Braces size={18} />
          </div>
          <span className="art-sketch-cursor">
            <ArrowUpRight size={18} />
          </span>
          <span className="art-sketch-doodle">✳</span>
        </div>
      ) : p.visual === "terminal" ? (
        <div className="art-terminal">
          <div className="art-window-dots">
            <i />
            <i />
            <i />
            <span>~/build-your-own</span>
          </div>
          <div className="art-code-line">
            <span>❯</span>build something.
          </div>
          <div className="art-code-progress">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="art-code-status">
            <Check size={12} />
            understand everything.
          </div>
          <Terminal className="art-terminal-icon" size={70} strokeWidth={0.8} />
        </div>
      ) : p.visual === "directory" ? (
        <div className="art-directory">
          <div className="art-folder folder-back">
            <Folder size={21} />
            <span>tools</span>
          </div>
          <div className="art-folder folder-middle">
            <Folder size={21} />
            <span>resources</span>
          </div>
          <div className="art-folder folder-front">
            <Folder size={21} />
            <span>
              awesome<span>✳</span>
            </span>
            <ArrowUpRight size={16} />
          </div>
        </div>
      ) : p.visual === "api" ? (
        <div className="art-api">
          <svg viewBox="0 0 340 160">
            <path d="M171 79C223 79 208 30 267 30M171 79H267M171 79C223 79 208 130 267 130M65 79H160" />
            <circle r="3" cx="214" cy="79" className="art-signal" />
          </svg>
          <span className="api-client">
            <Code2 size={20} />
          </span>
          <span className="api-core">
            <Braces size={29} />
          </span>
          <span className="api-service service-1">
            <Globe2 size={17} />
          </span>
          <span className="api-service service-2">
            <Database size={17} />
          </span>
          <span className="api-service service-3">
            <Music2 size={17} />
          </span>
          <span className="api-verb">GET</span>
        </div>
      ) : p.visual === "books" ? (
        <div className="art-books">
          <div className="art-book book-1">
            <span>Python</span>
            <i>py</i>
          </div>
          <div className="art-book book-2">
            <span>JavaScript</span>
            <i>js</i>
          </div>
          <div className="art-book book-3">
            <span>
              Computer
              <br />
              science.
            </span>
            <i>↗</i>
          </div>
          <span className="book-ground" />
        </div>
      ) : p.visual === "learning" ? (
        <div className="art-learning">
          <div className="learning-code">
            <div className="art-window-dots">
              <i />
              <i />
              <i />
            </div>
            <div>
              <span>&lt;</span>hello<span> /&gt;</span>
            </div>
            <i />
            <i />
            <i />
          </div>
          <div className="learning-badge">
            <Code2 size={29} strokeWidth={1.4} />
            <span>
              learn.
              <br />
              build.
              <br />
              repeat.
            </span>
          </div>
          <span className="learning-check">
            <Check size={20} />
          </span>
        </div>
      ) : p.visual === "architecture" ? (
        <div className="art-architecture">
          <svg viewBox="0 0 340 170">
            <path d="M170 46V80H71v38m99-38v38m0-38h99v38" />
          </svg>
          <span className="architecture-root">
            <Globe2 size={19} />
          </span>
          <span className="architecture-node node-1">
            <Server size={19} />
          </span>
          <span className="architecture-node node-2">
            <Layers size={19} />
          </span>
          <span className="architecture-node node-3">
            <Database size={19} />
          </span>
        </div>
      ) : p.visual === "roadmap" ? (
        <div className="art-roadmap">
          <svg viewBox="0 0 340 170">
            <path d="M55 125h73q27 0 27-27V67q0-28 28-28h103" />
            <circle cx="55" cy="125" r="8" />
            <circle cx="155" cy="85" r="8" />
            <circle cx="234" cy="39" r="8" />
          </svg>
          <span className="roadmap-label route-start">start here</span>
          <span className="roadmap-label route-end">what's next?</span>
          <span className="roadmap-flag">
            <ArrowUpRight size={24} />
          </span>
        </div>
      ) : p.visual === "dashboard" ? (
        <div className="art-dashboard">
          <div className="dashboard-chrome">
            <span />
            <span />
            <span />
            <i />
          </div>
          <div className="dashboard-tiles">
            {[Mail, Music2, Folder, Globe2, Database, Server].map((Icon, i) => (
              <span key={i}>
                <Icon size={20} strokeWidth={1.4} />
              </span>
            ))}
          </div>
          <span className="dashboard-online" />
        </div>
      ) : p.visual === "python" ? (
        <div className="art-python">
          <div className="python-block python-block-top">
            <span>py</span>
            <i />
          </div>
          <div className="python-block python-block-bottom">
            <Braces size={29} />
            <i />
          </div>
          <span className="python-orbit orbit-one" />
          <span className="python-orbit orbit-two" />
        </div>
      ) : p.visual === "agent" ? (
        <div className="art-agent">
          <svg viewBox="0 0 340 170">
            <defs>
              <radialGradient id={`agent-${id}`}>
                <stop stopColor="currentColor" stopOpacity=".15" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="170" cy="85" r="75" fill={`url(#agent-${id})`} />
            <circle cx="170" cy="85" r="62" />
            <path d="M110 44l60 41 64-32M170 85l45 50M170 85l-65 40" />
          </svg>
          <span className="agent-core">
            <Sparkles size={28} strokeWidth={1.3} />
          </span>
          <span className="agent-tool tool-1">
            <Search size={15} />
          </span>
          <span className="agent-tool tool-2">
            <FileCode2 size={15} />
          </span>
          <span className="agent-tool tool-3">
            <Mail size={15} />
          </span>
          <span className="agent-tool tool-4">
            <Globe2 size={15} />
          </span>
        </div>
      ) : p.visual === "components" ? (
        <div className="art-components">
          <div className="component-swatch">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="component-panel">
            <span />
            <span />
            <span />
            <i />
          </div>
          <div className="component-button">
            Create
            <ArrowUpRight size={15} />
          </div>
          <span className="component-cursor">
            <ArrowUpRight size={25} />
          </span>
        </div>
      ) : p.visual === "database" ? (
        <div className="art-database">
          <div className="database-stack">
            <i />
            <i />
            <i />
            <span />
          </div>
          <div className="database-query">
            <span>select</span> possibilities
            <br />
            <span>from</span> your_ideas;
          </div>
        </div>
      ) : (
        <div className="art-web">
          <div className="web-browser">
            <div className="art-window-dots">
              <i />
              <i />
              <i />
              <span>{repo.name.slice(0, 22)}</span>
            </div>
            <div className="web-layout">
              <div />
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <span className="web-code">
            <Code2 size={28} strokeWidth={1.3} />
          </span>
        </div>
      )}
    </div>
  );
}
