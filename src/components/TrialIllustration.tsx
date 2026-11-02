import type { TrialCover, TrialSummary } from "../trials";
import { coverFor, trialPresentation } from "../trialPresentation";

function Lines({
  value,
  x,
  y,
  width = 19,
  max = 4,
  className = "",
}: {
  value: string;
  x: number;
  y: number;
  width?: number;
  max?: number;
  className?: string;
}) {
  const rows = value.split("\n").flatMap((line) => {
    const chars = Array.from(line);
    return Array.from(
      { length: Math.max(1, Math.ceil(chars.length / width)) },
      (_, i) => chars.slice(i * width, (i + 1) * width).join(""),
    );
  });
  return (
    <text className={className} x={x} y={y}>
      {rows.slice(0, max).map((line, i) => (
        <tspan x={x} dy={i ? 29 : 0} key={i}>
          {line}
          {i === max - 1 && rows.length > max ? "…" : ""}
        </tspan>
      ))}
    </text>
  );
}

function WindowBar({ title }: { title: string }) {
  return (
    <>
      <path d="M355 123H691" className="poster-window-rule" />
      <g className="poster-window-dots">
        <circle cx="375" cy="104" r="4" />
        <circle cx="390" cy="104" r="4" />
        <circle cx="405" cy="104" r="4" />
      </g>
      <text className="poster-window-title" x="675" y="109" textAnchor="end">
        {title}
      </text>
    </>
  );
}

function CanvasScene({ cover }: { cover: TrialCover }) {
  const nodes = cover.input.split("\n");
  return (
    <g transform="rotate(-4 525 212)">
      <rect
        className="poster-window-shadow"
        x="363"
        y="91"
        width="336"
        height="253"
        rx="13"
      />
      <rect
        className="poster-window"
        x="355"
        y="83"
        width="336"
        height="253"
        rx="13"
      />
      <WindowBar title="Excalidraw" />
      <path
        className="poster-canvas-grid"
        d="M355 162H691M355 200H691M355 238H691M355 276H691M393 123V336M431 123V336M469 123V336M507 123V336M545 123V336M583 123V336M621 123V336M659 123V336"
      />
      <g className="poster-node-lines">
        <rect x="377" y="151" width="115" height="48" rx="7" fill="#e1efb8" />
        <rect x="493" y="226" width="116" height="49" rx="7" fill="#e1d8f6" />
        <rect x="579" y="152" width="91" height="48" rx="7" fill="#fbe4ab" />
        <path
          fill="none"
          d="M488 181Q516 181 523 221M513 215L523 223 525 209M609 245Q631 237 631 205M623 214L631 204 638 214"
        />
      </g>
      <text className="poster-scene-label" x="434" y="181" textAnchor="middle">
        {nodes[0]?.slice(0, 5) || "一个想法"}
      </text>
      <text className="poster-scene-label" x="551" y="257" textAnchor="middle">
        {nodes[1]?.slice(0, 5) || "画出关系"}
      </text>
      <text className="poster-scene-label" x="625" y="182" textAnchor="middle">
        {nodes[2]?.slice(0, 4) || "说清楚了"}
      </text>
      <rect
        x="486"
        y="219"
        width="130"
        height="63"
        rx="4"
        fill="none"
        stroke="#7d60c2"
        strokeDasharray="5 5"
      />
      <path
        d="M566 284L576 317 585 304 600 301Z"
        fill="#5d45a5"
        stroke="#fff"
        strokeWidth="3"
      />
    </g>
  );
}

function DocumentScene({ cover }: { cover: TrialCover }) {
  return (
    <g transform="rotate(4 525 212)">
      <rect
        className="poster-window-shadow"
        x="363"
        y="88"
        width="336"
        height="256"
        rx="13"
      />
      <rect
        className="poster-window"
        x="355"
        y="80"
        width="336"
        height="256"
        rx="13"
      />
      <WindowBar title="Markdown → HTML" />
      <text className="poster-section-label" x="376" y="155">
        写下
      </text>
      <Lines
        className="poster-code"
        value={cover.input}
        x={376}
        y={185}
        width={24}
        max={2}
      />
      <path className="poster-window-rule" d="M375 232H671" />
      <text className="poster-rendered-title" x="376" y="270">
        {cover.output.split("\n")[0]?.slice(0, 10)}
      </text>
      <Lines
        className="poster-rendered-body"
        value={cover.output.split("\n").slice(1).join(" ")}
        x={376}
        y={302}
        width={17}
        max={1}
      />
      <g transform="rotate(-12 652 245)">
        <rect x="608" y="227" width="78" height="33" rx="5" fill="#d7ed92" />
        <text
          className="poster-sticker-text"
          x="647"
          y="249"
          textAnchor="middle"
        >
          已排版
        </text>
      </g>
    </g>
  );
}

function DataScene({ cover }: { cover: TrialCover }) {
  return (
    <g transform="rotate(-4 525 210)">
      <rect
        className="poster-window-shadow"
        x="363"
        y="88"
        width="336"
        height="230"
        rx="13"
      />
      <rect
        className="poster-window poster-terminal"
        x="355"
        y="80"
        width="336"
        height="230"
        rx="13"
      />
      <WindowBar title="data.json" />
      <rect x="369" y="208" width="307" height="28" rx="4" fill="#344d5b" />
      <Lines
        className="poster-code poster-json"
        value={cover.input}
        x={379}
        y={163}
        width={27}
        max={4}
      />
      <text className="poster-code poster-command" x="379" y="292">
        $ jq .version
      </text>
      <rect
        x="488"
        y="290"
        width="196"
        height="63"
        rx="9"
        fill="#d7ed92"
        stroke="#172d36"
        strokeWidth="2"
      />
      <text className="poster-result" x="586" y="332" textAnchor="middle">
        {cover.output.slice(0, 13)}
      </text>
    </g>
  );
}

