/**
 * Sage — the cultivation agent's anthropomorphized face. A small sprout
 * character with eyes, rendered as inline SVG so it can animate cheaply.
 * States:
 *   - idle:     gentle "breathing" scale loop
 *   - thinking: blinking + a soft pulse (used while a deep-dive runs)
 *   - alert:    attention bounce + warm ring (new high-severity observation)
 */
export type AgentState = "idle" | "thinking" | "alert";

export default function AgentAvatar({
  state = "idle",
  size = 40,
}: {
  state?: AgentState;
  size?: number;
}) {
  const anim =
    state === "thinking"
      ? "agent-thinking"
      : state === "alert"
        ? "agent-alert"
        : "agent-breathe";
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full ${anim}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(120% 120% at 30% 20%, #43a47e 0%, #2f8f6c 55%, #185640 100%)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.3) inset, 0 4px 12px -2px rgba(47,143,108,0.5)",
        }}
      />
      <svg
        viewBox="0 0 40 40"
        width={size * 0.74}
        height={size * 0.74}
        className="relative"
      >
        {/* sprout stem + two leaves above the face */}
        <path
          d="M20 14 V8"
          stroke="#eafff4"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M20 9c-3.2-3-7-2.4-7-2.4s-.2 4 3 5.2c2.6 1 4-.4 4-.4z"
          fill="#bff0d6"
        />
        <path
          d="M20 8c3-2.6 6.6-1.8 6.6-1.8s.2 3.7-2.8 4.8c-2.4.9-3.8-.6-3.8-.6z"
          fill="#9fe6c2"
        />
        {/* eyes */}
        <circle className="agent-eye" cx="15.5" cy="23" r="2.1" fill="#0f2e22" />
        <circle className="agent-eye" cx="24.5" cy="23" r="2.1" fill="#0f2e22" />
        <circle cx="16.2" cy="22.3" r="0.6" fill="#eafff4" />
        <circle cx="25.2" cy="22.3" r="0.6" fill="#eafff4" />
        {/* smile */}
        <path
          d="M15.5 27.5c1.6 1.8 7.4 1.8 9 0"
          stroke="#0f2e22"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
