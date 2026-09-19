using StoryTimelineMk2.Database;
using Dapper;

namespace StoryTimelineMk2.Tests.Database;

[Collection("Database")]
public class FilterRuleRepoTests
{
    private static int SeedTimeline(DbTestContext ctx, string title = "Test Timeline")
    {
        using var db = ctx.OpenConnection();
        db.Execute("INSERT INTO timelines (title, author, description, start_year) VALUES (@T, '', '', 0)", new { T = title });
        return db.QuerySingle<int>("SELECT last_insert_rowid()");
    }

    private static FilterRuleItem MakeRule(int timelineId, int sortOrder = 0, string label = "Rule") => new()
    {
        Id = Guid.NewGuid().ToString(),
        TimelineId = timelineId,
        Dimension = "tag",
        ParamsJson = "{\"tag\":\"epic\"}",
        Label = label,
        State = "include",
        SortOrder = sortOrder,
    };

    [Fact]
    public void GetByTimeline_ReturnsEmpty_WhenNoneSaved()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new FilterRuleRepo();

        Assert.Empty(repo.GetByTimeline(tl));
    }

    [Fact]
    public void Save_ThenGetByTimeline_ReturnsRulesOrderedBySortOrder()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new FilterRuleRepo();
        repo.Save(MakeRule(tl, sortOrder: 2, label: "second"));
        repo.Save(MakeRule(tl, sortOrder: 1, label: "first"));

        var rules = repo.GetByTimeline(tl).ToList();

        Assert.Equal(["first", "second"], rules.Select(r => r.Label).ToList());
        var first = rules[0];
        Assert.Equal("tag", first.Dimension);
        Assert.Equal("{\"tag\":\"epic\"}", first.ParamsJson);
        Assert.Equal("include", first.State);
        Assert.Equal(tl, first.TimelineId);
    }

    [Fact]
    public void Save_UpsertsExistingRule()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new FilterRuleRepo();
        var rule = MakeRule(tl);
        repo.Save(rule);

        rule.Label = "renamed";
        rule.State = "exclude";
        rule.SortOrder = 7;
        repo.Save(rule);

        var stored = Assert.Single(repo.GetByTimeline(tl));
        Assert.Equal("renamed", stored.Label);
        Assert.Equal("exclude", stored.State);
        Assert.Equal(7, stored.SortOrder);
    }

    [Fact]
    public void Delete_RemovesSingleRule()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new FilterRuleRepo();
        var keep = MakeRule(tl, label: "keep");
        var drop = MakeRule(tl, label: "drop");
        repo.Save(keep);
        repo.Save(drop);

        repo.Delete(drop.Id);

        var remaining = Assert.Single(repo.GetByTimeline(tl));
        Assert.Equal(keep.Id, remaining.Id);
    }

    [Fact]
    public void DeleteAllForTimeline_RemovesOnlyThatTimelinesRules()
    {
        using var ctx = new DbTestContext();
        int tl1 = SeedTimeline(ctx, "TL One");
        int tl2 = SeedTimeline(ctx, "TL Two");
        var repo = new FilterRuleRepo();
        repo.Save(MakeRule(tl1));
        repo.Save(MakeRule(tl1));
        repo.Save(MakeRule(tl2));

        repo.DeleteAllForTimeline(tl1);

        Assert.Empty(repo.GetByTimeline(tl1));
        Assert.Single(repo.GetByTimeline(tl2));
    }

    [Fact]
    public void DeletingTimeline_CascadesItsRules()
    {
        using var ctx = new DbTestContext();
        int tl = SeedTimeline(ctx);
        var repo = new FilterRuleRepo();
        repo.Save(MakeRule(tl));

        new TimelineRepo().DeleteTimeline(tl);

        Assert.Empty(repo.GetByTimeline(tl));
    }
}
