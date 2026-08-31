/**
 * CMS image upload.
 *
 * An upload here has to produce everything the build-time pipeline produces for
 * the images that ship with the app, because the homepage renders both through
 * the same `ResponsiveImage`. That means: a centre-crop to the aspect the
 * homepage lays the image out at, several widths, a modern format alongside a
 * universal JPEG fallback, and a tiny inline blur-up placeholder.
 *
 * Previously this uploaded a single flat JPEG and returned a ten-year signed
 * URL. Any image swapped in through the CMS therefore had no srcset, no modern
 * format, no placeholder and no LCP preload — and the signed token ended up
 * published in og:image, where a JWT-secret rotation would have broken it.
 *
 * AVIF is deliberately absent: browsers cannot reliably encode it from a canvas
 * (`toBlob` falls back to PNG where it is unsupported), so uploads ship
 * WebP + JPEG. The generated manifest in image-variants.ts still carries AVIF
 * for the images that shipped with the build.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ImageEntry, ImageWidth } from "@/lib/image-variants";

const BUCKET = "homepage-media";

export const ASPECTS = {
  hero: 16 / 9,
  wide: 16 / 10,
  portrait: 4 / 5,
} as const;

export type AspectName = keyof typeof ASPECTS;

/** Rendered widths per slot, matching the `sizes` the homepage declares. */
const WIDTHS: Record<AspectName, number[]> = {
  hero: [480, 768, 1200, 1600, 1920],
  wide: [480, 768, 1200, 1600],
  portrait: [480, 768, 1200],
};

/** Encoder quality per format — WebP holds up at a lower number than JPEG. */
const QUALITY = { webp: 0.72, jpeg: 0.82 } as const;

/** Width of the inlined blur-up placeholder. Kept tiny: it ships in the HTML. */
const LQIP_WIDTH = 20;

type Encoded = { blob: Blob; width: number };

/** Centre-crop box for fitting `bitmap` to `aspect` without distorting it. */
function cropBox(bitmap: ImageBitmap, aspect: number) {
  const srcAspect = bitmap.width / bitmap.height;
  let sx = 0,
    sy = 0,
    sw = bitmap.width,
    sh = bitmap.height;
  if (srcAspect > aspect) {
    sw = Math.round(bitmap.height * aspect);
    sx = Math.round((bitmap.width - sw) / 2);
  } else if (srcAspect < aspect) {
    sh = Math.round(bitmap.width / aspect);
    sy = Math.round((bitmap.height - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

/** Draws the centre-cropped bitmap at `width` and encodes it. */
async function render(
  bitmap: ImageBitmap,
  aspect: number,
  width: number,
  type: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Encoded | null> {
  const { sx, sy, sw, sh } = cropBox(bitmap, aspect);
  const outW = Math.min(width, sw);
  const outH = Math.max(1, Math.round(outW / aspect));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  // Safari/Firefox silently hand back a PNG when the type is unsupported.
  if (!blob || blob.type !== type) return null;
  return { blob, width: outW };
}

async function makePlaceholder(bitmap: ImageBitmap, aspect: number): Promise<string | undefined> {
  const encoded = await render(bitmap, aspect, LQIP_WIDTH, "image/jpeg", 0.4);
  if (!encoded) return undefined;
  return new Promise<string | undefined>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(encoded.blob);
  });
}

export interface UploadResult {
  /** Public URL of the full-size JPEG — what gets stored as the image_url. */
  url: string;
  /** Responsive manifest for this URL, merged into homepage_content.image_variants. */
  variants: ImageEntry;
  /** Bytes before and after processing, for the admin's feedback line. */
  before: number;
  after: number;
}

export async function uploadHomepageImage(file: File, aspect: AspectName): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const before = file.size;

  const bitmap = await createImageBitmap(file);
  const ratio = ASPECTS[aspect];

  // One folder per upload keeps every width of an image together, so a stale
  // image can be removed as a unit later.
  const stem = `homepage/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Never upscale past the source: clamp each target to the cropped width and
  // drop the duplicates that clamping produces for small originals.
  const { sw: maxWidth } = cropBox(bitmap, ratio);
  const targets = Array.from(new Set(WIDTHS[aspect].map((w) => Math.min(w, maxWidth)))).sort(
    (a, b) => a - b,
  );

  const publicUrl = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const upload = async (path: string, blob: Blob, contentType: string) => {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return publicUrl(path);
  };

  const webp: ImageWidth[] = [];
  const jpg: ImageWidth[] = [];
  let after = 0;
  let fullSizeUrl: string | null = null;

  for (const target of targets) {
    const [w, j] = await Promise.all([
      render(bitmap, ratio, target, "image/webp", QUALITY.webp),
      render(bitmap, ratio, target, "image/jpeg", QUALITY.jpeg),
    ]);

    if (j) {
      const url = await upload(`${stem}/w${j.width}.jpg`, j.blob, "image/jpeg");
      jpg.push({ width: j.width, url });
      after += j.blob.size;
      fullSizeUrl = url; // widths ascend, so the last JPEG is the largest
    }
    if (w) {
      const url = await upload(`${stem}/w${w.width}.webp`, w.blob, "image/webp");
      webp.push({ width: w.width, url });
      after += w.blob.size;
    }
  }

  if (!fullSizeUrl) throw new Error("Could not encode the image — try a different file.");

  const placeholder = await makePlaceholder(bitmap, ratio);
  bitmap.close?.();

  const variants: ImageEntry = {
    ...(placeholder ? { placeholder } : {}),
    sources: [
      ...(webp.length ? [{ format: "webp" as const, widths: webp }] : []),
      ...(jpg.length ? [{ format: "jpg" as const, widths: jpg }] : []),
    ],
  };

  return { url: fullSizeUrl, variants, before, after };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
