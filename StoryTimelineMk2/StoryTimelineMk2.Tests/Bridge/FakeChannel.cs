using System.Text.Json;
using StoryTimelineMk2.Bridge;

namespace StoryTimelineMk2.Tests.Bridge;

/// <summary>
/// A bridge channel that keeps what was posted instead of sending it to a page. Serializing
/// for real is deliberate: it is the same <see cref="JsonSerializer"/> call the WebView2 channel
/// makes, so a DTO the page could not read fails here too.
/// </summary>
internal sealed class FakeChannel : IBridgeChannel
{
    public readonly List<JsonElement> Posted = new();

    /// <summary>What <see cref="Post"/> reports back — false means "this page is gone".</summary>
    public bool Reachable { get; set; } = true;

    /// <summary>When set, <see cref="Post"/> throws instead of delivering.</summary>
    public bool Throws { get; set; }

    public bool Post(object message)
    {
        if (Throws) throw new InvalidOperationException("the page is gone");
        Posted.Add(JsonSerializer.SerializeToElement(message));
        return Reachable;
    }

    public JsonElement Last => Posted[^1];
    public JsonElement LastPayload => Last.GetProperty("payload");
}
