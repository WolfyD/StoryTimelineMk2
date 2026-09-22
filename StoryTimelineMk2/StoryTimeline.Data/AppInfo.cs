using System.Reflection;

namespace StoryTimelineMk2
{
    /// <summary>
    /// The running application's version, recorded in migration logs and backup file names. It lives
    /// here because the data layer writes it and must not know which host it is running under.
    /// </summary>
    public static class AppInfo
    {
        private static string? _version;

        /// <summary>Major.Minor.Patch of the entry assembly; a host may set it before first use.</summary>
        public static string Version
        {
            get
            {
                if (_version == null)
                {
                    var v = (Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly()).GetName().Version;
                    _version = v is null ? "0.0.0" : $"{v.Major}.{v.Minor}.{v.Build}";
                }
                return _version;
            }
            set => _version = value;
        }
    }
}
