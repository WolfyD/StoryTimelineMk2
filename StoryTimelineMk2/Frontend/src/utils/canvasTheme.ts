let _cache: Record<string, string> = {}

export function invalidateCanvasThemeCache() {
    _cache = {}
}

export function canvasColor(token: string, fallback: string): string {
    if (_cache[token] !== undefined) return _cache[token]
    const val = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    _cache[token] = val || fallback
    return _cache[token]
}

/**
 * A halo for text with nothing behind it. The ruler's names are the only canvas text drawn straight
 * onto the calendar bands -- every other label in here sits on a box fill or a Tag -- and a band the
 * same brightness as the label swallows it. The halo goes the opposite way to the text, so a light
 * label gets a dark one and there is no third answer worth a settings row.
 *
 * ponytail: canvas shadowBlur, repainted every pan frame with the rest of the grid layer. A few dozen
 * short strings at 3px, so it has not shown up in a pan; a Text `stroke` outline is the cheap swap if
 * it ever does.
 */
export function textHalo(hex: string) {
    const h = (hex || '#ffffff').replace('#', '');
    const rgb = h.length < 6 ? h.slice(0, 3).split('').map(c => c + c).join('') : h.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map(i => parseInt(rgb.slice(i, i + 2), 16) || 0);
    // BT.601 weights -- enough to pick a direction, and no gamma pass to get wrong.
    const light = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.5;
    return { shadowColor: light ? '#000000' : '#ffffff', shadowBlur: 3, shadowOpacity: 0.85, shadowOffsetX: 0, shadowOffsetY: 0 };
}
