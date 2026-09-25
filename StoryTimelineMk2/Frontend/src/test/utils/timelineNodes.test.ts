import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LayoutSettings } from '@/types/models'

// Ã¢â€â‚¬Ã¢â€â‚¬ Konva mock Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Konva tries to create real <canvas> elements which don't exist in happy-dom.
// We mock the entire module with simple fake constructors.

function makeKonvaShape(id: string) {
  return {
    id: () => id,
    visible: vi.fn(),
    position: vi.fn(),
    width: vi.fn(),
    height: vi.fn(),
    points: vi.fn(),
    cornerRadius: vi.fn(),
    to: vi.fn(),
    on: vi.fn(),
    add: vi.fn(),
    padding: vi.fn(),
    stroke: vi.fn(),
    strokeWidth: vi.fn(),
    scale: vi.fn(),
    scaleY: vi.fn(),
    cache: vi.fn(),
    clearCache: vi.fn(),
    getLayer: vi.fn(),
    fillLinearGradientStartPoint: vi.fn(),
    fillLinearGradientEndPoint: vi.fn(),
    fillLinearGradientColorStops: vi.fn(),
    fillPriority: vi.fn(),
  }
}

vi.mock('konva', () => {
  function makeClass(type: string) {
    return function (opts: any) {
      const shape = makeKonvaShape(opts?.id ?? '')
      // Attach methods referenced in source
      ;(shape as any).type = type
      ;(shape as any).opts = opts
      return shape
    }
  }

  const Group = function () {
    return { add: vi.fn(), on: vi.fn() }
  }

  return {
    default: {
      Rect: makeClass('Rect'),
      Line: makeClass('Line'),
      Text: makeClass('Text'),
      Image: makeClass('Image'),
      Circle: makeClass('Circle'),
      Label: makeClass('Label'),
      Tag: makeClass('Tag'),
      Group,
      Easings: { EaseOut: 'easeOut' },
      // Enough of it for fadedColor: six-digit hex is what every test here passes.
      Util: {
        colorToRGBA: (c: string) => /^#[0-9a-f]{6}$/i.test(c)
          ? { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16), a: 1 }
          : undefined,
      },
    },
  }
})

