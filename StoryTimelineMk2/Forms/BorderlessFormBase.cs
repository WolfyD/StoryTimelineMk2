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

        private const int WM_NCHITTEST     = 0x0084;
        private const int WM_NCLBUTTONDOWN = 0x00A1;
        private const int WM_GETMINMAXINFO = 0x0024;

        // ── Layout / visual constants ──────────────────────────────────────────
        public  const int TitleBarHeight    = 36;  // px — must match WindowTitleBar.vue
        private const int ResizeBorder      = 6;   // px — must equal Padding.Left/Right/Bottom
        private const int CornerGrip        = 16;  // px — wider corner detection zone along each edge
        private const int CornerRadiusTop   = 8;   // px — top-left and top-right rounding
        private const int CornerRadiusBot   = 5;   // px — slight bottom-corner rounding

        [System.ComponentModel.Browsable(false)]
        [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
        public bool IsFullscreenMode { get; set; } = false;

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
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyRoundedRegion();
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            Padding = WindowState == FormWindowState.Maximized
                ? new Padding(0)
                : new Padding(ResizeBorder, 0, ResizeBorder, ResizeBorder);
            ApplyRoundedRegion();
        }

        private void ApplyRoundedRegion()
        {
            if (Width <= 0 || Height <= 0) return;

            // No rounding when maximized — the window covers the entire work area
            // and clipping corners would leave transparent gaps at the screen edge.
            if (WindowState == FormWindowState.Maximized)
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
            ReleaseCapture();
            SendMessage(Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
        }

        // ── MINMAXINFO ────────────────────────────────────────────────────────
        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int X, Y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct MINMAXINFO
        {
            public POINT ptReserved;
            public POINT ptMaxSize;
            public POINT ptMaxPosition;
            public POINT ptMinTrackSize;
            public POINT ptMaxTrackSize;
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_GETMINMAXINFO && !IsFullscreenMode)
            {
                var info = Marshal.PtrToStructure<MINMAXINFO>(m.LParam);
                var area = Screen.FromHandle(Handle).WorkingArea;
                info.ptMaxPosition = new POINT { X = area.Left, Y = area.Top };
                info.ptMaxSize     = new POINT { X = area.Width, Y = area.Height };
                Marshal.StructureToPtr(info, m.LParam, false);
                m.Result = IntPtr.Zero;
                return;
            }

            if (m.Msg == WM_NCHITTEST)
            {
                int screenX = unchecked((short)(m.LParam.ToInt32() & 0xFFFF));
                int screenY = unchecked((short)((m.LParam.ToInt32() >> 16) & 0xFFFF));
                var pt = PointToClient(new Point(screenX, screenY));

                if (WindowState != FormWindowState.Maximized)
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
