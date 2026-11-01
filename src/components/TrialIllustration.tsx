import referenceCovers from "../../shared/trial-covers.json";
import type { TrialCover, TrialSummary } from "../trials";

export function coverFor(trial: TrialSummary): TrialCover {
  return (
    trial.cover ||
    (referenceCovers as Record<string, TrialCover>)[
      trial.repo.toLowerCase()
    ] || {
      layout: "workflow",
      caption: trial.title,
      inputLabel: "了解项目",
      input: trial.name,
      outputLabel: "完成练习",
      output: trial.title,
    }
  );
}

function Lines({
  value,
  x,
  y,
  width = 13,
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
    return chars.length
      ? Array.from({ length: Math.ceil(chars.length / width) }, (_, i) =>
          chars.slice(i * width, (i + 1) * width).join(""),
        )
      : [""];
  });
  return (
    <text className={className} x={x} y={y}>
      {rows.slice(0, max).map((line, i) => (
        <tspan x={x} dy={i ? 30 : 0} key={i}>
          {line}
          {i === max - 1 && rows.length > max ? "…" : ""}
        </tspan>
      ))}
    </text>
  );
}

/** Native SVG explanations stay crisp and readable; no generated code or remote images. */
export default function TrialIllustration({ trial }: { trial: TrialSummary }) {
  const cover = coverFor(trial);
  return (
    <figure
      className={`trial-illustration illustration-${cover.layout}`}
      role="img"
      aria-label={`${trial.name} 用途图：${cover.caption}。${cover.inputLabel}：${cover.input}；${cover.outputLabel}：${cover.output}`}
    >
      <svg viewBox="0 0 520 260" aria-hidden="true">
        {cover.layout === "canvas" ? (
          <>
            <rect
              className="illustration-paper"
              x="20"
              y="20"
              width="480"
              height="220"
              rx="18"
            />
            <path
              className="illustration-grid"
              d="M20 64H500M20 108H500M20 152H500M20 196H500M68 20V240M116 20V240M164 20V240M212 20V240M260 20V240M308 20V240M356 20V240M404 20V240M452 20V240"
            />
            <rect
              className="illustration-tint"
              x="52"
              y="67"
              width="132"
              height="60"
              rx="12"
              transform="rotate(-4 118 97)"
            />
            <rect
              className="illustration-tint illustration-tint-alt"
              x="211"
              y="130"
              width="132"
              height="60"
              rx="12"
              transform="rotate(3 277 160)"
            />
            <rect
              className="illustration-tint"
              x="368"
              y="58"
              width="106"
              height="60"
              rx="12"
            />
            <path
              className="illustration-line"
              d="M185 100Q205 100 211 148M200 140L211 148 212 135M342 158Q368 150 379 120M368 125L379 120 379 134"
            />
            <text x="118" y="104" textAnchor="middle">
              {cover.input.split("\n")[0]?.slice(0, 5)}
            </text>
            <text x="277" y="167" textAnchor="middle">
              {cover.input.split("\n")[1]?.slice(0, 5) || "画出关系"}
            </text>
            <text x="421" y="95" textAnchor="middle">
              {cover.input.split("\n")[2]?.slice(0, 4) || "完成图稿"}
            </text>
            <path
              className="illustration-line illustration-cursor"
              d="M162 170L169 202 178 190 192 187Z"
            />
          </>
        ) : (
          <>
            <text className="illustration-label" x="22" y="29">
              {cover.inputLabel}
            </text>
            <text className="illustration-label" x="293" y="29">
              {cover.outputLabel}
            </text>
            <rect
              className="illustration-paper"
              x="20"
              y="48"
              width="212"
              height="180"
              rx="16"
            />
            <rect
              className="illustration-tint"
              x="288"
              y="48"
              width="212"
              height="180"
              rx="16"
            />
            <path
              className="illustration-line"
              d="M246 137H274M264 128L274 137 264 146"
            />
            {cover.layout === "document" ? (
              <>
                <Lines
                  value={cover.input}
                  x={37}
                  y={93}
                  width={13}
                  max={4}
                  className="illustration-code"
                />
                <Lines
                  value={cover.output.split("\n")[0]}
                  x={307}
                  y={99}
                  width={8}
                  max={1}
                  className="illustration-document-title"
                />
                <Lines
                  value={cover.output.split("\n").slice(1).join(" ")}
                  x={307}
                  y={144}
                  width={10}
                  max={2}
                />
                <path
                  className="illustration-rule"
                  d="M308 187H451M308 202H406"
                />
              </>
            ) : cover.layout === "data" ? (
              <>
                <rect
                  className="illustration-highlight"
                  x="31"
                  y="136"
                  width="190"
                  height="28"
                  rx="5"
                />
                <Lines
                  value={cover.input}
                  x={36}
                  y={93}
                  width={20}
                  max={4}
                  className="illustration-code illustration-json"
                />
                <Lines
                  value={cover.output}
                  x={307}
                  y={143}
                  width={13}
                  max={2}
                  className="illustration-value"
                />
              </>
            ) : (
              <>
                <path className="illustration-rule" d="M40 76H75M40 88H58" />
                <Lines value={cover.input} x={40} y={126} width={8} max={3} />
                <circle
                  className="illustration-highlight"
                  cx="328"
                  cy="83"
                  r="17"
                />
                <path className="illustration-line" d="M320 83L326 89 337 76" />
                <Lines value={cover.output} x={308} y={126} width={8} max={3} />
              </>
            )}
          </>
        )}
      </svg>
      <figcaption>{cover.caption}</figcaption>
    </figure>
  );
}