// Import after mock is registered
import { buildNode, setNodeVisibility, updateAbsolutePositions, KIN_SCALE } from '@/utils/timelineNodes'

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function makeMasterGroup() {
  return { add: vi.fn(), on: vi.fn() }
}

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return Object.assign({
    Id: 'ls_test',
    Name: 'Test',
    TimelineEventBoxWidth: 130,
    TimelineEventBoxHeight: 30,
    TimelineEventBoxStemOffset: 10,
    TimelineEventBorderColor: '#000',
    TimelineEventBorderWidth: 1,
    TimelineEventBorderRadius: 3,
    TimelineEventPadding: '10',
    TimelineEventYMargin: 5,
    TimelineEventTextColor: '#000',
    TimelineEventBackgroundColor: '#fff',
    TimelineEventFontFamily: 'Arial',
    TimelineEventFontSize: 16,
    TimelineEventTextUseEllipsis: true,
    TimelineEventBoxShowColor: true,
    TimelineEventBoxShowColorOnBottom: false,
    TimelineEventHasHoverHighlight: true,
    TimelineEventHoverColor: '#33f',
    TimelineAgeHeight: 30,
    TimelineAgeCornerRounding: 0,
    TimelinePeriodHeight: 15,
    TimelinePeriodCornerRounding: 10,
    TimelinePeriodYMargin: 5,
    TimelinePeriodYOffset: 30,
    TimelineBoxTypesShowAsBox: true,
    TimelineBoxTypesBoxWidth: 100,
    TimelineBoxTypesShowImage: true,
    TimelinePictureCaptionFontSize: 12,
    TimelineCharacterCaptionFontSize: 12,
    TimelineCanvasBackgroundColor: '#f1e7d5',
    TimelineShowNowLine: true,
    TimelineShowNowLineText: true,
    TimelineNowLineColor: '#f00',
    TimelineNowLineStyle: 'dashed',
    TimelineNowLineWidth: 2,
    TimelineTickDistance: 100,
    TimelineTickWidth: 1,
    TimelineNonYearTicksSmaller: true,
    TimelineTickMarkerFontFamily: 'Arial',
    TimelineTickMarkerFontStyle: 'normal',
    TimelineTickMarkerTextColor: '#2a1a0e',
    TimelineTickMarkerFontSize: 14,
    TimelineTickMarkerTextAlwaysOnTop: false,
    TimelineTickMarkerTextAngled: false,
    TimelineShowHoverLine: true,
    TimelineHoverLineColor: '#f00',
    TimelineHoverLineStyle: 'solid',
    TimelineHoverLineWidth: 1,
    TimelineEdgeMarginWidth: 10,
    TimelineDataRangeWidth: 100,
    TimelineIsDataRangeVisible: true,
    TimelineDataRangeColor: '#ff72',
    TimelineAnimateOnJumpToYear: true,
    TimelineJumpToYearAnimationLength: 600,
    TimelineAnimateLodChange: true,
    TimelineLodChangeAnimationLength: 200,
    TimelineTickColor: '#c8b9a4',
    TimelineAxisColor: '#b5a692',
    NotesPanelBackgroundColor: '',
    NotesPanelCardBackgroundColor: '',
    NotesPanelTextColor: '',
    NotesPanelHeadingColor: '',
    NotesPanelAccentColor: '',
    NotesPanelFontSize: 13,
    DataPanelBackgroundColor: '#f5f0e8',
    DataPanelCardBackgroundColor: '#ffffffaa',
    DataPanelH1Color: '#2c1f0f',
    DataPanelH2Color: '#3a2b1a',
    DataPanelH3Color: '#2c1f0f',
    DataPanelH4Color: '#5c4a38',
    DataPanelFontFamily: 'Georgia, serif',
    DataPanelFontSize: 14,
    GalleryPanelBackgroundColor: '',
    GalleryPanelBorderColor: '',
    GalleryPanelTextColor: '',
    CalendarPanelBackgroundColor: '#f5f0e8',
    CalendarPanelBorderColor: '#d5cec4',
    CalendarPanelTextColor: '#5c4a38',
    CalendarPanelWeekHighlightColor: '#6366f118',
    CalendarPanelDayHighlightColor: '#6366f135',
    TimelineCalendarOverlayEnabled: false,
    TimelineCalendarOverlaySeasonColor: '#ffffff10',
    TimelineCalendarOverlayMonthColor: '#ffffff0c',
    TimelineCalendarOverlayWeekColor: '#ffffff08',
    TimelineCalendarOverlayDayColor: '#ffffff06',
    ...overrides,
    TimelineBreakFillColor: '#ffffff',
    TimelineBreakBorderColor: '#000000',
    MeasureLineColor: '#000000',
  }, overrides)
}

