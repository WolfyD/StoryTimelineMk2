using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using StoryTimelineMk2.Bridge;
using StoryTimelineMk2.Server;
using StoryTimelineMk2.Tests.Database;

namespace StoryTimelineMk2.Tests.Web;

/// <summary>
/// The browser build end to end: a real Kestrel on a real socket, a real WebSocket client, and
/// the same DataActions the WinForms host uses. If this passes, a page can talk to the server.
/// </summary>
[Collection("Database")]
public class BridgeServerTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task DataActionsAnswerOverTheSocket()
    {
        await using var server = await TestServer.StartAsync();
        using var page = await server.ConnectAsync();

        await page.SendAsync("CreateProject", new { title = "Browser build", author = "Tester" }, 1);
        JsonElement created = await page.ReceiveAsync();
        Assert.Equal(1, created.GetProperty("messageId").GetInt32());
        Assert.True(created.GetProperty("payload").GetInt32() > 0);

        await page.SendAsync("GetAllTimelines", new { args = Array.Empty<string>() }, 2);
        JsonElement all = await page.ReceiveAsync();
        Assert.Equal(2, all.GetProperty("messageId").GetInt32());
        Assert.Contains("Browser build", all.GetRawText());
    }

    [Fact]
    public async Task HostActionsComeBackAsAnErrorRatherThanSilence()
    {
        await using var server = await TestServer.StartAsync();
        using var page = await server.ConnectAsync();

        // Windows and dialogs are still WinForms-only (BL-68 phase 3). The page's promise must
        // be rejected, not left to time out after 30s.
        await page.SendAsync("OpenAddEditItemWindow", new { timelineId = 1 }, 9);

        JsonElement reply = await page.ReceiveAsync();
        Assert.Equal(9, reply.GetProperty("messageId").GetInt32());
        Assert.Equal("error", reply.GetProperty("payload").GetProperty("status").GetString());
        Assert.Contains("OpenAddEditItemWindow", reply.GetProperty("payload").GetProperty("message").GetString());
    }

    [Fact]
    public async Task AFailedActionReportsTheFailureWithItsStackTrace()
    {
        await using var server = await TestServer.StartAsync();
        using var page = await server.ConnectAsync();

        // No 'key' property: the handler throws, and the page still has to hear about it.
        await page.SendAsync("GetMiscSetting", new { }, 4);

        JsonElement reply = await page.ReceiveAsync();
        Assert.Equal("error", reply.GetProperty("payload").GetProperty("status").GetString());
        Assert.NotEmpty(reply.GetProperty("payload").GetProperty("detail").GetString()!);
    }

    [Fact]
    public async Task AnOpenPageReceivesBroadcasts()
    {
        await using var server = await TestServer.StartAsync();
        using var page = await server.ConnectAsync();

        // Round-trip one request first: that proves the session (and its channel) is registered.
        await page.SendAsync("GetAllTimelines", new { args = Array.Empty<string>() }, 1);
        await page.ReceiveAsync();

        Assert.Equal(1, BridgeHub.Broadcast("AchievementUnlocked", new { key = "first_timeline" }));

        JsonElement push = await page.ReceiveAsync();
        Assert.Equal("AchievementUnlocked", push.GetProperty("action").GetString());
        Assert.Equal("first_timeline", push.GetProperty("payload").GetProperty("key").GetString());
    }

    [Fact]
    public async Task AnOpenPageDoesNotHoldUpShutdown()
    {
        var server = await TestServer.StartAsync();
        // Deliberately left open: this is a user who hits Ctrl+C with a tab still on screen.
        using var page = await server.ConnectAsync();
        await page.SendAsync("GetAllTimelines", new { args = Array.Empty<string>() }, 1);
        await page.ReceiveAsync();

        var elapsed = Stopwatch.StartNew();
        await server.DisposeAsync();
        elapsed.Stop();

        // Before the linked ApplicationStopping token, the socket kept the request in flight and
        // this took the host's full 30s shutdown timeout — Ctrl+C looked dead.
        Assert.True(elapsed.Elapsed < TimeSpan.FromSeconds(5),
            $"shutdown with an open page took {elapsed.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task TheSpaAndTheMediaFolderAreServed()
    {
        await using var server = await TestServer.StartAsync();
        using var http = new HttpClient { BaseAddress = new Uri(server.Url) };

        Assert.Contains("story timeline test spa", await http.GetStringAsync("/"));
        Assert.Contains("story timeline test spa", await http.GetStringAsync("/index.html"));
        // https://media.app/<path> in WebView2; /media/<path> here. See utils/mediaUrl.ts.
        Assert.Equal("pixels", await http.GetStringAsync("/media/pic.bin"));
    }

    [Fact]
    public async Task TheBridgeEndpointRefusesPlainHttp()
    {
        await using var server = await TestServer.StartAsync();
        using var http = new HttpClient { BaseAddress = new Uri(server.Url) };

        HttpResponseMessage response = await http.GetAsync("/bridge");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ── The browser's file dialogs (BL-68 phase 3) ─────────────────────────────

    [Fact]
    public async Task AnUploadComesBackAsAPathTheImportActionsCanRead()
    {
        await using var server = await TestServer.StartAsync();
        using var http = new HttpClient { BaseAddress = new Uri(server.Url) };

        var response = await http.PostAsync("/upload?name=my%20backup.sqlite",
            new ByteArrayContent("a database"u8.ToArray()));
        response.EnsureSuccessStatusCode();

        JsonElement body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        string path = body.GetProperty("path").GetString()!;

        // The page never sees a real path, so this one has to be readable by the import action.
        Assert.Equal("a database", File.ReadAllText(path));
        Assert.Equal(".sqlite", Path.GetExtension(path));
        // The user's name is kept only for display; the file on disk gets a fresh one.
        Assert.Equal("my backup.sqlite", body.GetProperty("name").GetString());
        Assert.NotEqual("my backup.sqlite", Path.GetFileName(path));
    }

    [Fact]
    public async Task AnUploadWithoutANameIsRefused()
    {
        await using var server = await TestServer.StartAsync();
        using var http = new HttpClient { BaseAddress = new Uri(server.Url) };

        var response = await http.PostAsync("/upload", new ByteArrayContent("bytes"u8.ToArray()));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AnExportComesBackAsAFileTheBrowserCanSave()
    {
        await using var server = await TestServer.StartAsync();
        using var http = new HttpClient { BaseAddress = new Uri(server.Url) };

        var response = await http.PostAsJsonAsync("/export", new { action = "ExportFullDB", payload = new { } });
        response.EnsureSuccessStatusCode();

        // The page reads the file name from this header rather than parsing Content-Disposition.
        string name = Uri.UnescapeDataString(response.Headers.GetValues("X-Export-Filename").Single());
        Assert.EndsWith(".sqlite", name);
        Assert.StartsWith("SQLite format 3", Encoding.UTF8.GetString(await response.Content.ReadAsByteArrayAsync())[..15]);
    }

    [Fact]
    public async Task OnlyTheExportActionsAreAcceptedAtTheExportEndpoint()
    {
        await using var server = await TestServer.StartAsync();
        using var http = new HttpClient { BaseAddress = new Uri(server.Url) };

        // A data action would leak whatever it returns as a download; the endpoint is not a bridge.
        var response = await http.PostAsJsonAsync("/export", new { action = "GetAllTimelines", payload = new { } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("GetAllTimelines", await response.Content.ReadAsStringAsync());
    }

    /// <summary>A real server on a free loopback port, with a temp SPA and media folder.</summary>
    private sealed class TestServer : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private readonly DbTestContext _db;

        public string Url { get; }

        private TestServer(WebApplication app, DbTestContext db, string url)
        {
            _app = app;
            _db = db;
            Url = url;
        }

        public static async Task<TestServer> StartAsync()
        {
            var db = new DbTestContext();

            string spa = Path.Combine(db.TempDir, "spa");
            Directory.CreateDirectory(spa);
            File.WriteAllText(Path.Combine(spa, "index.html"), "<!doctype html>story timeline test spa");

            string media = AppConfig.Instance.GetMediaFolder();
            Directory.CreateDirectory(media);
            File.WriteAllText(Path.Combine(media, "pic.bin"), "pixels");

            // Port 0: the OS picks a free one, so parallel runs and a running app can't collide.
            var app = ServerApp.Build(ServerOptions.Parse(["--port", "0", "--spa", spa]), db.TempDir);
            await app.StartAsync();

            return new TestServer(app, db, app.Urls.First());
        }

        public async Task<Page> ConnectAsync()
        {
            var socket = new ClientWebSocket();
            var uri = new Uri(Url.Replace("http://", "ws://") + "/bridge");
            using var cts = new CancellationTokenSource(Timeout);
            await socket.ConnectAsync(uri, cts.Token);
            return new Page(socket);
        }

        public async ValueTask DisposeAsync()
        {
            await _app.StopAsync();
            await _app.DisposeAsync();
            _db.Dispose();
        }
    }

    /// <summary>Stands in for an open browser tab.</summary>
    private sealed class Page : IDisposable
    {
        private readonly ClientWebSocket _socket;

        public Page(ClientWebSocket socket) => _socket = socket;

        public async Task SendAsync(string action, object payload, int messageId)
        {
            byte[] json = JsonSerializer.SerializeToUtf8Bytes(new { action, payload, messageId });
            using var cts = new CancellationTokenSource(Timeout);
            await _socket.SendAsync(json, WebSocketMessageType.Text, true, cts.Token);
        }

        public async Task<JsonElement> ReceiveAsync()
        {
            var buffer = new byte[64 * 1024];
            using var cts = new CancellationTokenSource(Timeout);
            var received = new MemoryStream();
            while (true)
            {
                WebSocketReceiveResult result = await _socket.ReceiveAsync(buffer, cts.Token);
                received.Write(buffer, 0, result.Count);
                if (result.EndOfMessage) break;
            }
            return JsonSerializer.Deserialize<JsonElement>(
                Encoding.UTF8.GetString(received.GetBuffer(), 0, (int)received.Length));
        }

        public void Dispose() => _socket.Dispose();
    }
}
