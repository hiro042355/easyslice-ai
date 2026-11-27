/**
 * Canonical metadata declaration for the Y49 publication inbox.
 *
 * This is a data canonicalisation helper only. It does not verify rights,
 * ownership, media bytes or a provider channel.
 */

export type PublicationContentFormat = "YOUTUBE_SHORTS" | "YOUTUBE_REGULAR" | "TIKTOK_SHORT_VIDEO";

/** Platform/format pairing admitted by the durable inbox. TikTok reuses the same
 * canonical metadata declaration; only the destination-specific format label differs. */
export type PublicationContentPlatform = "youtube" | "tiktok";

export const publicationContentFormatsForPlatform = (
  platform: PublicationContentPlatform,
): readonly PublicationContentFormat[] => platform === "tiktok"
  ? Object.freeze(["TIKTOK_SHORT_VIDEO"] as const)
  : Object.freeze(["YOUTUBE_SHORTS", "YOUTUBE_REGULAR"] as const);

export type PublicationMetadataDeclaration = Readonly<{
  title: string;
  description: string;
  tags: readonly string[];
  subtitleRefs: readonly string[];
  thumbnailRef?: string;
  contentFormat: PublicationContentFormat;
}>;

export const canonicalPublicationMetadataJson = (
  value: PublicationMetadataDeclaration,
): string => JSON.stringify({
  title: value.title,
  description: value.description,
  tags: value.tags,
  subtitleRefs: value.subtitleRefs,
  thumbnailRef: value.thumbnailRef ?? null,
  contentFormat: value.contentFormat,
});

export const isPublicationContentFormat = (value: unknown): value is PublicationContentFormat =>
  value === "YOUTUBE_SHORTS" || value === "YOUTUBE_REGULAR" || value === "TIKTOK_SHORT_VIDEO";

export const isPublicationContentPlatform = (value: unknown): value is PublicationContentPlatform =>
  value === "youtube" || value === "tiktok";

/** Declared pairing only; it does not authorize a destination or a provider channel. */
export const isPublicationContentFormatForPlatform = (
  format: unknown,
  platform: unknown,
): boolean => isPublicationContentPlatform(platform) && isPublicationContentFormat(format)
  && publicationContentFormatsForPlatform(platform).includes(format);

const ref = /^[A-Za-z0-9_.:@/-]{1,512}$/;

export function validatePublicationMetadata(
  value: unknown,
): { readonly ok: true; readonly value: PublicationMetadataDeclaration } | { readonly ok: false; readonly code: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "METADATA_INVALID" };
  }
  const record = value as Record<string, unknown>;
  const title = record.title;
  const description = record.description;
  const tags = record.tags;
  const subtitleRefs = record.subtitleRefs;
  const thumbnailRef = record.thumbnailRef;
  const contentFormat = record.contentFormat;
  if (typeof title !== "string" || title.trim().length < 1 || title.length > 200 ||
      typeof description !== "string" || description.length > 5000 ||
      !Array.isArray(tags) || tags.length > 100 ||
      !Array.isArray(subtitleRefs) || subtitleRefs.length > 100 ||
      !isPublicationContentFormat(contentFormat) ||
      (thumbnailRef !== undefined && (typeof thumbnailRef !== "string" || !ref.test(thumbnailRef)))) {
    return { ok: false, code: "METADATA_INVALID" };
  }
  const normalizedTags = tags.map(tag => typeof tag === "string" ? tag.trim() : undefined);
  const normalizedRefs = subtitleRefs.map(entry => typeof entry === "string" ? entry.trim() : undefined);
  if (normalizedTags.some(tag => !tag || tag.length > 100) ||
      normalizedRefs.some(entry => !entry || !ref.test(entry))) {
    return { ok: false, code: "METADATA_INVALID" };
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      title: title.trim(),
      description,
      tags: Object.freeze(normalizedTags as string[]),
      subtitleRefs: Object.freeze(normalizedRefs as string[]),
      ...(typeof thumbnailRef === "string" ? { thumbnailRef: thumbnailRef.trim() } : {}),
      contentFormat,
    }),
  });
}
