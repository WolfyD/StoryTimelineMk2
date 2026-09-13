using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    /// <summary>
    /// Base class for all app windows. FormBorderStyle must be set to None by each
    /// derived form. Padding exposes a rim around WebView2 (DockStyle.Fill) so
    /// WM_NCHITTEST reaches this WndProc for resize handles. Title-bar drag is
    /// handled via a bridge call from Vue that invokes StartWindowDrag(). The top
    /// two corners are visually rounded via a clipping Region.
    /// </summary>
    public class BorderlessFormBase : Form
    {
        // ── Win32 hit-test / message codes ───────────────────────────────────
        private const int HTCLIENT      = 1;
        private const int HTCAPTION     = 2;
        private const int HTLEFT        = 10;
        private const int HTRIGHT       = 11;
        private const int HTTOP         = 12;
        private const int HTTOPLEFT     = 13;
        private const int HTTOPRIGHT    = 14;
        private const int HTBOTTOM      = 15;
        private const int HTBOTTOMLEFT  = 16;
        private const int HTBOTTOMRIGHT = 17;

        private const int WM_NCHITTEST       = 0x0084;
        private const int WM_NCLBUTTONDOWN   = 0x00A1;
        private const int WM_NCLBUTTONDBLCLK = 0x00A3;

        // ── Layout / visual constants ──────────────────────────────────────────
        public  const int TitleBarHeight    = 36;  // px — must match WindowTitleBar.vue
        private const int ResizeBorder      = 6;   // px — must equal Padding.Left/Right/Bottom
        private const int CornerGrip        = 16;  // px — wider corner detection zone along each edge
        private const int CornerRadiusTop   = 8;   // px — top-left and top-right rounding
        private const int CornerRadiusBot   = 5;   // px — slight bottom-corner rounding

        [System.ComponentModel.Browsable(false)]
        [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
        public bool IsFullscreenMode { get; set; } = false;

        // ── Fake-maximize state ───────────────────────────────────────────────
        // We never set WindowState = Maximized for the user-triggered maximize path
        // because WM_GETMINMAXINFO's ptMaxPosition needs physical screen coordinates
        // while Screen.WorkingArea returns DPI-scaled logical coordinates — on a 200%
        // secondary monitor this doubles the position offset and sends the window
        // off-screen.  Instead we track maximized state ourselves and set Bounds
        // directly, which is always consistent with Screen.WorkingArea.
        private bool      _isManuallyMaximized = false;
        private Rectangle _preMaximizeBounds;

        public bool IsManuallyMaximized => _isManuallyMaximized;

        // ── P/Invoke ──────────────────────────────────────────────────────────
        [DllImport("user32.dll")] private static extern bool ReleaseCapture();
        [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        public BorderlessFormBase()
        {
            // Top = 0: WebView2 sits flush with the top edge — no visible strip.
            // Left/Right/Bottom = ResizeBorder: expose a resize-grip rim on three sides.
            Padding = new Padding(ResizeBorder, 0, ResizeBorder, ResizeBorder);
            // Matches the Vue title-bar gradient start colour so the side/bottom rim
            // is invisible against the dark content.
            BackColor = Color.FromArgb(6, 12, 25);   // #060c19 — matches title bar top

            // Apply the embedded application icon to every window (taskbar, Alt-Tab, etc).
            // ExtractAssociatedIcon reads the Win32 icon resource set by <ApplicationIcon>
            // in the csproj, so swapping the .ico file is all that's needed for an update.
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { /* non-fatal — fall back to the default WinForms icon */ }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyRoundedRegion();
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            bool isMaximized = _isManuallyMaximized || WindowState == FormWindowState.Maximized;
            Padding = isMaximized
                ? new Padding(0)
                : new Padding(ResizeBorder, 0, ResizeBorder, ResizeBorder);
            ApplyRoundedRegion();
        }

        private void ApplyRoundedRegion()
        {
            if (Width <= 0 || Height <= 0) return;

            // No rounding when maximized — the window covers the entire work area
            // and clipping corners would leave transparent gaps at the screen edge.
            if (_isManuallyMaximized || WindowState == FormWindowState.Maximized)
            {
                Region = null;
                return;
            }

            int rt = CornerRadiusTop;
            int rb = CornerRadiusBot;
            using var path = new GraphicsPath();
            path.AddArc(0,              0,              rt * 2, rt * 2, 180, 90); // top-left
            path.AddArc(Width - rt * 2, 0,              rt * 2, rt * 2, 270, 90); // top-right
            path.AddArc(Width - rb * 2, Height - rb * 2, rb * 2, rb * 2, 0,   90); // bottom-right
            path.AddArc(0,              Height - rb * 2, rb * 2, rb * 2, 90,  90); // bottom-left
            path.CloseFigure();
            Region = new Region(path);
        }

        /// <summary>
        /// Called by the bridge when the Vue title bar detects a left-button drag.
        /// Releases WebView2's mouse capture and starts the native window-move loop.
        /// </summary>
        public void StartWindowDrag()
        {
            if (_isManuallyMaximized) return;
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
        }

        /// <summary>
        /// Maximises to the working area of the monitor under the cursor (user-initiated).
        /// Uses Bounds assignment instead of WindowState = Maximized to avoid the
        /// WM_GETMINMAXINFO DPI coordinate mismatch on non-primary monitors.
        /// </summary>
        public void MaximizeToCurrentScreen()
        {
            _preMaximizeBounds = Bounds;
            _isManuallyMaximized = true;
            Bounds = Screen.FromPoint(Cursor.Position).WorkingArea;
        }

        /// <summary>
        /// Maximises to the working area of the monitor that currently contains the
        /// window.  Used on session restore so the window maximises to the same screen
        /// it was on when the app was last closed (not where the cursor is now).
        /// </summary>
        public void MaximizeToWindowScreen()
        {
            _preMaximizeBounds = Bounds;
            _isManuallyMaximized = true;
            Bounds = Screen.FromHandle(Handle).WorkingArea;
        }

        /// <summary>Restores the window to its pre-maximize size and position.</summary>
        public void RestoreFromMaximize()
        {
            _isManuallyMaximized = false;
            Bounds = _preMaximizeBounds;
        }

        /// <summary>
        /// Returns the bounds to persist: pre-maximize bounds when fake-maximized,
        /// RestoreBounds when Windows-maximized, or current Bounds otherwise.
        /// </summary>
        public Rectangle GetRestoreBounds()
        {
            if (_isManuallyMaximized) return _preMaximizeBounds;
            if (WindowState == FormWindowState.Maximized) return RestoreBounds;
            return Bounds;
        }

        // ── Off-screen guard ─────────────────────────────────────────────────
        // Runs once, ~1 s after the window is first shown.  If the title-bar
        // strip is not visible on any connected screen (e.g. a monitor was
        // unplugged since the last session), the window is re-centred on the
        // primary screen so the user is not stranded with an invisible window.
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            var guard = new System.Windows.Forms.Timer { Interval = 1000 };
            guard.Tick += (_, _) =>
            {
                guard.Stop();
                guard.Dispose();
                if (IsDisposed || WindowState != FormWindowState.Normal || _isManuallyMaximized) return;
                EnsureOnScreen();
            };
            guard.Start();
        }

        private void EnsureOnScreen()
        {
            // Require the title-bar strip (full width × TitleBarHeight) to
            // intersect at least one screen's working area.
            var titleStrip = new Rectangle(Left, Top, Math.Max(Width, 1), TitleBarHeight);
            foreach (var screen in Screen.AllScreens)
            {
                if (screen.WorkingArea.IntersectsWith(titleStrip)) return;
            }

            // Title bar is off every screen — re-centre on the primary screen.
            var wa = Screen.PrimaryScreen!.WorkingArea;
            Size = new Size(
                Math.Min(Width,  wa.Width),
                Math.Min(Height, wa.Height)
            );
            Location = new Point(
                wa.Left + (wa.Width  - Width)  / 2,
                wa.Top  + (wa.Height - Height) / 2
            );
        }

        protected override void WndProc(ref Message m)
        {
            // StartWindowDrag() injects WM_NCLBUTTONDOWN/HTCAPTION to start a native
            // move-loop.  If the user double-clicks before the drag threshold fires,
            // Windows detects a dblclk on HTCAPTION and the default DefWindowProc
            // behaviour — when WS_MAXIMIZEBOX is absent (FormBorderStyle.None) — is
            // to minimise the window.  Suppress the message entirely: the Vue
            // @dblclick handler on the title bar already calls WindowMaximizeRestore
            // via BeginInvoke, so letting WndProc also act would cause a double-toggle.
            if (m.Msg == WM_NCLBUTTONDBLCLK && m.WParam.ToInt32() == HTCAPTION)
            {
                m.Result = IntPtr.Zero;
                return;
            }

            if (m.Msg == WM_NCHITTEST)
            {
                int screenX = unchecked((short)(m.LParam.ToInt32() & 0xFFFF));
                int screenY = unchecked((short)((m.LParam.ToInt32() >> 16) & 0xFFFF));
                var pt = PointToClient(new Point(screenX, screenY));

                // No resize grips when maximized (Windows-maximized or fake-maximized).
                if (WindowState != FormWindowState.Maximized && !_isManuallyMaximized)
                {
                    bool top    = pt.Y < ResizeBorder;
                    bool bottom = pt.Y > ClientSize.Height - ResizeBorder;
                    bool left   = pt.X < ResizeBorder;
                    bool right  = pt.X > ClientSize.Width - ResizeBorder;

                    // Wider zone along each edge so corner grabs are easier to hit
                    bool nearLeft  = pt.X < CornerGrip;
                    bool nearRight = pt.X > ClientSize.Width - CornerGrip;

                    if (top    && nearLeft)  { m.Result = (IntPtr)HTTOPLEFT;     return; }
                    if (top    && nearRight) { m.Result = (IntPtr)HTTOPRIGHT;    return; }
                    if (bottom && nearLeft)  { m.Result = (IntPtr)HTBOTTOMLEFT;  return; }
                    if (bottom && nearRight) { m.Result = (IntPtr)HTBOTTOMRIGHT; return; }
                    if (top)                 { m.Result = (IntPtr)HTTOP;         return; }
                    if (bottom)              { m.Result = (IntPtr)HTBOTTOM;      return; }
                    if (left)                { m.Result = (IntPtr)HTLEFT;        return; }
                    if (right)               { m.Result = (IntPtr)HTRIGHT;       return; }
                }

                m.Result = (IntPtr)HTCLIENT;
                return;
            }

            base.WndProc(ref m);
        }
    }
}
