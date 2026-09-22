// Which machine the page is running on. The desktop host is always Windows (BL-68 kept it
// that way), but the browser build reaches macOS and Linux, where "Explorer" and a list of
// Segoe fonts are simply wrong.

export const IS_MAC = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)
export const IS_WINDOWS = /Win/.test(navigator.platform || navigator.userAgent)

/** What to call the thing that shows folders, for button titles and hints. */
export const FILE_MANAGER = IS_MAC ? 'Finder' : IS_WINDOWS ? 'Explorer' : 'your file manager'
