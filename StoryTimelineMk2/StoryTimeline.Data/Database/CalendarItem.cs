using System;
using System.Collections.Generic;
using System.Text;

namespace StoryTimelineMk2.Database
{
    public class CalendarItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = null!;
        public string AlternateName { get; set; } = string.Empty;
        public string ShortName { get; set; } = string.Empty;
        public string NameBefore0 { get; set; } = string.Empty;
        public string NameAfter0 { get; set; } = string.Empty;
        public string LodProfileId { get; set; } = string.Empty;
        public string YearDefinition { get; set; } = string.Empty; // JSON object describing the year
        public LodItem LodProfile { get; set; } = new LodItem();
    }
}
