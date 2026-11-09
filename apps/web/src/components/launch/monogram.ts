/** Black/white SVG monogram used as a token image when the creator has none. */
export function monogramDataUrl(ticker: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='100%' height='100%' fill='#000'/><rect x='8' y='8' width='240' height='240' fill='none' stroke='#fff' stroke-width='4'/><text x='50%' y='54%' fill='#fff' font-family='Arial Black,Arial' font-weight='900' font-size='96' text-anchor='middle' dominant-baseline='middle'>${ticker.slice(0, 3)}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