// Ã¢â€â‚¬Ã¢â€â‚¬ buildNode Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('buildNode', () => {
  let stems: ReturnType<typeof makeMasterGroup>
  let boxes: ReturnType<typeof makeMasterGroup>
  let ls: LayoutSettings

  beforeEach(() => {
    stems = makeMasterGroup()
    boxes = makeMasterGroup()
    ls = makeLayoutSettings()
  })

  it('builds an Event node with box, stem, and label', () => {
    const el = buildNode('id-1', 'Event', 'My Event', '#ff0000', stems as any, boxes as any, ls)
    expect(el.box).toBeDefined()
    expect(el.stem).toBeDefined()
    expect(el.label).toBeDefined()
  })

  it('does not throw for an Event node', () => {
    expect(() => buildNode('id-1', 'Event', 'Title', '#fff', stems as any, boxes as any, ls)).not.toThrow()
  })

  it('builds a Picture caption only when showTitle is set', () => {
    expect(buildNode('p1', 'Picture', 'Pic', '#aaa', stems as any, boxes as any, ls).label).toBeUndefined()
    const el = buildNode('p1', 'Picture', 'Pic', '#aaa', stems as any, boxes as any, ls, true)
    expect(el.label).toBeDefined()
    expect(el.label.add).toHaveBeenCalledTimes(2)   // Tag + Text
  })

  // A name too long for the disc used to lose its second half to an ellipsis on one line.
  it('lets a caption wrap onto a second row', () => {
    const el = buildNode('p1', 'Picture', 'A very long picture title', '#aaa', stems as any, boxes as any, ls, true) as any
    const caption = el.label.add.mock.calls[1][0]
    expect(caption.opts.wrap).toBe('word')
    expect(caption.opts.ellipsis).toBe(true)
  })

  // A generated portrait caption ("The birth of <full name>") overflows at the event font size,
  // so the two caption kinds carry a size each.
  it('sizes a caption by its kind', () => {
    const sizes = makeLayoutSettings({ TimelinePictureCaptionFontSize: 20, TimelineCharacterCaptionFontSize: 8 })
    const pic = buildNode('p1', 'Picture', 'Pic', '#aaa', stems as any, boxes as any, sizes, true) as any
    const port = buildNode('c1', 'Character', 'Risha', '#aaa', stems as any, boxes as any, sizes, true) as any
    expect(pic.label.add.mock.calls[1][0].opts.fontSize).toBe(20)
    expect(port.label.add.mock.calls[1][0].opts.fontSize).toBe(8)
  })

  // A portrait with transparency over a filled disc drowns the face, so the fill is opt-in.
  it('leaves a character disc neutral unless they ask for the highlight color', () => {
    const ringOnly = buildNode('c1', 'Character', 'Risha', '#ff0000', stems as any, boxes as any, ls) as any
    expect(ringOnly.box.opts.fill).toBe('#00000022')
    expect(ringOnly.box.opts.stroke).toBe('#ff0000')

    const filled = buildNode('c2', 'Character', 'Risha', '#ff0000', stems as any, boxes as any, ls, false, false, true) as any
    expect(filled.box.opts.fill).toBe('#ff0000')
    // An opaque portrait covers the disc, so the fill alone is invisible for exactly the characters
    // most likely to have one — the ring has to carry the highlight as well.
    expect(filled.box.opts.strokeWidth).toBeGreaterThan(ringOnly.box.opts.strokeWidth)
  })

  // BL-17: kin on a character's own timeline are context. laneSpanFor reads the same number, so a
  // disc that shrinks here has to shrink in TimelineCanvas's boxWidth too or the packer leaves a hole.
  it('draws a portrait smaller at KIN_SCALE, caption included', () => {
    const sizes = makeLayoutSettings({ TimelineBoxTypesBoxWidth: 100, TimelineCharacterCaptionFontSize: 10 })
    const full = buildNode('c1', 'Character', 'Risha', '#aaa', stems as any, boxes as any, sizes, true) as any
    const kin  = buildNode('c2', 'Character', 'Adan', '#aaa', stems as any, boxes as any, sizes, true, false, false, KIN_SCALE) as any

    expect(full.box.opts.width).toBe(100)
    expect(kin.box.opts.width).toBe(100 * KIN_SCALE)
    expect(kin.box.opts.cornerRadius).toBe(kin.box.opts.width / 2)   // still a disc, not an egg
    expect(kin.label.add.mock.calls[1][0].opts.fontSize).toBe(10 * KIN_SCALE)
  })

  // BL-72: an open side is an arrowhead that fades out, so a span can say "and long after that"
  // without the timeline being stretched to a year nobody means. The closed side stays an edge.
  it('points an open-ended age off its open side only', () => {
    const ages = makeLayoutSettings({ TimelineAgeHeight: 20 })
    const el = buildNode('a1', 'Age', 'The Long War', '#abcdef', stems as any, boxes as any, ages,
                         false, false, false, 1, false, true) as any
    expect(el.arrowStart).toBeUndefined()
    expect(el.arrowEnd).toBeDefined()

    updateAbsolutePositions(el, 'Age', 100, 300, 50, 200, false, 60, ages)
    const pts = el.arrowEnd.points.mock.calls.at(-1)[0]
    // The point is ON the end date and the head runs back over the bar from there. The other way
    // up put the arrow a headlength past the year it marks, and left a rounded corner sticking
    // out behind the tip. Solid, too: an undated end is not a fading one.
    expect(pts[2]).toBe(300)                // tip sits on the bar's end date
    expect(pts[0]).toBe(268)                // base is a headlength back inside the bar
    expect(el.arrowEnd.opts.fillPriority).toBe('color')
    expect(el.fade).toBeUndefined()
    // And the bar ends where the head begins rather than running on underneath it. Overlaid, the
    // bar's own edge showed through a half-transparent head, which is the one thing it must not do.
    expect(el.box.position.mock.calls.at(-1)[0].x).toBe(100)
    expect(el.box.width.mock.calls.at(-1)[0]).toBe(168)
    // Square on the open side only: a rounded corner leaves a notch at the head's base, which is
    // where the triangle is widest and covers nothing beyond.
    expect(el.box.cornerRadius.mock.calls.at(-1)[0]).toEqual([ages.TimelineAgeCornerRounding, 0, 0, ages.TimelineAgeCornerRounding])
  })

  // BL-72: "fade out" is the writer's other claim — this trails off rather than merely stopping.
  // One gradient over the bar and a matching one on each head, so the two read as one surface.
  it('fades an open span into its bar, not just its arrowhead', () => {
    const ages = makeLayoutSettings({ TimelineAgeHeight: 20 })
    const el = buildNode('a2', 'Age', 'The Long War', '#abcdef', stems as any, boxes as any, ages,
                         false, false, false, 1, true, true, true) as any

    updateAbsolutePositions(el, 'Age', 100, 300, 50, 200, false, 60, ages, false, 40)
    // 40px of a 200px bar is a fifth, from each end, and the stops have to stay in order.
    expect(el.box.fillLinearGradientColorStops.mock.calls.at(-1)[0])
      .toEqual([0, 'rgba(171,205,239,0.500)', 0.2, '#abcdef', 0.8, '#abcdef', 1, 'rgba(171,205,239,0.500)'])
    // The head's gradient runs tip → inward over the same year, so head and bar meet seamlessly.
    const tip = el.arrowEnd.fillLinearGradientStartPoint.mock.calls.at(-1)[0]
    const inward = el.arrowEnd.fillLinearGradientEndPoint.mock.calls.at(-1)[0]
    expect(tip.x).toBe(300)
    expect(inward.x).toBe(260)
    // A 32px head at each end, so the bar is 136 wide starting at 132 — and its gradient still
    // spans the two dates (local -32 to 168), which is what makes the alphas match at the seam.
    expect(el.box.position.mock.calls.at(-1)[0].x).toBe(132)
    expect(el.box.width.mock.calls.at(-1)[0]).toBe(136)
    expect(el.box.fillLinearGradientStartPoint.mock.calls.at(-1)[0].x).toBe(-32)
    expect(el.box.fillLinearGradientEndPoint.mock.calls.at(-1)[0].x).toBe(168)
  })

  // Both ends fading on a bar narrower than two years would cross the stops and Konva throws.
  it('never runs the two fades past each other on a short span', () => {
    const ages = makeLayoutSettings({ TimelineAgeHeight: 20 })
    const el = buildNode('a3', 'Age', 'A Moment', '#abcdef', stems as any, boxes as any, ages,
                         false, false, false, 1, true, true, true) as any

    updateAbsolutePositions(el, 'Age', 100, 130, 50, 30, false, 60, ages, false, 400)
    const stops = el.box.fillLinearGradientColorStops.mock.calls.at(-1)[0] as number[]
    const offsets = stops.filter((_, i) => i % 2 === 0)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    // Two heads cannot eat more than the span has: 15px each here, not the 32 the height wants,
    // so they meet in the middle instead of overrunning each other.
    expect(el.arrowStart.points.mock.calls.at(-1)[0][0]).toBe(115)
    expect(el.arrowEnd.points.mock.calls.at(-1)[0][0]).toBe(115)
  })

  it('builds a Period node with only a box (no stem, no label)', () => {
    const el = buildNode('id-2', 'Period', 'A Period', '#aaa', stems as any, boxes as any, ls)
    expect(el.box).toBeDefined()
    expect(el.stem).toBeUndefined()
    expect(el.label).toBeUndefined()
  })

  it('does not throw for a Period node', () => {
    expect(() => buildNode('id-2', 'Period', 'P', '#aaa', stems as any, boxes as any, ls)).not.toThrow()
  })

  it('builds an Age node with only a box', () => {
    const el = buildNode('id-3', 'Age', 'Age of Fire', '#f80', stems as any, boxes as any, ls)
    expect(el.box).toBeDefined()
    expect(el.stem).toBeUndefined()
    expect(el.label).toBeUndefined()
  })

  it('does not throw for an Age node', () => {
    expect(() => buildNode('id-3', 'Age', 'A', '#f80', stems as any, boxes as any, ls)).not.toThrow()
  })

  it('builds a Picture node with box and stem but no label', () => {
    const el = buildNode('id-4', 'Picture', 'img.png', '#00f', stems as any, boxes as any, ls)
    expect(el.box).toBeDefined()
    expect(el.stem).toBeDefined()
    expect(el.label).toBeUndefined()
  })

  it('does not throw for a Picture node', () => {
    expect(() => buildNode('id-4', 'Picture', 'img', '#00f', stems as any, boxes as any, ls)).not.toThrow()
  })

  it('builds an unknown type as an Event (has box, stem, label)', () => {
    const el = buildNode('id-5', 'Unknown', 'X', '#ccc', stems as any, boxes as any, ls)
    // Unknown types fall to the else branch (same as Event/Note/Bookmark etc.)
    expect(el.box).toBeDefined()
    expect(el.stem).toBeDefined()
    expect(el.label).toBeDefined()
  })

  it('falls back to a safe color when color is empty', () => {
    expect(() => buildNode('id-6', 'Event', 'T', '', stems as any, boxes as any, ls)).not.toThrow()
  })

  it('low resource mode colors the border instead of adding a strip node', () => {
    expect(buildNode('c1', 'Event', 'T', '#ff0000', stems as any, boxes as any, ls).colorStrip).toBeDefined()

    const el = buildNode('c2', 'Event', 'T', '#ff0000', stems as any, boxes as any, ls, false, true)
    expect(el.colorStrip).toBeUndefined()
    expect(el.box.stroke).toHaveBeenCalledWith('#ff0000')
    // a layout with no border would otherwise hide the color entirely
    expect(el.box.strokeWidth).toHaveBeenCalledWith(2)
  })

  it('low resource mode hover grows the box instead of caching a shadow', () => {
    const el = buildNode('h1', 'Event', 'T', '#f00', stems as any, boxes as any, ls, false, true)
    const handler = (name: string) =>
      (el.box.on.mock.calls.find((c: unknown[]) => c[0] === name) ?? [])[1]

    handler('mouseenter')()
    expect(el.box.scale).toHaveBeenLastCalledWith({ x: 1.06, y: 1.06 })
    expect(el.label.scale).toHaveBeenLastCalledWith({ x: 1.06, y: 1.06 })
    expect(el.box.cache).not.toHaveBeenCalled()

    handler('mouseleave')()
    expect(el.box.scale).toHaveBeenLastCalledWith({ x: 1, y: 1 })
  })
})

