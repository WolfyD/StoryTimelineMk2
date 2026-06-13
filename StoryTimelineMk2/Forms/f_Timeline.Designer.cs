namespace StoryTimelineMk2.Forms
{
    partial class f_Timeline
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            wv_Timeline = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_Timeline).BeginInit();
            SuspendLayout();
            // 
            // wv_Timeline
            // 
            wv_Timeline.AllowExternalDrop = true;
            wv_Timeline.CreationProperties = null;
            wv_Timeline.DefaultBackgroundColor = Color.White;
            wv_Timeline.Dock = DockStyle.Fill;
            wv_Timeline.Location = new Point(0, 0);
            wv_Timeline.Name = "wv_Timeline";
            wv_Timeline.Size = new Size(982, 623);
            wv_Timeline.TabIndex = 0;
            wv_Timeline.ZoomFactor = 1D;
            // 
            // f_Timeline
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(982, 623);
            Controls.Add(wv_Timeline);
            Name = "f_Timeline";
            Text = "f_Timeline";
            ((System.ComponentModel.ISupportInitialize)wv_Timeline).EndInit();
            ResumeLayout(false);
        }

        #endregion

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_Timeline;
    }
}