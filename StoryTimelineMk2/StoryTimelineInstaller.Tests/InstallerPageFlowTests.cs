namespace StoryTimelineInstaller.Tests;

public class InstallerPageFlowTests
{
    // ── GetDotCount ───────────────────────────────────────────────────────────

    [Fact]
    public void GetDotCount_ReturnsFour_ForInstallMode()
        => Assert.Equal(4, InstallerPageFlow.GetDotCount(InstallerMode.Install));

    [Fact]
    public void GetDotCount_ReturnsTwo_ForUninstallMode()
        => Assert.Equal(2, InstallerPageFlow.GetDotCount(InstallerMode.Uninstall));

    // ── GetDotIndex — Install flow ────────────────────────────────────────────
    // Pages: 0=Welcome/Mode  1=License  2=Directory  3=Options  4=Progress  5=Finish
    // Dots:  0                1           1            2          3            3

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(2, 1)]
    [InlineData(3, 2)]
    [InlineData(4, 3)]
    [InlineData(5, 3)]
    public void GetDotIndex_Install_MapsPageToDotCorrectly(int pageIdx, int expectedDot)
        => Assert.Equal(expectedDot, InstallerPageFlow.GetDotIndex(pageIdx, InstallerMode.Install));

    // With the optional RuntimePage inserted after License:
    // Pages: 0=Welcome/Mode  1=License  2=Runtime  3=Directory  4=Options  5=Progress  6=Finish
    // Dots:  0                1           1          1            2          3            3
    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(2, 1)]
    [InlineData(3, 1)]
    [InlineData(4, 2)]
    [InlineData(5, 3)]
    [InlineData(6, 3)]
    public void GetDotIndex_InstallWithRuntimePage_MapsPageToDotCorrectly(int pageIdx, int expectedDot)
        => Assert.Equal(expectedDot, InstallerPageFlow.GetDotIndex(pageIdx, InstallerMode.Install, hasRuntimePage: true));

    [Fact]
    public void GetDotIndex_Install_OutOfRangePageReturnsDotZero()
        => Assert.Equal(0, InstallerPageFlow.GetDotIndex(99, InstallerMode.Install));

    // ── GetDotIndex — Uninstall flow ──────────────────────────────────────────
    // Pages: 0=Uninstall  1=Progress  2=Finish
    // Dots:  0             1            1

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(2, 1)]
    public void GetDotIndex_Uninstall_MapsPageToDotCorrectly(int pageIdx, int expectedDot)
        => Assert.Equal(expectedDot, InstallerPageFlow.GetDotIndex(pageIdx, InstallerMode.Uninstall));

    [Fact]
    public void GetDotIndex_Uninstall_OutOfRangePageReturnsDotOne()
        => Assert.Equal(1, InstallerPageFlow.GetDotIndex(99, InstallerMode.Uninstall));

    // ── IsNewerVersion ────────────────────────────────────────────────────────

    [Theory]
    [InlineData("1.1.0", "1.0.0", true)]
    [InlineData("2.0.0", "1.9.9", true)]
    [InlineData("1.0.1", "1.0.0", true)]
    [InlineData("10.0.0", "9.9.9", true)]
    public void IsNewerVersion_ReturnsTrue_WhenCandidateIsHigher(string candidate, string installed, bool expected)
        => Assert.Equal(expected, InstallerPageFlow.IsNewerVersion(candidate, installed));

    [Theory]
    [InlineData("1.0.0", "1.0.0", false)]
    [InlineData("0.9.9", "1.0.0", false)]
    [InlineData("1.0.0", "1.0.1", false)]
    public void IsNewerVersion_ReturnsFalse_WhenCandidateIsEqualOrOlder(string candidate, string installed, bool expected)
        => Assert.Equal(expected, InstallerPageFlow.IsNewerVersion(candidate, installed));

    [Theory]
    [InlineData("",          "1.0.0")]
    [InlineData("not-semver","1.0.0")]
    [InlineData("v1.1.0",    "1.0.0")]  // v-prefix not accepted here (contrast: UpdateChecker strips it)
    [InlineData("1.0.0",     "")]
    [InlineData("1.0.0",     "bad")]
    public void IsNewerVersion_ReturnsFalse_ForMalformedInput(string candidate, string installed)
        => Assert.False(InstallerPageFlow.IsNewerVersion(candidate, installed));
}
