import { cn } from "@/lib/utils";
import { findAvatarDecoration, findProfileDecoration } from "@/lib/decorations";

const STAR = "50,4 55,40 90,50 55,60 50,96 45,60 10,50 45,40";
const HEART =
  "M50 84C18 62 12 42 25 29c10-10 23-7 25 4 2-11 15-14 25-4 13 13 7 33-25 55Z";

export function AvatarDecorationArt({
  decorationId,
  className,
}: {
  decorationId?: string | null;
  className?: string;
}) {
  const item = findAvatarDecoration(decorationId);
  if (!item) return null;
  const [a, b] = item.colours;
  const shift = item.variant * 3;

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      data-animated={item.animated ? "true" : "false"}
      data-kind={item.kind}
      className={cn(
        "avatar-decoration-art pointer-events-none absolute -inset-[24%] z-20 size-[148%] overflow-visible",
        className,
      )}
      style={{ color: a }}
    >
      {item.kind === "sparkles" && (
        <g className="deco-twinkle" fill={a} stroke={b} strokeWidth="1.5">
          <polygon
            points={STAR}
            transform={`translate(4 ${4 + shift}) scale(.18)`}
          />
          <polygon
            points={STAR}
            transform={`translate(76 ${13 - shift / 2}) scale(.15)`}
          />
          <polygon
            points={STAR}
            transform={`translate(70 ${72 - shift / 3}) scale(.2)`}
          />
          <circle cx={16 + shift} cy="72" r="3.5" fill={b} />
        </g>
      )}

      {item.kind === "orbit" && (
        <g className="deco-spin" fill="none" stroke={a} strokeWidth="2">
          <ellipse
            cx="50"
            cy="50"
            rx={43 - item.variant}
            ry={30 + item.variant}
          />
          <circle
            cx={91 - item.variant}
            cy={46 + shift / 2}
            r="5"
            fill={b}
            stroke="none"
          />
          <circle
            cx={12 + item.variant}
            cy={55 - shift / 3}
            r="3"
            fill={a}
            stroke="none"
          />
        </g>
      )}

      {item.kind === "crown" && (
        <g className="deco-bob" transform={`translate(0 ${item.variant - 2})`}>
          <path
            d="M29 23 35 8l15 12L64 7l8 16-6 9H35Z"
            fill={a}
            stroke={b}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="35" cy="8" r="3" fill={b} />
          <circle cx="64" cy="7" r="3" fill={b} />
          <circle cx="50" cy="20" r="3" fill={b} />
        </g>
      )}

      {item.kind === "wings" && (
        <g
          className="deco-flap"
          fill={a}
          stroke={b}
          strokeWidth="1.6"
          strokeLinejoin="round"
        >
          <path
            d={`M30 ${38 - item.variant}C12 25 3 38 11 66c6-12 14-15 25-13-10 12-14 21-12 30 14-8 21-19 21-34Z`}
          />
          <path
            d={`M70 ${38 - item.variant}c18-13 27 0 19 28-6-12-14-15-25-13 10 12 14 21 12 30-14-8-21-19-21-34Z`}
          />
        </g>
      )}

      {item.kind === "flame" && (
        <g className="deco-flicker" fill={a} stroke={b} strokeWidth="1.5">
          <path d="M18 85c-8-15 3-22 7-35 8 9 10 18 5 29 8-6 11-15 9-25 12 13 11 29-3 39Z" />
          <path d="M82 85c8-15-3-22-7-35-8 9-10 18-5 29-8-6-11-15-9-25-12 13-11 29 3 39Z" />
          {item.variant > 1 && (
            <path d="M44 15c2-8 6-11 9-15 5 9 6 15 1 23Z" fill={b} />
          )}
        </g>
      )}

      {item.kind === "flora" && (
        <g className="deco-drift" fill={a} stroke={b} strokeWidth="1.2">
          <path d="M8 68C8 42 20 25 34 14" fill="none" strokeWidth="2.5" />
          <path d="M92 68C92 42 80 25 66 14" fill="none" strokeWidth="2.5" />
          {[18, 31, 70, 83].map((x, index) => (
            <ellipse
              key={x}
              cx={x}
              cy={24 + ((index + item.variant) % 3) * 15}
              rx="6"
              ry="3.5"
              transform={`rotate(${index % 2 ? -35 : 35} ${x} ${24 + ((index + item.variant) % 3) * 15})`}
              fill={index % 2 ? b : a}
            />
          ))}
        </g>
      )}

      {item.kind === "crystal" && (
        <g
          className="deco-pulse"
          stroke={b}
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <polygon points="9,63 18,45 28,65 18,88" fill={a} />
          <polygon points="72,65 82,42 92,63 83,89" fill={b} />
          <polygon
            points={`${41 - item.variant},13 50,3 ${60 + item.variant},14 51,29`}
            fill={a}
          />
        </g>
      )}

      {item.kind === "hearts" && (
        <g className="deco-bob" fill={a} stroke={b} strokeWidth="2">
          <path d={HEART} transform="translate(2 8) scale(.25)" />
          <path d={HEART} transform="translate(72 18) scale(.2)" fill={b} />
          <path d={HEART} transform="translate(68 68) scale(.17)" />
          <path d={HEART} transform="translate(12 70) scale(.14)" fill={b} />
        </g>
      )}

      {item.kind === "runes" && (
        <g className="deco-spin" fill="none" stroke={a} strokeWidth="2">
          <circle
            cx="50"
            cy="50"
            r="45"
            strokeDasharray={`${5 + item.variant} 7`}
          />
          <polygon points="50,4 57,16 43,16" fill={b} stroke="none" />
          <polygon points="96,50 84,57 84,43" fill={b} stroke="none" />
          <polygon points="50,96 43,84 57,84" fill={b} stroke="none" />
          <polygon points="4,50 16,43 16,57" fill={b} stroke="none" />
        </g>
      )}

      {item.kind === "halo" && (
        <g className="deco-pulse" fill="none" stroke={a} strokeWidth="4">
          <ellipse
            cx="50"
            cy={12 + item.variant}
            rx={24 + item.variant}
            ry="7"
          />
          <ellipse
            cx="50"
            cy={12 + item.variant}
            rx={17 + item.variant}
            ry="4"
            stroke={b}
            strokeWidth="1.5"
          />
          {item.variant >= 3 && (
            <polygon
              points={STAR}
              transform="translate(42 1) scale(.16)"
              fill={b}
              stroke="none"
            />
          )}
        </g>
      )}
    </svg>
  );
}

