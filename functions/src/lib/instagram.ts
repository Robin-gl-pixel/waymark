/**
 * Instagram post/reel URL → OpenGraph metadata fetch.
 *
 * When iOS Share Sheet hands the app a reel URL (not a video file),
 * we fetch the public HTML and parse OpenGraph meta tags:
 *   - og:image → thumbnail we can feed to Claude vision
 *   - og:description → caption text (often contains name + address)
 *
 * Instagram serves these OG tags for public content without auth. We use
 * a browser-like User-Agent so we're not immediately rate-limited. Private
 * posts / login-walled content will return an empty description.
 *
 * NOT a scraper — we only read the publicly-served OG metadata that
 * Instagram intentionally exposes for link previews.
 */
export interface InstagramMetadata {
  imageUrl: string | null;   // og:image
  description: string | null; // og:description
}

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const OG_META_REGEX = /<meta\s+property="og:(\w+)"\s+content="([^"]*)"\s*\/?>/gi;

export function isInstagramUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(?:^|\.)instagram\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export async function fetchInstagramMetadata(url: string): Promise<InstagramMetadata> {
  if (!isInstagramUrl(url)) {
    throw new Error('Not an Instagram URL');
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Instagram fetch failed: HTTP ${res.status}`);
  }

  const html = await res.text();

  // Collect all og:* tags in one pass.
  const og: Record<string, string> = {};
  let match: RegExpExecArray | null;
  const regex = new RegExp(OG_META_REGEX);
  while ((match = regex.exec(html)) !== null) {
    const key = match[1].toLowerCase();
    const value = decodeHtmlEntities(match[2]);
    // First occurrence wins — Instagram sometimes duplicates og tags.
    if (!og[key]) og[key] = value;
  }

  return {
    imageUrl: og.image || null,
    description: og.description || null,
  };
}

/**
 * Fetch the og:image bytes and encode as base64 (data URI-compatible).
 * Returns the base64 payload and MIME type suitable for the Claude vision path.
 */
export async function fetchImageAsBase64(
  imageUrl: string,
): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Image fetch failed: HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  if (contentType.startsWith('image/png')) mediaType = 'image/png';
  else if (contentType.startsWith('image/webp')) mediaType = 'image/webp';

  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { base64, mediaType };
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
