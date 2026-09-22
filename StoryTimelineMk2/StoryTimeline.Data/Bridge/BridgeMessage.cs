using System.Text.Json;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2.Bridge
{
    /// <summary>One message from the page: an action name, its payload, and the id the
    /// page correlates the reply with. Public because a host in another assembly
    /// (the local server, BL-68) has to construct and dispatch these.</summary>
    public class BridgeMessage
    {
        [JsonPropertyName("action")]
        public string Action { get; set; } = string.Empty;

        [JsonPropertyName("payload")]
        public JsonElement Payload { get; set; }

        [JsonPropertyName("messageId")]
        public int? MessageId { get; set; } // The ID from Vue
    }
}
