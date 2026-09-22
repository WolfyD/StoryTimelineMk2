/**
 * WebView2 injects this object on Windows. In the browser build (BL-68) it is absent, which
 * is exactly how the bridge decides which transport to use — so it has to be optional here.
 */
declare global {
	interface Window {
		chrome?: {
			webview?: {
				postMessage(message: unknown): void;
				addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
				removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
			};
		};
	}
}

export {};
