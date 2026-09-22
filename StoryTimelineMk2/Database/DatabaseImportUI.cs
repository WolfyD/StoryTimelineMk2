using StoryTimelineMk2.Forms;

namespace StoryTimelineMk2.Database
{
    /// <summary>
    /// The file-dialog half of <see cref="DatabaseImporter"/>. It stays in the WinForms host because
    /// the data layer is UI-less and cross-platform (BL-67); the import itself lives in the library.
    /// </summary>
    internal static class DatabaseImportUI
    {
        public static bool HandleDBImport()
        {
            try
            {
                OpenFileDialog ofd = new OpenFileDialog()
                {
                    Filter = "Databases and archives|*.sql;*.sqlite;*.sqlite3;*.db;*.db3;*.stlm|All Files|*.*",
                    Title = "Open DB file for import"
                };

                if (ofd.ShowDialog() == DialogResult.OK)
                {
                    if (File.Exists(ofd.FileName))
                    {
                        DatabaseImporter.Import(ofd.FileName);
                    }
                }
            }
            catch (Exception ex)
            {
                // Project rule: log full stack trace and show to the user — never
                // swallow. Before this, any import failure was reported as success.
                Logger.Error("DatabaseImporter", ex);
                f_ErrorReport.ShowReport("Database import failed.", ex);
                return false;
            }
            return true;
        }
    }
}