export function ProfileDecorationLayer({
  decorationId,
  className,
}: {
  decorationId?: string | null;
  className?: string;
}) {
  const item = findProfileDecoration(decorationId);
  if (!item) return null;
  const [a, b] = item.colours;
  const points = Array.from({ length: 16 }, (_, index) => ({
    x: ((index * 29 + item.variant * 11) % 96) + 2,
    y: ((index * 47 + item.variant * 17) % 92) + 4,
    r: 0.7 + ((index + item.variant) % 4) * 0.45,
  }));

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-animated={item.animated ? "true" : "false"}
      data-kind={item.kind}
      className={cn(
        "profile-decoration-art pointer-events-none absolute inset-0 z-[1] size-full overflow-hidden rounded-[inherit]",
        className,
      )}
    >
      {item.kind === "stars" && (
        <g className="profile-deco-drift" fill={a}>
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={point.r}
              fill={index % 3 ? a : b}
              opacity={0.35 + (index % 4) * 0.14}
            />
          ))}
        </g>
      )}

      {item.kind === "aurora" && (
        <g className="profile-deco-wave" fill="none" strokeLinecap="round">
          <path
            d={`M-10 ${18 + item.variant * 4} Q25 2 52 22T110 12`}
            stroke={a}
            strokeWidth="14"
            opacity=".23"
          />
          <path
            d={`M-5 ${65 - item.variant * 3} Q30 40 57 63T108 48`}
            stroke={b}
            strokeWidth="18"
            opacity=".18"
          />
        </g>
      )}

      {item.kind === "grid" && (
        <g
          className="profile-deco-scan"
          stroke={a}
          strokeWidth=".45"
          opacity=".22"
        >
          {Array.from({ length: 11 }, (_, index) => (
            <path key={`v-${index}`} d={`M${index * 10} 0v100`} />
          ))}
          {Array.from({ length: 11 }, (_, index) => (
            <path
              key={`h-${index}`}
              d={`M0 ${index * 10}h100`}
              stroke={index % 2 ? a : b}
            />
          ))}
        </g>
      )}

      {item.kind === "petals" && (
        <g className="profile-deco-fall" fill={a} opacity=".42">
          {points.slice(0, 12).map((point, index) => (
            <ellipse
              key={index}
              cx={point.x}
              cy={point.y}
              rx={1.2 + (index % 3)}
              ry={0.7 + (index % 2)}
              fill={index % 2 ? a : b}
              transform={`rotate(${index * 29} ${point.x} ${point.y})`}
            />
          ))}
        </g>
      )}

      {item.kind === "embers" && (
        <g className="profile-deco-rise" fill={a}>
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={point.r * 1.25}
              fill={index % 3 ? a : b}
              opacity={0.25 + (index % 5) * 0.11}
            />
          ))}
        </g>
      )}

      {item.kind === "snow" && (
        <g className="profile-deco-snow" fill={a} opacity=".55">
          {points.map((point, index) =>
            item.variant === 4 ? (
              <rect
                key={index}
                x={point.x}
                y={point.y}
                width={point.r * 1.5}
                height={point.r * 1.5}
                fill={index % 3 ? a : b}
              />
            ) : (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={point.r}
                fill={index % 3 ? a : b}
              />
            ),
          )}
        </g>
      )}

      {item.kind === "ribbons" && (
        <g className="profile-deco-wave" fill="none" strokeLinecap="round">
          <path
            d={`M-8 ${18 + item.variant * 5} C22 2 38 40 66 18S98 2 110 20`}
            stroke={a}
            strokeWidth="5"
            opacity=".3"
          />
          <path
            d={`M-10 ${85 - item.variant * 4} C24 62 44 96 70 76s28-4 40 8`}
            stroke={b}
            strokeWidth="7"
            opacity=".25"
          />
        </g>
      )}

      {item.kind === "constellation" && (
        <g
          className="profile-deco-pulse"
          stroke={a}
          strokeWidth=".55"
          fill={b}
          opacity=".5"
        >
          {points.slice(0, 10).map((point, index, rows) => {
            const next = rows[(index + 1) % rows.length];
            return (
              <g key={index}>
                <path d={`M${point.x} ${point.y}L${next.x} ${next.y}`} />
                <circle cx={point.x} cy={point.y} r={point.r} stroke="none" />
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
