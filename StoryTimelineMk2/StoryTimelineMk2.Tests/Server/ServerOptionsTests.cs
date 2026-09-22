using StoryTimelineMk2.Server;

namespace StoryTimelineMk2.Tests.Web;

/// <summary>
/// The server's command line. A typo must stop it rather than quietly serve something else —
/// the user would otherwise be looking at the wrong port or an empty page.
/// </summary>
public class ServerOptionsTests
{
    [Fact]
    public void NoArgumentsMeansTheDefaultPort()
    {
        var options = ServerOptions.Parse([]);

        Assert.Equal(ServerOptions.DefaultPort, options.Port);
        Assert.Null(options.SpaRoot);
        Assert.False(options.ShowHelp);
    }

    [Theory]
    [InlineData("--help")]
    [InlineData("-h")]
    public void HelpIsRecognised(string flag)
    {
        Assert.True(ServerOptions.Parse([flag]).ShowHelp);
    }

    [Fact]
    public void PortAndSpaRootAreRead()
    {
        var options = ServerOptions.Parse(["--port", "8080", "--spa", @"C:\somewhere\dist"]);

        Assert.Equal(8080, options.Port);
        Assert.Equal(@"C:\somewhere\dist", options.SpaRoot);
    }

    [Theory]
    [InlineData("--port")]
    [InlineData("--port", "http")]
    [InlineData("--port", "70000")]
    [InlineData("--port", "-1")]
    [InlineData("--spa")]
    [InlineData("--serve")]
    public void MalformedArgumentsThrow(params string[] args)
    {
        Assert.Throws<ArgumentException>(() => ServerOptions.Parse(args));
    }

    [Fact]
    public void ExplicitSpaRootWins()
    {
        using var temp = new TempTree();
        string chosen = temp.WithIndexHtml("chosen");
        temp.WithIndexHtml("wwwroot");

        var options = ServerOptions.Parse(["--spa", chosen]);

        Assert.Equal(chosen, options.ResolveSpaRoot(temp.Root));
    }

    [Fact]
    public void WwwrootIsFoundNextToTheExecutable()
    {
        using var temp = new TempTree();
        string wwwroot = temp.WithIndexHtml("wwwroot");

        Assert.Equal(wwwroot, ServerOptions.Parse([]).ResolveSpaRoot(temp.Root));
    }

    [Fact]
    public void TheHostsFrontendDistIsTheFallback()
    {
        using var temp = new TempTree();
        string dist = temp.WithIndexHtml(Path.Combine("Frontend", "dist"));

        Assert.Equal(dist, ServerOptions.Parse([]).ResolveSpaRoot(temp.Root));
    }

    [Fact]
    public void AnUnbuiltFrontendSaysWhereItLooked()
    {
        using var temp = new TempTree();

        var ex = Assert.Throws<DirectoryNotFoundException>(() => ServerOptions.Parse([]).ResolveSpaRoot(temp.Root));

        Assert.Contains("wwwroot", ex.Message);
        Assert.Contains("npm run build", ex.Message);
    }

    /// <summary>A throwaway folder standing in for a publish directory.</summary>
    private sealed class TempTree : IDisposable
    {
        public string Root { get; } =
            Path.Combine(Path.GetTempPath(), "StoryTimelineSpa_" + Guid.NewGuid());

        public TempTree() => Directory.CreateDirectory(Root);

        public string WithIndexHtml(string relative)
        {
            string folder = Path.Combine(Root, relative);
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "index.html"), "<!doctype html>");
            return folder;
        }

        public void Dispose()
        {
            try { Directory.Delete(Root, recursive: true); } catch { /* best-effort */ }
        }
    }
}
