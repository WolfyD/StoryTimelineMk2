namespace StoryTimelineMk2.Forms
{
    partial class f_Archive
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_Archive = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_Archive).BeginInit();
            SuspendLayout();

            wv_Archive.AllowExternalDrop = false;
            wv_Archive.CreationProperties = null;
            wv_Archive.BackColor = Color.FromArgb(15, 23, 42);
            wv_Archive.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_Archive.Dock = DockStyle.Fill;
            wv_Archive.Location = new Point(0, 0);
            wv_Archive.Name = "wv_Archive";
            wv_Archive.Size = new Size(960, 760);
            wv_Archive.TabIndex = 0;
            wv_Archive.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(960, 760);
            Controls.Add(wv_Archive);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_Archive";
            StartPosition = FormStartPosition.Manual;
            Text = "Archive";

            ((System.ComponentModel.ISupportInitialize)wv_Archive).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_Archive;
    }
}
