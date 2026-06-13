# Bridge API Reference

The bridge is the JSON message channel between the Vue frontend (running inside WebView2) and the C# backend. All cross-process communication goes through this channel.

## Message format

### Vue → C# (request)

```json
{
    "action": "ActionName",
    "payload": { },
    "messageId": 7
}
```

`messageId` is an incrementing integer managed by `BackendAPI` in `Frontend/src/bridge/api.ts`. It is included whenever the caller expects a reply.

### C# → Vue (reply)

```json
{
    "messageId": 7,
    "payload": { }
}
```

The `messageId` matches the request so Vue can resolve the correct `Promise`.

### C# → Vue (push, no request)

```json
{
    "action": "ActionName",
    "payload": { }
}
```

Unprompted pushes have an `action` field but no `messageId`. The Vue listener dispatches these to named handlers (currently only `InitReload` is handled).

## Actions

### `GetAllTimelines`

Fetch all timeline project summaries.

**Payload:** `{ args: [] }`

**Reply payload:** `{ status: "ok", data: TimelineInfo[] }`

---

### `GetTimelineData`

Fetch a complete timeline aggregate (project + items + notes) for a given id.

**Payload:** `{ id: number }`

**Reply payload:** `FullTimelineProject` object

```json
{
    "Project": { },
    "Items": [],
    "Notes": []
}
```

---

### `GetTimelineItems`

Fetch only the items for a timeline. Lighter alternative to `GetTimelineData`.

**Payload:** `{ timelineId: number }`

**Reply payload:** `TimelineItem[]`

---

### `CreateProject`

Create a new timeline project and return its database id.

**Payload:** `{ title: string }`

**Reply payload:** `number` (new timeline id), or `-1` on failure

---

### `OpenTimeline`

Open the `f_Timeline` window for a specific timeline and hide `f_Main`.

**Payload:** `{ id: number }`

**Reply:** none (fire and forget)

---

### `ImportDB`

Open a file picker for the user to select an existing `.sqlite` file and import it. Emits an `InitReload` push after completion.

**Payload:** `{ args: [] }`

**Reply payload:** `{ status: "ok" }`

---

### `OpenAddEditItemWindow`

Show the `f_AddEditItem` modal dialog for a given item type.

**Payload:** `{ type: number }`

**Reply payload:** `{ status: "ok" | "cancel" | "error" }`

---

### `OpenSettings`

*(Stub — not yet implemented)*

---

## TypeScript helpers

`Frontend/src/bridge/api.ts` exposes the `BackendAPI` object. The two core primitives are:

```ts
// Fire and forget
BackendAPI.send("ActionName", payload)

// Request with reply
const result = await BackendAPI.request<ReturnType>("ActionName", payload)
```

Convenience wrappers for each supported action are defined as named methods on `BackendAPI`:

```ts
BackendAPI.GetAllTimelines()
BackendAPI.LoadTimelineData(id)
BackendAPI.CreateNewProject(title)
BackendAPI.OpenTimeline(id)
BackendAPI.ImportDatabase()
```

## C# helper methods

`MessageRouter` provides two helpers for sending data to Vue:

```csharp
// Reply to a specific request
private void ReplyToVue(int? messageId, object payload)

// Push an unprompted message
public void SendToVue(string action, object payload)
```

Both serialize `payload` with `System.Text.Json` and call `CoreWebView2.PostWebMessageAsJson()`.
