import type { FollowUp } from "../types";

// Follow-up memory (tested in book.test.ts): the last few question/answer turns about one result,
// sent as `conversation` so "and the price?" makes sense.

export type Turn = { question: string; answer: string };
export const MAX_TURNS = 6;

export function trimConversation(turns: Turn[], max = MAX_TURNS): Turn[] {
  return turns.slice(-max);
}

export function conversationFrom(followUps: FollowUp[]): Turn[] {
  return trimConversation(
    followUps
      .filter((f) => f.answer && !f.answer.error && f.answer.spokenText.trim())
      .map((f) => ({ question: f.question, answer: f.answer!.spokenText.trim() })),
  );
}
