namespace StoryTimelineMk2.Forms
{
    partial class f_Calendar
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_Calendar = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_Calendar).BeginInit();
            SuspendLayout();

            wv_Calendar.AllowExternalDrop = true;
            wv_Calendar.CreationProperties = null;
            wv_Calendar.BackColor = Color.FromArgb(15, 23, 42);
            wv_Calendar.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_Calendar.Dock = DockStyle.Fill;
            wv_Calendar.Location = new Point(0, 0);
            wv_Calendar.Name = "wv_Calendar";
            wv_Calendar.Size = new Size(1060, 820);
            wv_Calendar.TabIndex = 0;
            wv_Calendar.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(1060, 820);
            Controls.Add(wv_Calendar);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_Calendar";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Calendar Editor";

            ((System.ComponentModel.ISupportInitialize)wv_Calendar).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_Calendar;
    }
}
