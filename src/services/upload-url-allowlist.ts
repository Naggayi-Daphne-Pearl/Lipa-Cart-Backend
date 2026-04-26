/**
 * Validate that a media URL submitted by a user (e.g. KYC photo, license)
 * actually points at our Cloudinary tenant rather than at an arbitrary
 * external host. Without this, the rider/shopper KYC controllers — which
 * accept image URLs as plain strings — let any client persist any URL,
 * including non-image, oversized, or malicious assets, completely
 * bypassing the upload plugin's size/MIME constraints.
 */
export function isAllowedUploadUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;
  if (url.host !== 'res.cloudinary.com') return false;

  // Cloudinary URLs always start with /<cloud_name>/ — pin to ours so a
  // foreign Cloudinary tenant can't be used as a stand-in.
  const cloudName = (process.env.CLOUDINARY_NAME || '').toLowerCase();
  if (!cloudName) {
    // No tenant configured — fail closed rather than open.
    return false;
  }
  return url.pathname.toLowerCase().startsWith(`/${cloudName}/`);
}

/**
 * Validate every value in `urls`. Returns the first key that fails, or null
 * if all are valid. Empty-string values pass through (caller decides if the
 * field is required).
 */
export function firstInvalidUrl(urls: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(urls)) {
    if (value === undefined || value === null || value === '') continue;
    if (!isAllowedUploadUrl(value)) return key;
  }
  return null;
}
