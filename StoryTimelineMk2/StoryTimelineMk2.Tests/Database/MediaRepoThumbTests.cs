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

    /// <summary>
    /// Two flat bands, so a box filter's answer is knowable: every destination pixel averages source
    /// pixels of one colour only, except the row on the seam.
    /// </summary>
    private string WriteBanded(int w, int h, SKEncodedImageFormat format, string ext)
    {
        using var bmp = new SKBitmap(w, h);
        using (var canvas = new SKCanvas(bmp))
        {
            canvas.Clear(SKColors.Red);
            using var paint = new SKPaint { Color = SKColors.Blue };
            canvas.DrawRect(new SKRect(0, h / 2f, w, h), paint);
        }
        string path = Path.Combine(_dir, $"banded.{ext}");
        using var data = bmp.Encode(format, 100);
        using var fs = File.Create(path);
        data.SaveTo(fs);
        return path;
    }

    // ── BL-16: the bounded decode a map image of any size depends on ──────────

    [Fact]
    public void WriteResized_CapsTheLongEdge_AtWhateverTheCallerAsksFor()
    {
        string src = WriteSource(4000, 1000, SKEncodedImageFormat.Png, "png");
        string outPath = Path.Combine(_dir, "view.webp");

        MediaRepo.WriteResized(src, outPath, 2048, SKEncodedImageFormat.Webp, 90);

        using var result = SKBitmap.Decode(outPath);
        Assert.Equal((2048, 512), (result.Width, result.Height));
    }

    /// <summary>
    /// The size a map may be is unbounded, the memory is not. WebP and JPEG shrink as they are read,
    /// so only the output size is ever allocated; a PNG of the very same dimensions has to arrive
    /// whole, and past the budget it is refused with an explanation instead of attempted.
    /// </summary>
    [Fact]
    public void WriteResized_ScalesWhileReading_WhenTheFormatCanAndRefusesWhenItCannot()
    {
        const long budget = 2L * 1024 * 1024;   // 2 MP: below the 4 MP source, above the 1 MP output

        string webp = WriteSource(4000, 1000, SKEncodedImageFormat.Webp, "webp");
        string webpOut = Path.Combine(_dir, "scaled.webp");
        MediaRepo.WriteResized(webp, webpOut, 2048, SKEncodedImageFormat.Webp, 90, budgetPixels: budget);

        using var result = SKBitmap.Decode(webpOut);
        Assert.Equal((2048, 512), (result.Width, result.Height));

        string png = WriteSource(4000, 1000, SKEncodedImageFormat.Png, "png");
        var refused = Assert.Throws<InvalidOperationException>(
            () => MediaRepo.WriteResized(png, Path.Combine(_dir, "refused.webp"),
                2048, SKEncodedImageFormat.Webp, 90, budgetPixels: budget));

        // The writer has to be able to act on this: it names the size and the way out.
        Assert.Contains("4000x1000", refused.Message);
        Assert.Contains("WebP", refused.Message);
    }

    [Fact]
    public void WriteResized_KeepsFlatColourFlat_ShrinkingFourToOne()
    {
        string src = WriteBanded(400, 300, SKEncodedImageFormat.Png, "png");
        string outPath = Path.Combine(_dir, "bands.png");

        MediaRepo.WriteResized(src, outPath, 100, SKEncodedImageFormat.Png, 100);

        using var result = SKBitmap.Decode(outPath);
        var top = result.GetPixel(50, 10);
        var bottom = result.GetPixel(50, 64);

        // Red on top, blue underneath, and not a blend of the two anywhere but the seam.
        Assert.True(top.Red > 200 && top.Blue < 55, $"top was {top}");
        Assert.True(bottom.Blue > 200 && bottom.Red < 55, $"bottom was {bottom}");
    }

    [Fact]
    public void WriteResized_LeavesSmallImagesAtTheirOwnSize()
    {
        string src = WriteSource(64, 48, SKEncodedImageFormat.Png, "png");
        string outPath = Path.Combine(_dir, "small.png");

        MediaRepo.WriteResized(src, outPath, 4096, SKEncodedImageFormat.Png, 100);

        using var result = SKBitmap.Decode(outPath);
        Assert.Equal((64, 48), (result.Width, result.Height));
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
