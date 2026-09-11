using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class SettingsItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Font { get; set; }
        public float FontSizeScale { get; set; }
        public int PixelsPerSubtick { get; set; }
        public string CustomCss { get; set; }
        public bool UseCustomCss { get; set; }
        public bool IsFullscreen { get; set; }
        public bool ShowGuides { get; set; }
        public int WindowSizeX { get; set; }
        public int WindowSizeY { get; set; }
        public int WindowPositionX { get; set; }
        public int WindowPositionY { get; set; }
        public bool WindowMaximized { get; set; }
        public bool UseCustomScaling { get; set; }
        public float CustomScale { get; set; }
        public int DisplayRadius { get; set; }
        public string CanvasSettings { get; set; }
        public DateTime UpdatedAt { get; set; }
        public int TimelineId { get; set; }
    }
}
