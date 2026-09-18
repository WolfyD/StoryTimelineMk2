namespace StoryTimelineMk2.Forms
{
    partial class f_splash
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
            pictureBox1 = new PictureBox();
            lbl_Title = new Label();
            ((System.ComponentModel.ISupportInitialize)pictureBox1).BeginInit();
            SuspendLayout();
            // 
            // pictureBox1
            // 
            pictureBox1.Image = Properties.Resources.splash_smol;
            pictureBox1.Location = new Point(-202, -75);
            pictureBox1.Name = "pictureBox1";
            pictureBox1.Size = new Size(705, 819);
            pictureBox1.SizeMode = PictureBoxSizeMode.Zoom;
            pictureBox1.TabIndex = 0;
            pictureBox1.TabStop = false;
            // 
            // lbl_Title
            // 
            lbl_Title.AutoSize = true;
            lbl_Title.BackColor = Color.Transparent;
            lbl_Title.FlatStyle = FlatStyle.Flat;
            lbl_Title.ForeColor = SystemColors.ActiveCaption;
            lbl_Title.ImageAlign = ContentAlignment.TopLeft;
            lbl_Title.Location = new Point(357, 584);
            lbl_Title.Name = "lbl_Title";
            lbl_Title.Size = new Size(146, 15);
            lbl_Title.TabIndex = 1;
            lbl_Title.Text = "Art by: Dergderg Dorgness";
            // 
            // f_splash
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            BackColor = Color.FromArgb(15, 23, 42);
            BackgroundImageLayout = ImageLayout.Zoom;
            ClientSize = new Size(500, 600);
            Controls.Add(lbl_Title);
            Controls.Add(pictureBox1);
            FormBorderStyle = FormBorderStyle.None;
            Name = "f_splash";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "f_splash";
            ((System.ComponentModel.ISupportInitialize)pictureBox1).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private PictureBox pictureBox1;
        private Label lbl_Title;
    }
}