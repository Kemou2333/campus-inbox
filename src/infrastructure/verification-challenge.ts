/** The PNG contains raster pixels only; the correct answer remains on the server. */
export interface HumanVerificationRequest {
  type: 'image';
  image: string;
  token: string;
  expires: number;
  error?: string;
  refreshAfter?: number;
  /** Only requests a replacement signed image; it must never dispatch a model. */
  refresh?: () => Promise<HumanVerificationRequest>;
}

export type HumanVerificationHandler = (request: HumanVerificationRequest, signal: AbortSignal) => Promise<string>;

export function parseHumanVerificationRequest(value: unknown): HumanVerificationRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const challenge = value as Record<string, unknown>;
  if (challenge.type !== 'image'
    || typeof challenge.image !== 'string' || challenge.image.length > 16_000
    || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(challenge.image)
    || typeof challenge.token !== 'string' || !challenge.token || challenge.token.length > 1800
    || typeof challenge.expires !== 'number' || !Number.isSafeInteger(challenge.expires)
    || challenge.expires <= Date.now() || challenge.expires > Date.now() + 125_000
    || challenge.refreshAfter!==undefined&&(typeof challenge.refreshAfter!=='number'||!Number.isSafeInteger(challenge.refreshAfter)||challenge.refreshAfter<0||challenge.refreshAfter>challenge.expires)) return null;
  return { type: 'image', image: challenge.image, token: challenge.token, expires: challenge.expires, ...(typeof challenge.refreshAfter==='number'?{refreshAfter:challenge.refreshAfter}:{}) };
}
