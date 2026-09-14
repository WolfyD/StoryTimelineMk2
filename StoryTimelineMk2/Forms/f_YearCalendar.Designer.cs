namespace StoryTimelineMk2.Forms
{
    partial class f_YearCalendar
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null)) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            wv_YearCalendar = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_YearCalendar).BeginInit();
            SuspendLayout();

            wv_YearCalendar.AllowExternalDrop = true;
            wv_YearCalendar.CreationProperties = null;
            wv_YearCalendar.BackColor = Color.FromArgb(15, 23, 42);
            wv_YearCalendar.DefaultBackgroundColor = Color.FromArgb(15, 23, 42);
            wv_YearCalendar.Dock = DockStyle.Fill;
            wv_YearCalendar.Location = new Point(0, 0);
            wv_YearCalendar.Name = "wv_YearCalendar";
            wv_YearCalendar.Size = new Size(720, 640);
            wv_YearCalendar.TabIndex = 0;
            wv_YearCalendar.ZoomFactor = 1D;

            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(720, 640);
            Controls.Add(wv_YearCalendar);
            BackColor = Color.FromArgb(15, 23, 42);
            Name = "f_YearCalendar";
            StartPosition = FormStartPosition.Manual;
            Text = "Year Calendar";

            ((System.ComponentModel.ISupportInitialize)wv_YearCalendar).EndInit();
            ResumeLayout(false);
        }

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_YearCalendar;
    }
}
