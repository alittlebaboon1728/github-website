import {
  BookOpen,
  ChartNoAxesCombined,
  Code2,
  Database,
  FileText,
  Globe2,
  Image,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { GeneratedCard } from "../generatedCards";
const icons: Record<string, typeof FileText> = {
  file: FileText,
  search: Search,
  code: Code2,
  database: Database,
  chart: ChartNoAxesCombined,
  globe: Globe2,
  message: MessageSquare,
  layers: Layers,
  terminal: Terminal,
  image: Image,
  book: BookOpen,
  spark: Sparkles,
};
function lines(text: string, width: number) {
  const result: string[] = [];
  let line = "",
    length = 0;
  for (const character of text) {
    const size = /[\u0000-\u00ff]/.test(character) ? 0.58 : 1;
    if (length + size > width) {
      result.push(line);
      line = "";
      length = 0;
    }
    line += character;
    length += size;
  }
  if (line) result.push(line);
  return result;
}

export default function GeneratedProjectVisual({
  card,
}: {
  card: GeneratedCard;
}) {
  const { visual } = card;
  const positions =
    visual.layout === "hub"
      ? [
          { x: 154, y: 244 },
          { x: 486, y: 244 },
          { x: 320, y: 366 },
        ]
      : visual.layout === "layers"
        ? [
            { x: 320, y: 192 },
            { x: 320, y: 282 },
            { x: 320, y: 372 },
          ]
        : [
            { x: 124, y: 290 },
            { x: 320, y: 290 },
            { x: 516, y: 290 },
          ];
  return (
    <div className={`generated-visual visual-${visual.palette}`}>
      <svg
        className="generated-diagram-wide"
        viewBox="0 0 640 460"
        role="img"
        aria-label={`${card.title}：${visual.nodes.map((node) => node.label).join(visual.layout === "flow" ? "，然后" : "、")}。项目用途示意图`}
      >
        <text x="38" y="42" className="generated-visual-eyebrow">
          {card.category}
        </text>
        {lines(card.title, 22)
          .slice(0, 2)
          .map((line, index) => (
            <text
              key={index}
              x="38"
              y={87 + index * 34}
              className="generated-visual-title"
            >
              {line}
            </text>
          ))}
        <text x="38" y="158" className="generated-visual-caption">
          {visual.caption}
        </text>
        {visual.layout === "flow" && (
          <g className="generated-visual-links">
            <path d="M206 287H234m-8-6 8 6-8 6M402 287h28m-8-6 8 6-8 6" />
          </g>
        )}
        {visual.layout === "layers" && (
          <g className="generated-visual-links">
            <path d="M320 224v21m-6-7 6 7 6-7M320 314v21m-6-7 6 7 6-7" />
          </g>
        )}
        {visual.layout === "hub" && (
          <g className="generated-visual-links">
            <path d="M232 244H408M206 278l62 54M434 278l-62 54" />
            <circle cx="320" cy="244" r="5" />
          </g>
        )}
        {visual.nodes.map((node, index) => {
          const Icon = icons[node.icon] || Layers;
          const { x, y } = positions[index];
          const wide = visual.layout === "layers";
          const width = wide ? 480 : 164;
          return (
            <g
              key={index}
              className="generated-visual-node"
              transform={`translate(${x},${y})`}
            >
              <rect
                x={-width / 2}
                y={wide ? -32 : -49}
                width={width}
                height={wide ? 64 : 98}
                rx="10"
              />
              <Icon
                x={wide ? -217 : -12}
                y={wide ? -12 : -34}
                width="24"
                height="24"
                strokeWidth="1.5"
              />
              <text
                textAnchor={wide ? "start" : "middle"}
                x={wide ? -175 : 0}
                y={wide ? -5 : 12}
                className="generated-node-label"
              >
                {node.label}
              </text>
              {lines(node.detail, wide ? 30 : 12)
                .slice(0, 2)
                .map((line, i) => (
                  <text
                    key={i}
                    textAnchor={wide ? "start" : "middle"}
                    x={wide ? -175 : 0}
                    y={(wide ? 17 : 34) + i * 17}
                    className="generated-node-detail"
                  >
                    {line}
                  </text>
                ))}
            </g>
          );
        })}
        <text x="38" y="439" className="generated-visual-credit">
          AI 生成用途示意 · 依据项目资料
        </text>
      </svg>
      <svg
        className="generated-diagram-compact"
        viewBox="0 0 380 430"
        role="img"
        aria-label={`${card.title}：${visual.nodes.map((node) => node.label).join(visual.layout === "flow" ? "，然后" : "、")}。项目用途示意图`}
      >
        <text x="24" y="30" className="generated-visual-eyebrow">
          {card.category}
        </text>
        {lines(card.title, 15)
          .slice(0, 2)
          .map((line, i) => (
            <text
              x="24"
              y={66 + i * 28}
              className="generated-visual-title"
              key={i}
            >
              {line}
            </text>
          ))}
        {lines(visual.caption, 24)
          .slice(0, 2)
          .map((line, i) => (
            <text
              x="24"
              y={125 + i * 20}
              className="generated-visual-caption"
              key={i}
            >
              {line}
            </text>
          ))}
        {visual.layout !== "hub" && (
          <g className="generated-visual-links">
            <path d="M190 229v17m-5-6 5 6 5-6M190 307v17m-5-6 5 6 5-6" />
          </g>
        )}
        {visual.layout === "hub" && (
          <g className="generated-visual-links">
            <path d="M24 195H15V351H24M15 273H24" />
          </g>
        )}
        {visual.nodes.map((node, i) => {
          const Icon = icons[node.icon] || Layers;
          return (
            <g
              key={i}
              className="generated-visual-node"
              transform={`translate(24,${165 + i * 78})`}
            >
              <rect width="332" height="64" rx="8" />
              <Icon x="16" y="21" width="23" height="23" strokeWidth="1.5" />
              <text x="54" y="25" className="generated-node-label">
                {node.label}
              </text>
              {lines(node.detail, 18)
                .slice(0, 2)
                .map((line, j) => (
                  <text
                    x="54"
                    y={45 + j * 15}
                    className="generated-node-detail"
                    key={j}
                  >
                    {line}
                  </text>
                ))}
            </g>
          );
        })}
        <text x="24" y="420" className="generated-visual-credit">
          AI 生成用途示意 · 依据项目资料
        </text>
      </svg>
    </div>
  );
}
