namespace StoryTimelineMk2.Forms
{
    partial class f_AddEditItem
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
            wv_AddEditItem = new Microsoft.Web.WebView2.WinForms.WebView2();
            ((System.ComponentModel.ISupportInitialize)wv_AddEditItem).BeginInit();
            SuspendLayout();
            // 
            // wv_AddEditItem
            // 
            wv_AddEditItem.AllowExternalDrop = true;
            wv_AddEditItem.CreationProperties = null;
            wv_AddEditItem.DefaultBackgroundColor = Color.White;
            wv_AddEditItem.Dock = DockStyle.Fill;
            wv_AddEditItem.Location = new Point(0, 0);
            wv_AddEditItem.Name = "wv_AddEditItem";
            wv_AddEditItem.Size = new Size(940, 1100);
            wv_AddEditItem.TabIndex = 0;
            wv_AddEditItem.ZoomFactor = 1D;
            //
            // AddEditItem
            //
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new Size(940, 1100);
            Controls.Add(wv_AddEditItem);
            Name = "AddEditItem";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "Edit Item";
            ((System.ComponentModel.ISupportInitialize)wv_AddEditItem).EndInit();
            ResumeLayout(false);
        }

        #endregion

        private Microsoft.Web.WebView2.WinForms.WebView2 wv_AddEditItem;
    }
}