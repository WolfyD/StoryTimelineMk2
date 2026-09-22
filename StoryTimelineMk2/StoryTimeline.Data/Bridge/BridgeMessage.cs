using System.Text.Json;
using System.Text.Json.Serialization;

namespace StoryTimelineMk2.Bridge
{
    internal class BridgeMessage
    {
        [JsonPropertyName("action")]
        public string Action { get; set; } = string.Empty;

        [JsonPropertyName("payload")]
        public JsonElement Payload { get; set; }

        [JsonPropertyName("messageId")]
        public int? MessageId { get; set; } // The ID from Vue
    }
}
