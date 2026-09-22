using Microsoft.Web.WebView2.Core;
using System;
using System.Text.Json;
using System.Windows.Forms;

namespace StoryTimelineMk2.Bridge
{
    /// <summary>
    /// One WebView2 page as a bridge channel. Serialization lives here rather than in the hub
    /// because the wire format belongs to the transport — WebView2 takes a JSON string, the
    /// local server (BL-68) will take bytes — while the JSON shape must stay identical.
    /// </summary>
    internal sealed class WebViewChannel : IBridgeChannel
    {
        private readonly CoreWebView2 _webView;
        private readonly Control? _ui;

        public WebViewChannel(CoreWebView2 webView, Control? ui = null)
        {
            _webView = webView;
            _ui = ui;
        }

        /// <summary>
        /// Once the WebView2 control is disposed (browser process killed, window torn down)
        /// posting throws InvalidOperationException, and a caller like f_Timeline's FormClosing
        /// must not die on it — there is simply nobody left to tell, so log it and report failure.
        /// </summary>
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

            // Replies run on the UI thread already; achievement broadcasts come off a Task.Run,
            // and PostWebMessageAsJson is UI-thread only.
            var ui = _ui ?? (Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null);
            if (ui is { IsDisposed: false, IsHandleCreated: true } && ui.InvokeRequired)
            {
                try
                {
                    ui.BeginInvoke((MethodInvoker)(() => PostCore(json)));
                    return true;
                }
                catch (Exception ex)
                {
                    Logger.Error("Bridge/Post", ex);
                    return false;
                }
            }

            return PostCore(json);
        }

        private bool PostCore(string json)
        {
            try
            {
                _webView.PostWebMessageAsJson(json);
                return true;
            }
            catch (Exception ex)
            {
                Logger.Error("Bridge/Post", ex);
                return false;
            }
        }
    }
}
