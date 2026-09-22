using System.Runtime.CompilerServices;
using StoryTimelineMk2.Bridge;

namespace StoryTimelineMk2.Tests.Bridge;

/// <summary>
/// The hub is static, so these run serially within the class (xunit's default) and each one
/// starts from an empty registry. They join the Database collection for the same reason: it is
/// the one collection that never runs in parallel, and BridgeServerTests registers real
/// channels that a Clear() here would yank out from under it.
/// </summary>
[Collection("Database")]
public class BridgeHubTests : IDisposable
{
    public BridgeHubTests() => BridgeHub.Clear();
    public void Dispose() => BridgeHub.Clear();

    [Fact]
    public void BroadcastReachesEveryRegisteredChannel()
    {
        var a = new FakeChannel();
        var b = new FakeChannel();
        BridgeHub.Register(a);
        BridgeHub.Register(b);

        int sent = BridgeHub.Broadcast("AchievementUnlocked", new { title = "First item" });

        Assert.Equal(2, sent);
        foreach (var channel in new[] { a, b })
        {
            Assert.Single(channel.Posted);
            Assert.Equal("AchievementUnlocked", channel.Last.GetProperty("action").GetString());
            Assert.Equal("First item", channel.LastPayload.GetProperty("title").GetString());
        }
    }

    [Fact]
    public void BroadcastWithoutPayloadStillCarriesTheAction()
    {
        var channel = new FakeChannel();
        BridgeHub.Register(channel);

        Assert.Equal(1, BridgeHub.Broadcast("CalendarsChanged"));
        Assert.Equal("CalendarsChanged", channel.Last.GetProperty("action").GetString());
    }

    [Fact]
    public void RegisteringTwiceDeliversOnce()
    {
        var channel = new FakeChannel();
        BridgeHub.Register(channel);
        BridgeHub.Register(channel);

        Assert.Equal(1, BridgeHub.Count);
        Assert.Equal(1, BridgeHub.Broadcast("Ping"));
        Assert.Single(channel.Posted);
    }

    [Fact]
    public void UnregisteredChannelsGetNothing()
    {
        var channel = new FakeChannel();
        BridgeHub.Register(channel);
        BridgeHub.Unregister(channel);

        Assert.Equal(0, BridgeHub.Count);
        Assert.Equal(0, BridgeHub.Broadcast("Ping"));
        Assert.Empty(channel.Posted);
    }

    [Fact]
    public void AnUnreachableChannelIsDroppedAndTheRestStillGetIt()
    {
        var gone = new FakeChannel { Reachable = false };
        var live = new FakeChannel();
        BridgeHub.Register(gone);
        BridgeHub.Register(live);

        Assert.Equal(1, BridgeHub.Broadcast("Ping"));
        Assert.Equal(1, BridgeHub.Count);
        Assert.Equal(1, BridgeHub.Broadcast("Ping"));
        Assert.Single(gone.Posted);      // only the first attempt
        Assert.Equal(2, live.Posted.Count);
    }

    [Fact]
    public void AThrowingChannelIsDroppedAndTheRestStillGetIt()
    {
        var broken = new FakeChannel { Throws = true };
        var live = new FakeChannel();
        BridgeHub.Register(broken);
        BridgeHub.Register(live);

        Assert.Equal(1, BridgeHub.Broadcast("Ping"));
        Assert.Equal(1, BridgeHub.Count);
        Assert.Single(live.Posted);
    }

    [Fact]
    public void ACollectedChannelIsDropped()
    {
        RegisterAndForget();
        Assert.Equal(1, BridgeHub.Count);

        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();

        // A registration must never be what keeps a closed window's channel alive.
        Assert.Equal(0, BridgeHub.Count);
        Assert.Equal(0, BridgeHub.Broadcast("Ping"));

        [MethodImpl(MethodImplOptions.NoInlining)]
        static void RegisterAndForget() => BridgeHub.Register(new FakeChannel());
    }
}
