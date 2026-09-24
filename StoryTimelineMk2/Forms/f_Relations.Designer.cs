namespace StoryTimelineMk2.Forms
{
    partial class f_Relations
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_Relations = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_Relations).BeginInit();
            SuspendLayout();

            wv_Relations.AllowExternalDrop = true;
            wv_Relations.CreationProperties = null;
            wv_Relations.BackColor = Color.FromArgb(15, 23, 42);
            wv_Relations.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_Relations.Dock = DockStyle.Fill;
            wv_Relations.Location = new Point(0, 0);
            wv_Relations.Name = "wv_Relations";
            wv_Relations.Size = new Size(1280, 860);
            wv_Relations.TabIndex = 0;
            wv_Relations.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1280, 860);
            Controls.Add(wv_Relations);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_Relations";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Relations";

            ((System.ComponentModel.ISupportInitialize)wv_Relations).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_Relations;
    }
}