function ChatScene({ cover }: { cover: TrialCover }) {
  const answer = cover.output.split("\n").slice(1, 4);
  return (
    <g transform="rotate(3 525 212)">
      <rect
        className="poster-window-shadow"
        x="363"
        y="88"
        width="336"
        height="256"
        rx="13"
      />
      <rect
        className="poster-window"
        x="355"
        y="80"
        width="336"
        height="256"
        rx="13"
      />
      <WindowBar title="Open WebUI" />
      <rect x="432" y="141" width="243" height="41" rx="13" fill="#e4ecd9" />
      <text className="poster-scene-label" x="448" y="167">
        上线前要检查哪些事？
      </text>
      <rect x="374" y="194" width="120" height="27" rx="6" fill="#e8e4f5" />
      <text className="poster-source" x="385" y="213">
        ↳ 上线清单
      </text>
      {answer.map((line, i) => (
        <g key={i}>
          <path
            d={`M379 ${242 + i * 29}l5 5 9-10`}
            fill="none"
            stroke="#52806d"
            strokeWidth="2.5"
          />
          <text className="poster-scene-label" x="406" y={247 + i * 29}>
            {line.replace(/^\d+[.、]\s*/, "").slice(0, 15)}
          </text>
        </g>
      ))}
    </g>
  );
}

function FlutterScene() {
  return (
    <>
      <g transform="rotate(8 565 205)">
        <rect x="477" y="48" width="179" height="309" rx="28" fill="#103b72" />
        <rect
          x="469"
          y="40"
          width="179"
          height="309"
          rx="28"
          fill="#f8fbff"
          stroke="#143e70"
          strokeWidth="3"
        />
        <rect x="518" y="50" width="81" height="13" rx="7" fill="#143e70" />
        <path d="M471 85H646V135H471Z" fill="#e7f0ff" />
        <text
          className="poster-phone-title"
          x="558"
          y="116"
          textAnchor="middle"
        >
          已完成
        </text>
        <text
          className="poster-phone-label"
          x="558"
          y="185"
          textAnchor="middle"
        >
          当前计数
        </text>
        <text
          className="poster-phone-count"
          x="558"
          y="250"
          textAnchor="middle"
        >
          2
        </text>
        <rect x="580" y="285" width="42" height="42" rx="13" fill="#255be8" />
        <path
          d="M591 306H611M601 296V316"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g transform="rotate(-6 442 276)">
        <rect
          x="355"
          y="253"
          width="230"
          height="61"
          rx="9"
          fill="#d7ed92"
          stroke="#153b71"
          strokeWidth="2"
        />
        <text className="poster-change" x="372" y="279">
          待办计数 → 已完成
        </text>
        <text className="poster-change-note" x="372" y="301">
          标题更新，状态保留
        </text>
      </g>
    </>
  );
}

function WorkflowScene({ cover }: { cover: TrialCover }) {
  return (
    <g transform="rotate(-3 525 212)">
      <rect
        className="poster-window-shadow"
        x="363"
        y="88"
        width="336"
        height="256"
        rx="13"
      />
      <rect
        className="poster-window"
        x="355"
        y="80"
        width="336"
        height="256"
        rx="13"
      />
      <WindowBar title="项目练习" />
      <text className="poster-section-label" x="376" y="157">
        {cover.inputLabel.slice(0, 16)}
      </text>
      <Lines
        className="poster-scene-label"
        value={cover.input}
        x={376}
        y={187}
        width={16}
        max={2}
      />
      <path className="poster-window-rule" d="M375 236H671" />
      <text className="poster-section-label" x="376" y="265">
        {cover.outputLabel.slice(0, 16)}
      </text>
      <Lines
        className="poster-scene-label"
        value={cover.output}
        x={376}
        y={297}
        width={16}
        max={1}
      />
    </g>
  );
}

/** Local posters render with the page, without image downloads or model requests. */
export default function TrialIllustration({ trial }: { trial: TrialSummary }) {
  const cover = coverFor(trial);
  const story = trialPresentation(trial, cover);
  const long = story.lines.some(
    (line) =>
      Array.from(line).reduce(
        (width, char) => width + (/[^\x00-\xff]/.test(char) ? 1 : 0.55),
        0,
    ) > 8.3,
  );
  return (
    <figure
      className={`trial-illustration trial-poster illustration-${cover.layout} poster-${story.theme}${long ? " poster-long-title" : ""}`}
      role="img"
      aria-label={`${trial.name} 用途图：${cover.caption}。${cover.inputLabel}：${cover.input}；${cover.outputLabel}：${cover.output}`}
    >
      <div className="trial-poster-copy" aria-hidden="true">
        <span className="trial-poster-brand">{trial.name}</span>
        <strong>
          {story.lines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </strong>
        <span className="trial-poster-detail">{story.detail}</span>
      </div>
      <svg viewBox="0 0 720 405" aria-hidden="true">
        {story.theme === "canvas" ? (
          <CanvasScene cover={cover} />
        ) : story.theme === "document" ? (
          <DocumentScene cover={cover} />
        ) : story.theme === "data" ? (
          <DataScene cover={cover} />
        ) : story.theme === "chat" ? (
          <ChatScene cover={cover} />
        ) : story.theme === "flutter" ? (
          <FlutterScene />
        ) : (
          <WorkflowScene cover={cover} />
        )}
      </svg>
      <figcaption className="sr-only">{cover.caption}</figcaption>
    </figure>
  );
}
