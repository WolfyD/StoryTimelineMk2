using StoryTimelineMk2.Database;
using System.Text.Json;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class CalendarExporterTests
{
    private static CalendarItem MakeCalendar(string name = "Elven Reckoning") => new()
    {
        Name = name,
        ShortName = "ER",
        AlternateName = "Reckoning of the Elves",
        NameBefore0 = "BF",
        NameAfter0 = "AF",
        YearDefinition = "{\"length\":400,\"months\":[{\"name\":\"First\",\"length\":200},{\"name\":\"Second\",\"length\":200}],\"memorable_days\":[{\"name\":\"Founding\",\"type\":\"fixed\",\"month\":0,\"day\":1}]}",
        LodProfile = new LodItem { Name = "Elven LOD", Profile = "[{\"index\":0,\"formatKey\":\"CENTURIES\",\"stepFraction\":100},{\"index\":1,\"formatKey\":\"YEARS\",\"stepFraction\":1}]" },
    };

    private static string WriteTemp(DbTestContext ctx, string json)
    {
        string path = Path.Combine(ctx.TempDir, Guid.NewGuid() + ".json");
        File.WriteAllText(path, json);
        return path;
    }

    [Fact]
    public void ToJson_InlinesYearDefinitionAndProfileAsRealJson()
    {
        var json = CalendarExporter.ToJson(MakeCalendar());
        var root = JsonSerializer.Deserialize<JsonElement>(json);

        Assert.Equal(CalendarExporter.Format, root.GetProperty("format").GetString());
        Assert.Equal("Elven Reckoning", root.GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Object, root.GetProperty("yearDefinition").ValueKind);
        Assert.Equal("Founding", root.GetProperty("yearDefinition").GetProperty("memorable_days")[0].GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Array, root.GetProperty("lodProfile").GetProperty("profile").ValueKind);
        Assert.Equal("Elven LOD", root.GetProperty("lodProfile").GetProperty("name").GetString());
    }

    [Fact]
    public void Import_CreatesNewCalendarWithNewIds_AndKeepsContent()
    {
        using var ctx = new DbTestContext();
        var repo = new CalendarRepo();
        var original = MakeCalendar();
        repo.SaveCalendarWithLod(original);

        var (imported, collision) = CalendarExporter.Import(WriteTemp(ctx, CalendarExporter.ToJson(original)));

        Assert.True(collision);
        Assert.NotEqual(original.Id, imported.Id);
        Assert.NotEqual(original.LodProfileId, imported.LodProfileId);

        var stored = repo.GetCalendarById(imported.Id);
        Assert.Equal("Elven Reckoning", stored.Name);
        Assert.Equal("ER", stored.ShortName);
        Assert.Equal("Reckoning of the Elves", stored.AlternateName);
        Assert.Equal("BF", stored.NameBefore0);
        Assert.Equal("AF", stored.NameAfter0);
        Assert.Equal("Elven LOD", stored.LodProfile.Name);
        Assert.Equal(400, JsonSerializer.Deserialize<JsonElement>(stored.YearDefinition).GetProperty("length").GetInt32());
        Assert.Equal("Founding", JsonSerializer.Deserialize<JsonElement>(stored.YearDefinition).GetProperty("memorable_days")[0].GetProperty("name").GetString());
        Assert.Equal(2, JsonSerializer.Deserialize<JsonElement>(stored.LodProfile.Profile).GetArrayLength());
        Assert.Equal(2, repo.GetAll().Count(c => c.Name == "Elven Reckoning"));
    }

    [Fact]
    public void Import_ReportsNoCollision_WhenNameIsUnused()
    {
        using var ctx = new DbTestContext();
        var (_, collision) = CalendarExporter.Import(WriteTemp(ctx, CalendarExporter.ToJson(MakeCalendar("Never Seen"))));
        Assert.False(collision);
    }

    [Theory]
    [InlineData("{\"foo\":1}", "not a StoryTimeline calendar")]
    [InlineData("{\"format\":\"storytimeline-calendar\",\"name\":\"  \",\"yearDefinition\":{},\"lodProfile\":{\"profile\":[]}}", "no name")]
    [InlineData("{\"format\":\"storytimeline-calendar\",\"name\":\"X\",\"lodProfile\":{\"profile\":[]}}", "no year definition")]
    [InlineData("{\"format\":\"storytimeline-calendar\",\"name\":\"X\",\"yearDefinition\":{},\"lodProfile\":{\"profile\":\"nope\"}}", "no LOD profile")]
    [InlineData("{\"format\":\"storytimeline-calendar\",\"name\":\"X\",\"yearDefinition\":{},\"lodProfile\":{\"profile\":[{\"formatKey\":\"MONTHS\"}]}}", "no YEARS level")]
    public void Import_RejectsBadFiles_WithoutSavingAnything(string json, string expectedMessagePart)
    {
        using var ctx = new DbTestContext();
        int before = new CalendarRepo().GetAll().Count();

        var ex = Assert.Throws<InvalidDataException>(() => CalendarExporter.Import(WriteTemp(ctx, json)));

        Assert.Contains(expectedMessagePart, ex.Message);
        Assert.Equal(before, new CalendarRepo().GetAll().Count());
    }

    [Fact]
    public void Import_ThrowsOnMalformedJson()
    {
        using var ctx = new DbTestContext();
        Assert.ThrowsAny<JsonException>(() => CalendarExporter.Import(WriteTemp(ctx, "{ not json")));
    }
}
