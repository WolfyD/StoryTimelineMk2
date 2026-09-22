using SkiaSharp;
using StoryTimelineMk2.Database;

namespace StoryTimelineMk2.Tests.Database;

/// <summary>
/// Thumbnailing moved from System.Drawing to SkiaSharp (BL-67). These pin the two things that port
/// could get wrong: the scaled size, and which files decode at all.
/// </summary>
public class MediaRepoThumbTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "st-thumb-" + Guid.NewGuid().ToString("N"));

    public MediaRepoThumbTests() => Directory.CreateDirectory(_dir);

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    private string WriteSource(int w, int h, SKEncodedImageFormat format, string ext)
    {
        using var bmp = new SKBitmap(w, h);
        using (var canvas = new SKCanvas(bmp)) canvas.Clear(SKColors.CornflowerBlue);
        string path = Path.Combine(_dir, $"src.{ext}");
        using var data = bmp.Encode(format, 90);
        using var fs = File.Create(path);
        data.SaveTo(fs);
        return path;
    }

    [Fact]
    public void WriteThumb_ScalesLongestSideTo256_KeepingAspect()
    {
        string src = WriteSource(400, 300, SKEncodedImageFormat.Png, "png");
        string thumb = Path.Combine(_dir, "thumb.png");

        MediaRepo.WriteThumb(src, thumb);

        using var result = SKBitmap.Decode(thumb);
        Assert.Equal((256, 192), (result.Width, result.Height));
    }

    [Fact]
    public void WriteThumb_LeavesSmallerImagesAlone()
    {
        string src = WriteSource(64, 48, SKEncodedImageFormat.Png, "png");
        string thumb = Path.Combine(_dir, "small.png");

        MediaRepo.WriteThumb(src, thumb);

        using var result = SKBitmap.Decode(thumb);
        Assert.Equal((64, 48), (result.Width, result.Height));
    }

    [Fact]
    public void WriteThumb_HandlesWebp()
    {
        // GDI+ had no WebP decoder and the repo skipped those; Skia decodes them
        string src = WriteSource(800, 200, SKEncodedImageFormat.Webp, "webp");
        string thumb = Path.Combine(_dir, "webp.png");

        MediaRepo.WriteThumb(src, thumb);

        using var result = SKBitmap.Decode(thumb);
        Assert.Equal((256, 64), (result.Width, result.Height));
    }

    [Fact]
    public void WriteThumb_ThrowsOnUndecodableFile()
    {
        // EnsureThumb relies on this to log and fall back to the original instead of writing junk
        string src = Path.Combine(_dir, "not-an-image.png");
        File.WriteAllText(src, "definitely not a PNG");

        Assert.Throws<InvalidOperationException>(
            () => MediaRepo.WriteThumb(src, Path.Combine(_dir, "out.png")));
    }
}
