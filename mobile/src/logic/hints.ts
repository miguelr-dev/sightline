// How a framing hint ("Too dark", "Move back") reaches the user (tested in qa.test.ts).
// Nothing talks unless asked: hints are shown, and announced to VoiceOver when it's on. Only an
// explicit session (book retake, entering BARCODE mode) may speak one aloud.

export function hintDelivery(o: { screenReader: boolean; session?: "book" | "barcodeEntry" }): {
  show: boolean;
  announce: boolean;
  speak: boolean;
} {
  if (o.screenReader) return { show: true, announce: true, speak: false };
  return { show: true, announce: false, speak: !!o.session };
}
