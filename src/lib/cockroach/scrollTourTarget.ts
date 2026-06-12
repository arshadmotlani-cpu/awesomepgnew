/** Scroll a tour target so it sits in the vertical center of the viewport. */
export function scrollTourTargetToCenter(el: HTMLElement): void {
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });

  // scrollIntoView can stop at "nearest" on some layouts — nudge to true center.
  window.requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
    if (Math.abs(offset) > 6) {
      window.scrollBy({ top: offset, behavior: 'smooth' });
    }
  });
}
