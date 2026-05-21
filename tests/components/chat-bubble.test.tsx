import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatBubble, ChatThread } from "@/components/chat-bubble";

describe("<ChatBubble>", () => {
  it("renders an app bubble with the body and a from=app data attribute", () => {
    render(<ChatBubble from="app">Hello there</ChatBubble>);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    const root = screen.getByText("Hello there").closest('[data-from]');
    expect(root).toHaveAttribute("data-from", "app");
  });

  it("renders a user bubble with the body and a from=user data attribute", () => {
    render(<ChatBubble from="user">add Japan</ChatBubble>);
    expect(screen.getByText("add Japan")).toBeInTheDocument();
    const root = screen.getByText("add Japan").closest('[data-from]');
    expect(root).toHaveAttribute("data-from", "user");
  });

  it("renders the optional label above the bubble body", () => {
    render(
      <ChatBubble from="app" label="Bull says">
        Synthesis text here
      </ChatBubble>,
    );
    expect(screen.getByText("Bull says")).toBeInTheDocument();
    expect(screen.getByText("Synthesis text here")).toBeInTheDocument();
  });

  it("stacks multiple bubbles inside a ChatThread", () => {
    render(
      <ChatThread>
        <ChatBubble from="app">first</ChatBubble>
        <ChatBubble from="user">second</ChatBubble>
        <ChatBubble from="app">third</ChatBubble>
      </ChatThread>,
    );
    const bubbles = document.querySelectorAll("[data-from]");
    expect(bubbles).toHaveLength(3);
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.getByText("third")).toBeInTheDocument();
  });
});
