using System.Windows.Forms;

namespace StoryTimelineMk2.Forms
{
    public partial class f_splash : Form
    {
        public f_splash()
        {
            InitializeComponent();
            Opacity = 0;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            _ = AnimateOpacityAsync(0, 1, 380);
        }

        public Task FadeOutAsync() => AnimateOpacityAsync(Opacity, 0, 280);

        private Task AnimateOpacityAsync(double from, double to, int durationMs)
        {
            var tcs = new TaskCompletionSource();
            const int intervalMs = 16; // ~60 fps
            int steps = Math.Max(1, durationMs / intervalMs);
            double delta = (to - from) / steps;
            int tick = 0;
            Opacity = from;

            var timer = new System.Windows.Forms.Timer { Interval = intervalMs };
            timer.Tick += (_, _) =>
            {
                tick++;
                Opacity = Math.Clamp(from + delta * tick, 0.0, 1.0);
                if (tick >= steps)
                {
                    Opacity = to;
                    timer.Stop();
                    timer.Dispose();
                    tcs.SetResult();
                }
            };
            timer.Start();
            return tcs.Task;
        }
    }
}
