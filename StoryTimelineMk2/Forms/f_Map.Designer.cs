namespace StoryTimelineMk2.Forms
{
    partial class f_Map
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_Map = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_Map).BeginInit();
            SuspendLayout();

            wv_Map.AllowExternalDrop = true;
            wv_Map.CreationProperties = null;
            wv_Map.BackColor = Color.FromArgb(15, 23, 42);
            wv_Map.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_Map.Dock = DockStyle.Fill;
            wv_Map.Location = new Point(0, 0);
            wv_Map.Name = "wv_Map";
            wv_Map.Size = new Size(1280, 860);
            wv_Map.TabIndex = 0;
            wv_Map.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1280, 860);
            Controls.Add(wv_Map);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_Map";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Map";

            ((System.ComponentModel.ISupportInitialize)wv_Map).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_Map;
    }
}
