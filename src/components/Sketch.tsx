import { useId } from "react";

export default function Sketch({
  scene = 1,
  compact = false,
}: {
  scene?: number;
  compact?: boolean;
}) {
  const id = useId();
  return (
    <svg
      className={`sketch-scene sketch-scene-${scene} ${compact ? "sketch-compact" : ""}`}
      viewBox="0 0 640 310"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`sketch-dots-${id}`}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".7" fill="#9aa18b" fillOpacity=".35" />
        </pattern>
        <filter
          id={`paper-shadow-${id}`}
          x="-20%"
          y="-20%"
          width="140%"
          height="150%"
        >
          <feDropShadow
            dx="1"
            dy="4"
            stdDeviation="4"
            floodColor="#4e5b33"
            floodOpacity=".08"
          />
        </filter>
      </defs>
      <rect width="640" height="310" fill={`url(#sketch-dots-${id})`} />
      {scene === 0 ? (
        <g className="sketch-enter">
          <g transform="rotate(-9 160 140)">
            <path
              d="M72 72L225 69L228 192L73 197Z"
              fill="#ececcf"
              filter={`url(#paper-shadow-${id})`}
            />
            <text x="102" y="116" fill="#7b8665" fontSize="13">
              脑海里的新点子
            </text>
            <text x="103" y="155" fill="#45533b" fontSize="23">
              做个好产品！
            </text>
            <path d="M102 166Q154 175 203 165" stroke="#8b9874" />
          </g>
          <g transform="rotate(7 368 120)">
            <path
              d="M280 47L431 50L429 156L279 157Z"
              fill="#f2dfce"
              filter={`url(#paper-shadow-${id})`}
            />
            <text x="303" y="90" fill="#9c6f51" fontSize="13">
              但要怎么讲清楚？
            </text>
            <text x="310" y="128" fill="#a26743" fontSize="25">
              想法有点多…
            </text>
          </g>
          <g transform="rotate(-4 466 218)">
            <path
              d="M391 167L551 164L549 268L393 266Z"
              fill="#e8e3ee"
              filter={`url(#paper-shadow-${id})`}
            />
            <text x="413" y="204" fill="#8d7c9d" fontSize="13">
              把逻辑，画出来？
            </text>
            <path
              d="M419 223h35v23h-35zm44 12h30m-7-7 8 7-8 7"
              stroke="#9584a5"
              strokeWidth="1.5"
            />
          </g>
          <path
            d="M232 163Q277 173 293 201m-5-12 5 13-15-2"
            stroke="#8f9b7b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        </g>
      ) : (
        <g className="sketch-enter">
          <path
            className="sketch-line"
            d="M57 102L204 99L207 192L59 195L57 102ZM60 104L202 102L204 190L61 192"
            fill="#e5eadb"
            stroke="#768964"
            strokeWidth="1.5"
          />
          <path
            className="sketch-line"
            d="M245 104L393 101L397 193L246 196L245 104ZM248 106L391 104L393 190L249 193"
            fill="#f2dfcd"
            stroke="#be8d68"
            strokeWidth="1.5"
          />
          <path
            className="sketch-line"
            d="M438 101Q511 87 587 104L585 193Q507 205 439 192L438 101ZM441 104Q511 91 584 107L582 190Q508 201 442 189"
            fill="#e9e5ee"
            stroke="#a295b0"
            strokeWidth="1.5"
          />
          <text
            x="130"
            y="143"
            textAnchor="middle"
            fill="#4c6545"
            fontSize="21"
          >
            一个想法
          </text>
          <text
            x="130"
            y="168"
            textAnchor="middle"
            fill="#8b967b"
            fontSize="10"
          >
            idea / 01
          </text>
          <text
            x="320"
            y="143"
            textAnchor="middle"
            fill="#a16b46"
            fontSize="21"
          >
            画个草图
          </text>
          <text
            x="320"
            y="168"
            textAnchor="middle"
            fill="#b68c6a"
            fontSize="10"
          >
            sketch / 02
          </text>
          <text
            x="513"
            y="143"
            textAnchor="middle"
            fill="#827190"
            fontSize="21"
          >
            达成共识
          </text>
          <text
            x="513"
            y="168"
            textAnchor="middle"
            fill="#a496ad"
            fontSize="10"
          >
            together / 03
          </text>
          <g stroke="#8c9a79" strokeWidth="1.7" strokeLinecap="round">
            <path
              className="sketch-arrow"
              d="M210 148Q227 144 240 149m-9-8 10 8-11 7M402 148Q419 146 433 149m-9-8 10 8-11 7"
            />
          </g>
          <path
            d="M145 225Q316 262 518 220m-13-3 15 3-9 12"
            stroke="#bba17e"
            strokeWidth="1.2"
            strokeDasharray="5 5"
          />
          <text
            x="328"
            y="271"
            textAnchor="middle"
            fontSize="12"
            fill="#a69a80"
          >
            一张草图，让我们看见同一个想法。
          </text>
          <g transform="translate(490 49) rotate(9)">
            <path d="M-35-13H35V13H-35Z" fill="#f5ecd6" stroke="#d8cbaa" />
            <text y="4" textAnchor="middle" fill="#a48d59" fontSize="10">
              good idea! ✳
            </text>
          </g>
          {scene === 2 && (
            <g className="sketch-collaborators">
              <g transform="translate(220 86)">
                <path
                  d="M0 0L3 22L9 15L18 15Z"
                  fill="#bb7758"
                  stroke="#f9f6e9"
                  strokeWidth="2"
                />
                <rect
                  x="12"
                  y="21"
                  width="49"
                  height="20"
                  rx="4"
                  fill="#bb7758"
                />
                <text
                  x="37"
                  y="35"
                  textAnchor="middle"
                  fill="#fff9ed"
                  fontSize="10"
                >
                  设计师
                </text>
              </g>
              <g transform="translate(446 198)">
                <path
                  d="M0 0L3 22L9 15L18 15Z"
                  fill="#827296"
                  stroke="#f9f6e9"
                  strokeWidth="2"
                />
                <rect
                  x="12"
                  y="21"
                  width="49"
                  height="20"
                  rx="4"
                  fill="#827296"
                />
                <text
                  x="37"
                  y="35"
                  textAnchor="middle"
                  fill="#fff9ed"
                  fontSize="10"
                >
                  工程师
                </text>
              </g>
            </g>
          )}
          {scene === 3 && (
            <g transform="translate(472 196) rotate(-7)">
              <rect
                width="111"
                height="55"
                rx="7"
                fill="#fffdf4"
                stroke="#c7cfb7"
                filter={`url(#paper-shadow-${id})`}
              />
              <text x="17" y="24" fill="#5b7350" fontSize="12">
                让好想法，带得走
              </text>
              <text x="17" y="43" fill="#96a186" fontSize="10">
                .svg / .png / .excalidraw
              </text>
            </g>
          )}
        </g>
      )}
      {!compact && (
        <>
          <path d="M28 28h13m-6.5-6.5v13M605 280h10m-5-5v10" stroke="#9eaa8f" />
          <text x="31" y="295" fontSize="8" letterSpacing="2" fill="#a3aa96">
            把想法，画给世界看。
          </text>
        </>
      )}
    </svg>
  );
}
