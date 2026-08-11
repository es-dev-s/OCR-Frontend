/** Topmost open Modal closes on Escape; nested modals do not all close at once. */
const stack: Array<() => void> = [];

export function pushModalClose(close: () => void): () => void {
  stack.push(close);
  return () => {
    const idx = stack.lastIndexOf(close);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

export function isTopModal(close: () => void): boolean {
  return stack.length > 0 && stack[stack.length - 1] === close;
}
