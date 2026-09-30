namespace StoryTimelineMk2.Forms
{
    partial class f_MapCast
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_MapCast = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_MapCast).BeginInit();
            SuspendLayout();

            wv_MapCast.AllowExternalDrop = false;
            wv_MapCast.CreationProperties = null;
            wv_MapCast.BackColor = Color.FromArgb(15, 23, 42);
            wv_MapCast.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_MapCast.Dock = DockStyle.Fill;
            wv_MapCast.Location = new Point(0, 0);
            wv_MapCast.Name = "wv_MapCast";
            wv_MapCast.Size = new Size(380, 760);
            wv_MapCast.TabIndex = 0;
            wv_MapCast.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(380, 760);
            Controls.Add(wv_MapCast);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_MapCast";
            StartPosition = FormStartPosition.Manual;
            Text = "Who is where";

            ((System.ComponentModel.ISupportInitialize)wv_MapCast).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_MapCast;
    }
}
