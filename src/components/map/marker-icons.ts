// NIGHTRIDE — inline SVG marker icons for the map (plain DOM markers,
// no per-marker React roots — keeps large layers cheap).

export type MarkerIconName =
  | 'hazard'
  | 'damage'
  | 'construction'
  | 'closure'
  | 'charging'
  | 'riding'
  | 'safety'
  | 'camera'
  | 'plane'
  | 'rider'
  | 'pin'

const S = 20 // viewBox size
const stroke = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 ${S} ${S}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

const ICONS: Record<MarkerIconName, string> = {
  hazard: stroke(
    '<path d="M10.5 3.5 18 16.5a1.2 1.2 0 0 1-1 1.8H3.6a1.2 1.2 0 0 1-1-1.8Z"/><path d="M10.3 8.6v4"/><circle cx="10.3" cy="15.4" r="0.4" fill="currentColor"/>',
  ),
  damage: stroke(
    '<path d="M3 16.5 10 3l7 13.5"/><path d="M6.5 13.5h7"/><path d="M10 9.8v1.6"/>',
  ),
  construction: stroke(
    '<rect x="3.5" y="3.5" width="13.5" height="13.5" rx="1.5"/><path d="M3.5 8h13.5M8 8v9M13 8v9"/>',
  ),
  closure: stroke(
    '<circle cx="10.5" cy="10.5" r="7"/><path d="M5.6 5.6l9.8 9.8"/>',
  ),
  charging: stroke(
    '<path d="M12.5 3 6 11.5h4l-1.5 6L15.5 9h-4Z"/>',
  ),
  riding: stroke(
    '<path d="M3.5 15.5c2 0 2.8-1.2 4.6-4.4C9.9 7.9 10.9 6 13.5 6c2.6 0 3.6 1.9 5.4 5.1"/><circle cx="5.5" cy="16.5" r="2.3"/><circle cx="15.5" cy="16.5" r="2.3"/>',
  ),
  safety: stroke(
    '<path d="M10.5 3 16 5v5c0 3.6-2.4 6.4-5.5 7.5C7.4 16.4 5 13.6 5 10V5Z"/><path d="M10.5 8v3.5"/><circle cx="10.5" cy="13.7" r="0.4" fill="currentColor"/>',
  ),
  camera: stroke(
    '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H8l1.4-2h3.2L14 7h2.5A1.5 1.5 0 0 1 18 8.5v7A1.5 1.5 0 0 1 16.5 17h-12A1.5 1.5 0 0 1 3 15.5Z"/><circle cx="10.5" cy="12" r="3"/>',
  ),
  plane: stroke(
    '<path d="M10.5 2.6c.55 0 1 .9 1 2v4.1l6.3 3.5v1.7l-6.3-1.9v3.6l1.9 1.5v1.4l-2.9-.9-2.9.9v-1.4l1.9-1.5v-3.6L3.2 13.9v-1.7l6.3-3.5V4.6c0-1.1.45-2 1-2Z"/>',
  ),
  rider: stroke(
    '<circle cx="10.5" cy="6" r="2.4"/><path d="M6 17.5c1.6 0 2.3-1 3.7-3.6 1.4-2.6 2.2-4.1 4.3-4.1s2.9 1.5 4.3 4.1"/><path d="M4.5 14.5 8 11.5"/>',
  ),
  pin: stroke(
    '<path d="M12 21s-6.5-5.4-6.5-10.2A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.8C18.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/>',
  ),
}

export function markerIconSvg(name: MarkerIconName): string {
  return ICONS[name] ?? ICONS.pin
}

export function createMarkerElement(
  name: MarkerIconName,
  opts: { label?: string; size?: number; rotate?: number | null; selected?: boolean } = {},
): HTMLElement {
  const el = document.createElement('div')
  const size = opts.size ?? 32
  el.className = `nr-marker${opts.selected ? ' is-selected' : ''}`
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  if (opts.label) el.setAttribute('title', opts.label)
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', opts.label ?? name)
  if (opts.rotate != null && Number.isFinite(opts.rotate)) {
    el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;transform:rotate(${opts.rotate}deg)">${markerIconSvg(name)}</span>`
  } else {
    el.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">${markerIconSvg(name)}</span>`
  }
  return el
}
