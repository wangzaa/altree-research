import { describe, it, expect, beforeEach, vi } from "vitest";
import { cloneCanonicalThesis } from "@/tests/fixtures/thesis";

const createMessageMock = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  createMessage: createMessageMock,
}));

function mockToolUse(input: unknown) {
  createMessageMock.mockResolvedValueOnce({
    text: "",
    tool_calls: [{ id: "call_1", name: "classify_questions", input }],
    usage: { input_tokens: 200, output_tokens: 80 },
    model: "anthropic/claude-haiku-4-5",
    finish_reason: "tool_calls",
    raw: {},
  });
}

const threeQuestions = [
  "Which EU defense primes rank top-3 by 5y revenue growth?",
  "What does the corpus say about NATO procurement back-loading risk?",
  "What is sell-side consensus on RHM.DE FY27 EPS?",
];

const threeValidClassifications = [
  {
    question: threeQuestions[0],
    category: "derivable" as const,
    hint: {
      op: "rank_by_metric" as const,
      metric: "revenue_growth_yoy" as const,
      direction: "desc" as const,
      limit: 3,
      filter: { region: "EUROZONE" as const },
    },
    confidence: 0.8,
  },
  {
    question: threeQuestions[1],
    category: "corpus" as const,
    hint: "NATO procurement back-loading risk",
    confidence: 0.7,
  },
  {
    question: threeQuestions[2],
    category: "needs_analyst" as const,
    hint: null,
    confidence: 0.9,
  },
];

describe("classifyQuestions", () => {
  beforeEach(() => {
    createMessageMock.mockReset();
  });

  it("returns ok with classifications on a well-formed tool call", async () => {
    mockToolUse({ classifications: threeValidClassifications });
    const { classifyQuestions } = await import(
      "@/lib/agents/question-classifier"
    );
    const result = await classifyQuestions({
      thesis: cloneCanonicalThesis(),
      questions: threeQuestions,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.classifications).toHaveLength(3);
      expect(result.classifications[0].category).toBe("derivable");
      expect(result.model).toBe("anthropic/claude-haiku-4-5");
      expect(result.usage.input_tokens).toBe(200);
      expect(result.usage.output_tokens).toBe(80);
    }
    expect(createMessageMock).toHaveBeenCalledTimes(1);
    const callArg = createMessageMock.mock.calls[0][0];
    expect(callArg.agent).toBe("question_classifier");
  });

  it("returns ok:false when the model omits the tool call", async () => {
    createMessageMock.mockResolvedValueOnce({
      text: "Here is some prose instead.",
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 30 },
      model: "anthropic/claude-haiku-4-5",
      finish_reason: "stop",
      raw: {},
    });
    const { classifyQuestions } = await import(
      "@/lib/agents/question-classifier"
    );
    const result = await classifyQuestions({
      thesis: cloneCanonicalThesis(),
      questions: threeQuestions,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/tool_use|tool_call/i);
    }
  });

  it("returns ok:false when a derivable hint has an unknown op", async () => {
    mockToolUse({
      classifications: [
        {
          question: threeQuestions[0],
          category: "derivable",
          hint: {
            op: "do_a_barrel_roll",
            metric: "revenue_growth_yoy",
            direction: "desc",
            limit: 3,
          },
          confidence: 0.8,
        },
        threeValidClassifications[1],
        threeValidClassifications[2],
      ],
    });
    const { classifyQuestions } = await import(
      "@/lib/agents/question-classifier"
    );
    const result = await classifyQuestions({
      thesis: cloneCanonicalThesis(),
      questions: threeQuestions,
    });
    expect(result.ok).toBe(false);
  });

  it("returns ok:false on length mismatch between questions and classifications", async () => {
    mockToolUse({
      classifications: [threeValidClassifications[1]],
    });
    const { classifyQuestions } = await import(
      "@/lib/agents/question-classifier"
    );
    const result = await classifyQuestions({
      thesis: cloneCanonicalThesis(),
      questions: [threeQuestions[0], threeQuestions[1]],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/count|length|mismatch/i);
    }
  });

  it("returns ok:false when the model reorders or rewrites questions", async () => {
    mockToolUse({
      classifications: [
        threeValidClassifications[0],
        {
          ...threeValidClassifications[1],
          question: "Some entirely different question text",
        },
        threeValidClassifications[2],
      ],
    });
    const { classifyQuestions } = await import(
      "@/lib/agents/question-classifier"
    );
    const result = await classifyQuestions({
      thesis: cloneCanonicalThesis(),
      questions: threeQuestions,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/reordered|mismatch/i);
    }
  });

  it("short-circuits with ok:true and no LLM call when questions is empty", async () => {
    const { classifyQuestions } = await import(
      "@/lib/agents/question-classifier"
    );
    const result = await classifyQuestions({
      thesis: cloneCanonicalThesis(),
      questions: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.classifications).toEqual([]);
    }
    expect(createMessageMock).not.toHaveBeenCalled();
  });
});
