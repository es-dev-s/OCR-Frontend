/** Browser event when review queue / documents should soft-refresh. */
export const REVIEW_REFRESH_EVENT = "ocr:review-refresh";

export function emitReviewRefresh(detail?: { entityId?: string; type?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(REVIEW_REFRESH_EVENT, { detail: detail ?? {} }),
  );
}

export function onReviewRefresh(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = () => handler();
  window.addEventListener(REVIEW_REFRESH_EVENT, wrapped);
  return () => window.removeEventListener(REVIEW_REFRESH_EVENT, wrapped);
}
