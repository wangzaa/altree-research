"use client";

import React, { useState, type FormEvent, type ReactNode } from "react";

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatInputText
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatInputTextProps {
  placeholder?: string;
  icon?: ReactNode;
  suffix?: string;
  multiline?: boolean;
  initialValue?: string;
  value?: string;
  onChange?: (next: string) => void;
  onSubmit: (value: string) => void;
  submitLabel?: string;
  disabled?: boolean;
  minChars?: number;
  /** Hide the submit button when the input is empty (trim()=""). Lets the
   * parent provide an alternative affordance for the empty-input case
   * (e.g. a "continue without input" button) without a half-disabled
   * checkmark sitting in the dead state. */
  hideSubmitWhenEmpty?: boolean;
}

export function ChatInputText({
  placeholder,
  icon,
  suffix,
  multiline = false,
  initialValue = "",
  value: controlledValue,
  onChange,
  onSubmit,
  submitLabel = "Submit",
  disabled = false,
  minChars = 1,
  hideSubmitWhenEmpty = false,
}: ChatInputTextProps) {
  const [internal, setInternal] = useState(initialValue);
  const value = controlledValue ?? internal;

  function set(next: string) {
    if (onChange) onChange(next);
    if (controlledValue === undefined) setInternal(next);
  }

  const trimmed = value.trim();
  const isReady = trimmed.length >= minChars && !disabled;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isReady) return;
    onSubmit(value);
  }

  const wrapperStyle: React.CSSProperties = {
    background: "white",
    border: "1px solid #E5E5E5",
    borderRadius: multiline ? 18.75 : 9999,
    padding: multiline ? "12px 14px" : "8px 12px",
    display: "flex",
    alignItems: multiline ? "flex-start" : "center",
    gap: 8,
    flex: 1,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: 15,
    color: "var(--color-black)",
    fontFamily: "var(--font-sans)",
    ...(multiline
      ? { resize: "none", minHeight: 72, lineHeight: 1.5 }
      : { padding: "2px 0" }),
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2"
      data-testid="chat-input-text"
    >
      <div style={wrapperStyle}>
        {icon ? (
          <span
            className="flex items-center"
            style={{ color: "#585858" }}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            style={inputStyle}
            rows={3}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            style={inputStyle}
          />
        )}
        {suffix ? (
          <span
            className="text-sm"
            style={{ color: "#585858", flexShrink: 0 }}
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {hideSubmitWhenEmpty && trimmed.length === 0 ? null : (
        <button
          type="submit"
          disabled={!isReady}
          aria-label={submitLabel}
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: isReady ? "var(--color-pear-black)" : "#B5B5B5",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            cursor: isReady ? "pointer" : "not-allowed",
            flexShrink: 0,
            transition: "background-color 0.2s var(--pear-ease)",
          }}
        >
          <CheckIcon />
        </button>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatInputBinary
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatInputBinaryProps {
  yesLabel?: string;
  noLabel?: string;
  onSelect: (value: boolean) => void;
  disabled?: boolean;
}

export function ChatInputBinary({
  yesLabel = "Yes",
  noLabel = "No",
  onSelect,
  disabled = false,
}: ChatInputBinaryProps) {
  return (
    <div className="flex items-center gap-2" data-testid="chat-input-binary">
      <button
        type="button"
        onClick={() => onSelect(false)}
        disabled={disabled}
        className="btn btn-outline"
      >
        <CrossIcon /> {noLabel}
      </button>
      <button
        type="button"
        onClick={() => onSelect(true)}
        disabled={disabled}
        className="btn btn-secondary"
      >
        <CheckIcon /> {yesLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatInputMultiSelect
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatInputMultiSelectOption {
  value: string;
  label: string;
}

export interface ChatInputMultiSelectProps {
  options: ChatInputMultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  onSubmit?: (selected: string[]) => void;
  submitLabel?: string;
  disabled?: boolean;
  prompt?: string;
}

export function ChatInputMultiSelect({
  options,
  value,
  onChange,
  onSubmit,
  submitLabel = "Continue",
  disabled = false,
  prompt,
}: ChatInputMultiSelectProps) {
  function toggle(v: string) {
    if (disabled) return;
    const has = value.includes(v);
    onChange(has ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="chat-input-multiselect"
    >
      {prompt ? (
        <p className="text-sm" style={{ color: "#585858" }}>
          {prompt}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              disabled={disabled}
              aria-pressed={selected}
              className="rounded-full px-4 py-2 text-sm transition-colors"
              style={{
                background: selected ? "var(--color-pear-black)" : "white",
                color: selected ? "white" : "var(--color-black)",
                border: selected
                  ? "1px solid var(--color-pear-black)"
                  : "1px solid #E5E5E5",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {onSubmit ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSubmit(value)}
            disabled={disabled || value.length === 0}
            className="btn btn-primary"
          >
            {submitLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatInputAction
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatInputActionProps {
  label: string;
  onAction: () => void;
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  variant?: "primary" | "secondary";
}

export function ChatInputAction({
  label,
  onAction,
  icon,
  loading = false,
  loadingLabel,
  disabled = false,
  secondaryLabel,
  onSecondary,
  variant = "primary",
}: ChatInputActionProps) {
  const primaryClass = variant === "primary" ? "btn btn-primary" : "btn btn-secondary";
  const text = loading ? loadingLabel ?? `${label}...` : label;

  return (
    <div className="flex items-center gap-2" data-testid="chat-input-action">
      <button
        type="button"
        onClick={onAction}
        disabled={disabled || loading}
        className={primaryClass}
        style={{ flex: 1, justifyContent: "center" }}
      >
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>{text}</span>
      </button>
      {secondaryLabel && onSecondary ? (
        <button
          type="button"
          onClick={onSecondary}
          disabled={disabled || loading}
          className="btn btn-outline"
        >
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  );
}
