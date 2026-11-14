import type { AnalyzeResponse, LookupResponse, Mode } from "./modes";

export type Photo = { uri: string; base64: string; width: number; height: number };

export type FollowUp = { id: number; question: string; answer?: AnalyzeResponse };

export type WebState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; data: LookupResponse };

// One photo and everything SightLine said about it.
export type Shot = {
  id: number;
  photo: Photo | null; // null while the camera is still taking it
  mode: Mode;
  language: string;
  result?: AnalyzeResponse; // undefined while looking
  followUps: FollowUp[];
  web: WebState;
  fromHistory?: boolean; // reopened from Recent: no photo data, so no follow-ups or retry
  asked?: string;
  key?: string;
  label?: string; // header label override, e.g. "Barcode" // frame-check key when read from the detection card (sent to analyze) // "ask while looking": the user's own words, shown at the top of the sheet
};
