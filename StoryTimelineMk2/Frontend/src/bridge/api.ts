import type { FullTimelineProject, TimelineProjectContainer } from '@/types/models';
import { useTimelineStore } from '@/stores/timelineStore';

// Define the shape of our bridge messages
interface BridgeMessage {
	action: string;
	payload?: any;
	messageId?: number;
}

// Keep track of requests that are waiting for C# to reply
const pendingRequests = new Map<number, (data: any) => void>();
let messageCounter = 0;

export const BackendAPI = {
	// Fire and forget (for things like "SaveSettings" where you don't need data back)
	send(action: string, payload: unknown = null) {
		if (window.chrome?.webview) {
			window.chrome.webview.postMessage({ action, payload });
		}
	},

	// Request data and wait for the response (The crucial addition)
	request<T>(action: string, payload: unknown = null): Promise<T> {
		return new Promise((resolve) => {
			if (!window.chrome?.webview) {
				console.warn(`[Bridge Offline] Cannot request ${action}`);
				return resolve(null as T);
			}

			const id = ++messageCounter;
			pendingRequests.set(id, resolve); // Store the resolve function

			window.chrome.webview.postMessage({ action, payload, messageId: id });
		});
	},

	// Import Database
	async ImportDatabase() {

		const x:{status:string} = await this.request("ImportDB", { args: [] })
		if(x.status == "ok") {
			const timelines:TimelineProjectContainer = await this.request("GetAllTimelines", { args: [] })
			console.log("Timelines: ", timelines);
			return timelines;
		}
		return null;
	},

	// Retrieve timelines
	async GetAllTimelines() {
		const timelines:TimelineProjectContainer = await this.request("GetAllTimelines", { args: [] })
		console.log("Timelines: ", timelines);
		return timelines;
	},

	// Create project
	async CreateNewProject(title:string) {
		this.send("CreateProject", { title: title })
	},

	// Open Timeline
	async OpenTimeline(id:number) {
		this.send("OpenTimeline", { id: id });
	},

	// Get Timeline Data
	async LoadTimelineData(id:number) {
		const fullTlData:FullTimelineProject = await this.request("GetTimelineData", { id: id });
    	return fullTlData;
	},
};

// Listen for replies from C#
if (window.chrome?.webview) {
	window.chrome.webview.addEventListener('message', (event) => {
		const data = event.data;

		// If this is a reply to a specific request, resolve that Promise
		if (data.messageId && pendingRequests.has(data.messageId)) {
			const resolveFn = pendingRequests.get(data.messageId)!;
			resolveFn(data.payload);
			pendingRequests.delete(data.messageId);
		}
		// Handle unprompted pushes from C# (like background tasks finishing)
		else if (data.action) {
			if(data.action == "InitReload") {
				const store = useTimelineStore();
				store.loadTimelines();
			}
			console.log("Unprompted C# Push:", data.action, data.payload);
		}
	});
}
