// Client-side image helpers: grab a frame or a file and shrink it before upload.

const MAX_SIDE = 1024;
const QUALITY = 0.8;

function toJpegBase64(
  source: CanvasImageSource,
  width: number,
  height: number,
): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(source, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function captureVideoFrame(video: HTMLVideoElement, frame?: DOMRect | null): string {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("The camera isn't ready yet");
  }
  if (!frame) return toJpegBase64(video, video.videoWidth, video.videoHeight);

  // Crop to the on-screen viewfinder so the photo matches the camera corners. The video is shown
  // with object-fit: cover, so map screen pixels back to video pixels through that scale and offset.
  const box = video.getBoundingClientRect();
  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  const offX = box.left + (box.width - video.videoWidth * scale) / 2;
  const offY = box.top + (box.height - video.videoHeight * scale) / 2;
  const sx = Math.max(0, (frame.left - offX) / scale);
  const sy = Math.max(0, (frame.top - offY) / scale);
  const sw = Math.min(video.videoWidth - sx, frame.width / scale);
  const sh = Math.min(video.videoHeight - sy, frame.height / scale);
  if (sw < 32 || sh < 32) return toJpegBase64(video, video.videoWidth, video.videoHeight);

  const out = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * out);
  canvas.height = Math.round(sh * out);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Draws what's inside the on-screen viewfinder (`frame`) onto `canvas`, at most `maxSide` px, for
 *  barcode scanning. Returns how many screen pixels one canvas pixel covers, or null if the camera
 *  isn't ready. Same mapping as captureVideoFrame (object-fit: cover, CSS zoom included). */
export function drawVideoCrop(video: HTMLVideoElement, frame: DOMRect, canvas: HTMLCanvasElement, maxSide: number): number | null {
  if (!video.videoWidth || !video.videoHeight || frame.width < 8 || frame.height < 8) return null;
  const box = video.getBoundingClientRect();
  const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
  const offX = box.left + (box.width - video.videoWidth * scale) / 2;
  const offY = box.top + (box.height - video.videoHeight * scale) / 2;
  const sx = (frame.left - offX) / scale;
  const sy = (frame.top - offY) / scale;
  const sw = frame.width / scale;
  const sh = frame.height / scale;
  const out = Math.min(1, maxSide / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round(sw * out));
  canvas.height = Math.max(1, Math.round(sh * out));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return frame.width / canvas.width;
}

export async function fileToBase64(file: File): Promise<string> {
  // createImageBitmap respects EXIF orientation with this option.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return toJpegBase64(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
