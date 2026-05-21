import React, { type ReactNode } from "react";

export type ChatBubbleFrom = "app" | "user";

export interface ChatBubbleProps {
  from: ChatBubbleFrom;
  children: ReactNode;
  /** Optional small label above the bubble body. e.g. "Bull says", "You said". */
  label?: string;
  /** Optional avatar override. Defaults to the from-side glyph. */
  avatar?: ReactNode;
}

const APP_AVATAR_STYLE: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9999,
  background: "var(--color-pear-black)",
  color: "var(--color-white)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-playfair)",
  fontWeight: 600,
  fontSize: 14,
  flexShrink: 0,
};

const USER_AVATAR_STYLE: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9999,
  background: "var(--color-electric-cyan)",
  color: "var(--color-black)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const APP_BUBBLE_STYLE: React.CSSProperties = {
  background: "var(--color-pear-beige)",
  color: "var(--color-black)",
  borderRadius: "20px 20px 20px 6px",
  padding: "12px 18px",
  fontSize: 15,
  lineHeight: 1.5,
  maxWidth: "min(680px, calc(100% - 56px))",
};

const USER_BUBBLE_STYLE: React.CSSProperties = {
  background: "var(--color-pear-black)",
  color: "var(--color-white)",
  borderRadius: "20px 20px 6px 20px",
  padding: "12px 18px",
  fontSize: 15,
  lineHeight: 1.5,
  maxWidth: "min(680px, calc(100% - 56px))",
};

function AppAvatar() {
  return (
    <span aria-hidden="true" style={APP_AVATAR_STYLE}>
      a
    </span>
  );
}

function UserAvatar() {
  return (
    <span aria-hidden="true" style={USER_AVATAR_STYLE}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 1c-2 0-4.5 1-4.5 3v1h9v-1c0-2-2.5-3-4.5-3Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function ChatBubble({ from, children, label, avatar }: ChatBubbleProps) {
  const isApp = from === "app";
  const containerJustify = isApp ? "flex-start" : "flex-end";
  const bubbleStyle = isApp ? APP_BUBBLE_STYLE : USER_BUBBLE_STYLE;
  const defaultAvatar = isApp ? <AppAvatar /> : <UserAvatar />;
  const avatarEl = avatar ?? defaultAvatar;
  const labelColor = isApp ? "#585858" : "rgba(255,255,255,0.7)";

  return (
    <div
      data-from={from}
      className="flex w-full items-end gap-3"
      style={{ justifyContent: containerJustify }}
    >
      {isApp ? avatarEl : null}
      <div
        className="flex flex-col"
        style={{
          alignItems: isApp ? "flex-start" : "flex-end",
          gap: 4,
          maxWidth: "min(680px, calc(100% - 56px))",
        }}
      >
        {label ? (
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: labelColor }}
          >
            {label}
          </span>
        ) : null}
        <div style={bubbleStyle}>{children}</div>
      </div>
      {!isApp ? avatarEl : null}
    </div>
  );
}

export function ChatThread({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
