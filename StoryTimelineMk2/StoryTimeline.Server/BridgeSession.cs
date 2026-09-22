using System.Buffers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using StoryTimelineMk2.Bridge;

namespace StoryTimelineMk2.Server
{
    /// <summary>
    /// One open page, talking the same JSON the WebView2 bridge talks: <c>{ action, payload,
    /// messageId }</c> in, <c>{ messageId, payload }</c> back for a reply and <c>{ action,
    /// payload }</c> for an unprompted push. Only the pipe is different.
    /// </summary>
    internal sealed class BridgeSession
    {
        /// <summary>A page that sends more than this in one message is not one of ours.</summary>
        private const int MaxMessageBytes = 8 * 1024 * 1024;

        /// <summary>
        /// Outbound messages queue here instead of being written straight to the socket: a
        /// WebSocket allows one send at a time, and <see cref="IBridgeChannel.Post"/> is a
        /// fire-and-forget bool that handlers call from wherever they happen to be.
        /// </summary>
        private sealed class Outbox : IBridgeChannel
        {
            private readonly Channel<string> _queue =
                Channel.CreateUnbounded<string>(new UnboundedChannelOptions { SingleReader = true });

            public ChannelReader<string> Reader => _queue.Reader;

            public bool Post(object message)
            {
                string json;
                try
                {
                    json = JsonSerializer.Serialize(message);
                }
                catch (Exception ex)
                {
                    Logger.Error("Bridge/Serialize", ex);
                    return false;
                }
                // False once the page has gone: the hub drops the channel rather than retrying.
                return _queue.Writer.TryWrite(json);
            }

            public void Close() => _queue.Writer.TryComplete();
        }

        /// <summary>
        /// Runs one connection until the page closes it or <paramref name="cancel"/> fires.
        /// </summary>
        public static async Task RunAsync(WebSocket socket, CancellationToken cancel)
        {
            var outbox = new Outbox();
            var actions = new DataActions(outbox);
            BridgeHub.Register(outbox);

            Task pump = PumpAsync(socket, outbox, cancel);
            try
            {
                await ReceiveAsync(socket, actions, outbox, cancel);
            }
            catch (OperationCanceledException)
            {
                // The page navigated away or closed. Not an error.
            }
            catch (WebSocketException ex)
            {
                Logger.Warn("Bridge/Receive", ex.Message);
            }
            finally
            {
                BridgeHub.Unregister(outbox);
                outbox.Close();
                try { await pump; }
                catch (OperationCanceledException) { }
                catch (Exception ex) { Logger.Error("Bridge/Pump", ex); }
            }
        }

        /// <summary>Drains the outbox to the socket, one message at a time.</summary>
        private static async Task PumpAsync(WebSocket socket, Outbox outbox, CancellationToken cancel)
        {
            await foreach (string json in outbox.Reader.ReadAllAsync(cancel))
            {
                if (socket.State != WebSocketState.Open) break;
                await socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text,
                                       endOfMessage: true, cancel);
            }
        }

        private static async Task ReceiveAsync(WebSocket socket, DataActions actions, Outbox outbox,
                                               CancellationToken cancel)
        {
            byte[] buffer = ArrayPool<byte>.Shared.Rent(16 * 1024);
            try
            {
                while (socket.State == WebSocketState.Open && !cancel.IsCancellationRequested)
                {
                    string? json = await ReadMessageAsync(socket, buffer, cancel);
                    if (json == null) return;               // the page closed the connection
                    Dispatch(json, actions, outbox);
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }
        }

        /// <summary>Reassembles one logical message; null when the socket closed instead.</summary>
        private static async Task<string?> ReadMessageAsync(WebSocket socket, byte[] buffer,
                                                            CancellationToken cancel)
        {
            using var message = new MemoryStream();
            while (true)
            {
                ValueWebSocketReceiveResult result = await socket.ReceiveAsync(buffer.AsMemory(), cancel);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, cancel);
                    return null;
                }

                message.Write(buffer, 0, result.Count);
                if (message.Length > MaxMessageBytes)
                    throw new InvalidOperationException(
                        $"Bridge message exceeded {MaxMessageBytes} bytes; closing the connection.");

                if (result.EndOfMessage) break;
            }
            return Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
        }

        /// <summary>
        /// Same contract as the WinForms router: whatever happens, a request that carried a
        /// messageId gets an answer, because the page's promise is waiting on it.
        /// </summary>
        internal static void Dispatch(string json, DataActions actions, IBridgeChannel channel)
        {
            BridgeMessage? message;
            try
            {
                message = JsonSerializer.Deserialize<BridgeMessage>(json);
            }
            catch (Exception ex)
            {
                Logger.Error("Bridge/Parse", ex);
                Console.Error.WriteLine($"Could not parse a message from the page: {ex.Message}");
                return;
            }
            if (message == null) return;

            try
            {
                if (actions.TryHandle(message)) return;

                // Windows, file dialogs and the shell have no server equivalent yet (BL-68
                // phase 3). Answer rather than hang, and say which action it was.
                Logger.Warn("Bridge/Route", $"Action not available in the browser build: {message.Action}");
                Reply(channel, message, new
                {
                    status = "error",
                    message = $"'{message.Action}' is not available in the browser build yet.",
                });
            }
            catch (Exception ex)
            {
                Logger.Error($"Bridge/{message.Action}", ex);
                Console.Error.WriteLine($"Action '{message.Action}' failed: {ex}");
                Reply(channel, message, new
                {
                    status = "error",
                    message = ex.Message,
                    detail = ex.ToString(),
                });
            }
        }

        private static void Reply(IBridgeChannel channel, BridgeMessage message, object payload)
        {
            if (message.MessageId != null)
                channel.Post(new { messageId = message.MessageId, payload });
        }
    }
}
