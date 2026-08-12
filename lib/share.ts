/** Opaque public share path: /s/{64-hex} */
export const SHARE_TOKEN_RE = /^[a-f0-9]{64}$/;

export function isShareToken(token: string): boolean {
  return SHARE_TOKEN_RE.test(token.trim().toLowerCase());
}

export function sharePath(token: string): string {
  return `/s/${token.trim().toLowerCase()}`;
}

/** Absolute share URL for clipboard (browser origin). */
export function shareURL(token: string): string {
  if (typeof window === "undefined") return sharePath(token);
  return `${window.location.origin}${sharePath(token)}`;
}

export async function copyShareURL(token: string): Promise<boolean> {
  const url = shareURL(token);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const el = document.createElement("textarea");
    el.value = url;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
