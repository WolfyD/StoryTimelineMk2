import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LayoutSettings } from '@/types/models'

// ── Konva mock ────────────────────────────────────────────────────────────────
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
      Group,
      Easings: { EaseOut: 'easeOut' },
    },
  }
})

// Import after mock is registered
import { buildNode, setNodeVisibility, updateAbsolutePositions } from '@/utils/timelineNodes'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMasterGroup() {
  return { add: vi.fn(), on: vi.fn() }
}

function makeLayoutSettings(overrides: Partial<LayoutSettings> = {}): LayoutSettings {
  return {
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
    TimelineCanvasBackgroundColor: '#f1e7d5',
    TimelineShowNowLine: true,
    TimelineShowNowLineText: true,
    TimelineNowLineColor: '#f00',
    TimelineNowLineStyle: 'dashed',
    TimelineTickDistance: 100,
    TimelineTickWidth: 1,
    TimelineNonYearTicksSmaller: true,
    TimelineTickMarkerFontFamily: 'Arial',
    TimelineTickMarkerFontStyle: 'normal',
    TimelineTickMarkerTextColor: '#2a1a0e',
    TimelineTickMarkerFontSize: 14,
    TimelineTickMarkerTextAlwaysOnTop: false,
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
    ...overrides,
  }
}

// ── buildNode ─────────────────────────────────────────────────────────────────

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
})

// ── setNodeVisibility ─────────────────────────────────────────────────────────

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

// ── updateAbsolutePositions ───────────────────────────────────────────────────

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
