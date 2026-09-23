namespace StoryTimelineMk2.Forms
{
    partial class f_Characters
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_Characters = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_Characters).BeginInit();
            SuspendLayout();

            wv_Characters.AllowExternalDrop = true;
            wv_Characters.CreationProperties = null;
            wv_Characters.BackColor = Color.FromArgb(15, 23, 42);
            wv_Characters.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_Characters.Dock = DockStyle.Fill;
            wv_Characters.Location = new Point(0, 0);
            wv_Characters.Name = "wv_Characters";
            wv_Characters.Size = new Size(1180, 840);
            wv_Characters.TabIndex = 0;
            wv_Characters.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1180, 840);
            Controls.Add(wv_Characters);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_Characters";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Characters";

            ((System.ComponentModel.ISupportInitialize)wv_Characters).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_Characters;
    }
}
