/**
 * Where the media folder is served from. WebView2 maps it to a virtual host; the local
 * server (BL-68) serves it at /media on its own origin.
 */
const base = window.chrome?.webview ? 'https://media.app/' : '/media/';

/** Absolute URL for a media-folder-relative path (`Images/2024/foo.png`). */
export function mediaUrl(relativePath: string): string {
	return base + relativePath;
}
