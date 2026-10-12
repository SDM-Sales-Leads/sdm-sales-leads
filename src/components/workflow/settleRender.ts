/**
 * Resolves when the off-screen export pages matching `selector` are in the DOM, painted, and their fonts and
 * images are ready. Replaces fixed 1.5 s / 2 s sleeps (waits only as long as needed, at most 5 s).
 */
export async function settleRender(selector: string): Promise<void> {
  const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
  const deadline = Date.now() + 5000;
  await frame();
  while (!document.querySelector(selector) && Date.now() < deadline) await frame();
  await frame();
  try { await (document as any).fonts?.ready; } catch { /* fonts API missing: nothing to wait for */ }
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`${selector} img`));
  await Promise.race([
    Promise.all(imgs.map(img => (img.complete ? Promise.resolve() : (img.decode ? img.decode() : Promise.resolve())).catch(() => {}))),
    new Promise<void>(r => setTimeout(r, Math.max(0, deadline - Date.now()))),
  ]);
  await frame();
}
