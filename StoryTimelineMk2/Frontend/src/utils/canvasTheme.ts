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
