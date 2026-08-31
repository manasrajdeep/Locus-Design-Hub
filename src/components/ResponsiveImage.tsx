import { useEffect, useRef, useState } from "react";
import { MIME, type ImageFormat } from "@/lib/image-variants";
import { lookupVariants, normalizeImageSrc, type ImageVariantMap } from "@/lib/image-registry";

/**
 * Responsive CMS image.
 *
 * - Serves AVIF → WebP → JPEG through <picture>, so Chrome/Edge/Firefox get
 *   AVIF, Safari 16+ / iOS 16+ get AVIF or WebP, and every older browser
 *   (incl. iOS 14/15 Safari) falls back to the JPEG in <img src>/srcset.
 * - Picks the right width per viewport + DPR via srcset/sizes.
 * - Lazy-loads by default and fades in over a tiny blurred base64 placeholder
 *   so there is something on screen immediately and no layout shift.
 */
const UNSPLASH_WIDTHS = [480, 768, 1200, 1600];

function unsplashSrcSet(src: string): string | undefined {
  if (!src.includes("images.unsplash.com")) return undefined;
  try {
    return UNSPLASH_WIDTHS.map((w) => {
      const u = new URL(src);
      u.searchParams.set("w", String(w));
      // Unsplash serves AVIF/WebP automatically via content negotiation.
      u.searchParams.set("auto", "format");
      return `${u.toString()} ${w}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}

/** JPEG (or Unsplash) srcset used on the <img> itself — the universal fallback. */
export function buildSrcSet(src: string, variants?: ImageVariantMap): string | undefined {
  const entry = lookupVariants(src, variants);
  const jpg = entry?.sources.find((s) => s.format === "jpg");
  if (jpg?.widths.length) return jpg.widths.map((v) => `${v.url} ${v.width}w`).join(", ");
  return unsplashSrcSet(src);
}

/** Modern-format <source> entries, widest-support-last (avif, then webp). */
export function buildSources(
  src: string,
  variants?: ImageVariantMap,
): { type: string; srcSet: string }[] {
  const entry = lookupVariants(src, variants);
  if (!entry) return [];
  const order: ImageFormat[] = ["avif", "webp"];
  return order.flatMap((format) => {
    const source = entry.sources.find((s) => s.format === format);
    if (!source?.widths.length) return [];
    return [
      {
        type: MIME[format],
        srcSet: source.widths.map((v) => `${v.url} ${v.width}w`).join(", "),
      },
    ];
  });
}

export function getPlaceholder(src: string, variants?: ImageVariantMap): string | undefined {
  return lookupVariants(src, variants)?.placeholder;
}

export interface ResponsiveImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "srcSet"
> {
  src: string;
  alt: string;
  /** CSS `sizes` describing the rendered width at each breakpoint. */
  sizes?: string;
  /** Set false to skip the blur-up layer (e.g. tiny thumbnails). */
  blurUp?: boolean;
}

export function ResponsiveImage({
  src,
  alt,
  sizes = "100vw",
  loading = "lazy",
  decoding = "async",
  blurUp = true,
  className,
  style,
  onLoad,
  onError,
  ...rest
}: ResponsiveImageProps) {
  // The variant lookups normalise internally, but the <img> fallback needs the
  // local path too — a legacy asset-host URL from an older CMS version 404s.
  const resolvedSrc = normalizeImageSrc(src);
  const srcSet = buildSrcSet(src);
  const sources = buildSources(src);
  const placeholder = blurUp ? getPlaceholder(src) : undefined;
  const imgRef = useRef<HTMLImageElement | null>(null);

  /**
   * "Settled" means the browser has finished trying — successfully or not.
   *
   * This used to track success only, so an image that failed to load kept the
   * blur-up filter forever and rendered as a permanent smear rather than
   * anything a viewer could recognise as missing. A failed image now drops the
   * blur and shows the low-resolution placeholder as-is.
   */
  const [settled, setSettled] = useState(false);

  // Cached images finish before hydration and never fire onLoad afterwards.
  // `complete` is also true for an image that has already failed.
  useEffect(() => {
    setSettled(!!imgRef.current?.complete);
  }, [src]);

  const img = (
    <img
      {...rest}
      ref={imgRef}
      src={resolvedSrc}
      alt={alt}
      {...(srcSet ? { srcSet, sizes } : {})}
      loading={loading}
      decoding={decoding}
      onLoad={(e) => {
        setSettled(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setSettled(true);
        onError?.(e);
      }}
      className={className}
      style={
        placeholder
          ? {
              ...style,
              backgroundImage: `url(${placeholder})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              // fade the real pixels in over the blur, no layout shift
              opacity: settled ? 1 : 0.999,
              filter: settled ? "none" : "blur(12px)",
              transition: "filter 420ms ease-out",
            }
          : style
      }
    />
  );

  if (!sources.length) return img;

  return (
    <picture>
      {sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={sizes} />
      ))}
      {img}
    </picture>
  );
}