// Ã¢â€â‚¬Ã¢â€â‚¬ setNodeVisibility Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('setNodeVisibility', () => {
  it('calls visible(true) on all present elements', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    const label = makeKonvaShape('label')
    setNodeVisibility({ box, stem, label }, true)
    expect(box.visible).toHaveBeenCalledWith(true)
    expect(stem.visible).toHaveBeenCalledWith(true)
    expect(label.visible).toHaveBeenCalledWith(true)
  })

  it('calls visible(false) on all elements', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    const label = makeKonvaShape('label')
    setNodeVisibility({ box, stem, label }, false)
    expect(box.visible).toHaveBeenCalledWith(false)
  })

  it('does not throw when label is absent', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    expect(() => setNodeVisibility({ box, stem }, true)).not.toThrow()
    expect(box.visible).toHaveBeenCalledWith(true)
    expect(stem.visible).toHaveBeenCalledWith(true)
  })

  it('does not throw when stem is absent', () => {
    const box = makeKonvaShape('box')
    expect(() => setNodeVisibility({ box }, true)).not.toThrow()
    expect(box.visible).toHaveBeenCalledWith(true)
  })
})

// Ã¢â€â‚¬Ã¢â€â‚¬ updateAbsolutePositions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('updateAbsolutePositions', () => {
  const ls = makeLayoutSettings()

  it('calls box.position and box.width for Age', () => {
    const box = makeKonvaShape('box')
    updateAbsolutePositions({ box }, 'Age', 100, 300, 50, 100, true, 400, ls)
    expect(box.position).toHaveBeenCalled()
    expect(box.width).toHaveBeenCalled()
  })

  it('calls box.position and box.width for Period', () => {
    const box = makeKonvaShape('box')
    updateAbsolutePositions({ box }, 'Period', 100, 300, 50, 100, false, 400, ls)
    expect(box.position).toHaveBeenCalled()
    expect(box.width).toHaveBeenCalled()
  })

  it('calls stem.points and box.position for Picture', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    updateAbsolutePositions({ box, stem }, 'Picture', 200, 200, 100, 80, true, 400, ls)
    expect(stem.points).toHaveBeenCalled()
    expect(box.position).toHaveBeenCalled()
  })

  it('calls box.position, label.position, stem.points for Event', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    const label = makeKonvaShape('label')
    updateAbsolutePositions({ box, stem, label }, 'Event', 200, 200, 100, 130, true, 400, ls)
    expect(box.position).toHaveBeenCalled()
    expect(label.position).toHaveBeenCalled()
    expect(stem.points).toHaveBeenCalled()
  })

  it('Picture caption is positioned at the image left edge', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    const label = makeKonvaShape('label')
    ;(label.height as any).mockReturnValue(20)
    updateAbsolutePositions({ box, stem, label }, 'Picture', 200, 200, 100, 60, true, 400, ls)
    expect(box.position).toHaveBeenCalledWith({ x: 170, y: 100 })
    expect(label.position).toHaveBeenCalledWith({ x: 170, y: 140 })
  })

  it('centered Event straddles the anchor and its stem goes straight up', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    const label = makeKonvaShape('label')
    updateAbsolutePositions({ box, stem, label }, 'Event', 200, 200, 100, 130, true, 400, ls, true)
    expect(box.position).toHaveBeenCalledWith({ x: 200 - 65, y: 100 })
    expect(stem.points).toHaveBeenCalledWith([200, 400, 200, 100])
  })

  it('does not throw for any type', () => {
    const box = makeKonvaShape('box')
    const stem = makeKonvaShape('stem')
    const label = makeKonvaShape('label')
    const types = ['Age', 'Period', 'Picture', 'Event', 'Note', 'Bookmark']
    for (const t of types) {
      expect(() =>
        updateAbsolutePositions({ box, stem, label }, t, 100, 200, 50, 100, true, 400, ls)
      ).not.toThrow()
    }
  })
})
