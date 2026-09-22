using System.Net;
using Microsoft.Extensions.FileProviders;

namespace StoryTimelineMk2.Server
{
    /// <summary>
    /// The whole web host: the built SPA, the media folder, and the /bridge socket that carries
    /// the same messages WebView2 carries on Windows.
    /// </summary>
    internal static class ServerApp
    {
        /// <summary>
        /// Builds the host without starting it, so tests can bind port 0 and read back the port.
        /// </summary>
        /// <exception cref="DirectoryNotFoundException">The SPA has not been built.</exception>
        public static WebApplication Build(ServerOptions options, string baseDirectory)
        {
            string spaRoot = options.ResolveSpaRoot(baseDirectory);

            var builder = WebApplication.CreateBuilder();
            // Loopback only. That is the entire security model for BL-68: nothing off this
            // machine can reach the bridge, so the bridge needs no login of its own.
            builder.WebHost.ConfigureKestrel(k =>
            {
                k.Listen(IPAddress.Loopback, options.Port);
                // Uploads are whole databases, not form fields; the 30 MB default refuses them.
                k.Limits.MaxRequestBodySize = FileEndpoints.MaxUploadBytes;
            });
            builder.Logging.ClearProviders();

            var app = builder.Build();
            app.UseWebSockets();
            FileEndpoints.ResetUploadFolder();

            var spaFiles = new PhysicalFileProvider(spaRoot);
            app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spaFiles });
            app.UseStaticFiles(new StaticFileOptions { FileProvider = spaFiles });

            // https://media.app/<path> in the WebView2 host is /media/<path> here; see
            // Frontend/src/utils/mediaUrl.ts. Unknown types are served because users drop in
            // whatever their image editor produced.
            string mediaRoot = AppConfig.Instance.GetMediaFolder();
            Directory.CreateDirectory(mediaRoot);
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(mediaRoot),
                RequestPath = "/media",
                ServeUnknownFileTypes = true,
            });

            app.Map("/bridge", async (HttpContext context, IHostApplicationLifetime lifetime) =>
            {
                if (!context.WebSockets.IsWebSocketRequest)
                {
                    context.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await context.Response.WriteAsync("The bridge speaks WebSocket only.");
                    return;
                }

                using var socket = await context.WebSockets.AcceptWebSocketAsync();

                // ApplicationStopping as well as RequestAborted: a socket is an in-flight request
                // that ends only when the page closes it, and RequestAborted never fires on
                // shutdown. Without this, Ctrl+C waits out the host's 30s shutdown timeout for
                // every open tab, which reads as "Ctrl+C does nothing".
                using var stopping = CancellationTokenSource.CreateLinkedTokenSource(
                    context.RequestAborted, lifetime.ApplicationStopping);

                await BridgeSession.RunAsync(socket, stopping.Token);
            });

            // The browser's stand-in for the file dialogs: /upload in, /export out.
            FileEndpoints.Map(app);

            return app;
        }
    }
}
