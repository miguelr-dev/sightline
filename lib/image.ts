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

export function captureVideoFrame(video: HTMLVideoElement): string {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("The camera isn't ready yet");
  }
  return toJpegBase64(video, video.videoWidth, video.videoHeight);
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
