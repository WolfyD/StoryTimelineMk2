import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimelineStore } from '@/stores/timelineStore'
import type { TimelineItem, TimelineNote, LodLevel, CharacterItem, ItemCharacterLink } from '@/types/models'

// Silence console calls made inside the store
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// ── helpers ───────────────────────────────────────────────────────────────────

// The store's computed getters use lowercase `i.year` (matching the DB column name
// after Dapper's snake_case mapping). We provide both cases so tests work correctly.
function makeItem(overrides: Record<string, unknown> = {}): TimelineItem {
  const base: Record<string, unknown> = {
    Id: 'item-1',
    Title: 'Test Event',
    Description: '',
    Content: '',
    StoryId: null,
    TypeId: 1,
    Year: 1000,
    year: 1000, // lowercase key used by store computed filters
    EndYear: 1000,
    AbsoluteStart: 1000,
    AbsoluteEnd: 1000,
    BookTitle: '',
    Chapter: '',
    Page: '',
    Color: '#fff',
    CreationGranularity: 1,
    TimelineId: 1,
    ItemIndex: 0,
    ShowInNotes: true,
    Importance: 5,
    MinLodLevel: 3,
    LodVisibilityMask: 255,
  }
  // When caller passes Year override, mirror it to year as well
  const merged = { ...base, ...overrides }
  if ('Year' in overrides && !('year' in overrides)) {
    merged.year = overrides.Year
  }
  return merged as unknown as TimelineItem
}

function makeNote(overrides: Partial<TimelineNote> = {}): TimelineNote {
  return {
    Id: 'note-1',
    NoteContents: 'Hello world',
    ConnectedItemId: '',
    TimelineId: 1,
    NearestYear: 1000,
    AbsoluteTime: 1000.5,
    UpdatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeLodProfile(): LodLevel[] {
  return [
    { index: 0, formatKey: 'MILLENNIA', stepFraction: 1000 },
    { index: 1, formatKey: 'CENTURIES', stepFraction: 100 },
    { index: 2, formatKey: 'DECADES', stepFraction: 10 },
    { index: 3, formatKey: 'YEARS', stepFraction: 1 },
    { index: 4, formatKey: 'SEASONS', stepFraction: 0.25 },
    { index: 5, formatKey: 'MONTHS', stepFraction: 0.083 },
    { index: 6, formatKey: 'WEEKS', stepFraction: 0.019 },
    { index: 7, formatKey: 'DAYS', stepFraction: 0.00274 },
  ]
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('timelineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has empty items array', () => {
      const store = useTimelineStore()
      expect(store.items).toEqual([])
    })

    it('starts with currentNowYear = 0', () => {
      const store = useTimelineStore()
      expect(store.currentNowYear).toBe(0)
    })

    it('starts with isLoading = true', () => {
      const store = useTimelineStore()
      expect(store.isLoading).toBe(true)
    })

    it('starts with visibleItems = 0', () => {
      const store = useTimelineStore()
      expect(store.visibleItems).toBe(0)
    })

    it('starts with currentLodIndex = 3', () => {
      const store = useTimelineStore()
      expect(store.currentLodIndex).toBe(3)
    })

    it('starts with notes as empty array', () => {
      const store = useTimelineStore()
      expect(store.notes).toEqual([])
    })

    it('starts with distanceFrom = null', () => {
      const store = useTimelineStore()
      expect(store.distanceFrom).toBeNull()
    })

    it('starts with distanceTo = null', () => {
      const store = useTimelineStore()
      expect(store.distanceTo).toBeNull()
    })

    it('starts with notesDistanceTab = "notes"', () => {
      const store = useTimelineStore()
      expect(store.notesDistanceTab).toBe('notes')
    })

    it('starts with lastDeleted = null', () => {
      const store = useTimelineStore()
      expect(store.lastDeleted).toBeNull()
    })
  })

  // ── setNowYear ────────────────────────────────────────────────────────────

  describe('setNowYear', () => {
    it('updates currentNowYear', () => {
      const store = useTimelineStore()
      store.setNowYear(1500)
      expect(store.currentNowYear).toBe(1500)
    })

    it('accepts negative years', () => {
      const store = useTimelineStore()
      store.setNowYear(-500)
      expect(store.currentNowYear).toBe(-500)
    })
  })

  // ── setVisibleItems ───────────────────────────────────────────────────────

  describe('setVisibleItems', () => {
    it('updates visibleItems', () => {
      const store = useTimelineStore()
      store.setVisibleItems(42)
      expect(store.visibleItems).toBe(42)
    })
  })

  // ── setDistanceFrom / setDistanceTo ───────────────────────────────────────

  describe('setDistanceFrom', () => {
    it('sets a numeric value', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(1000.5)
      expect(store.distanceFrom).toBe(1000.5)
    })

    it('can be set to null', () => {
      const store = useTimelineStore()
      store.setDistanceFrom(1000)
      store.setDistanceFrom(null)
      expect(store.distanceFrom).toBeNull()
    })
  })

  describe('setDistanceTo', () => {
    it('sets a numeric value', () => {
      const store = useTimelineStore()
      store.setDistanceTo(2000)
      expect(store.distanceTo).toBe(2000)
    })

    it('can be set to null', () => {
      const store = useTimelineStore()
      store.setDistanceTo(2000)
      store.setDistanceTo(null)
      expect(store.distanceTo).toBeNull()
    })
  })

  // ── setNotesDistanceTab ───────────────────────────────────────────────────

  describe('setNotesDistanceTab', () => {
    it('switches to "distance"', () => {
      const store = useTimelineStore()
      store.setNotesDistanceTab('distance')
      expect(store.notesDistanceTab).toBe('distance')
    })

    it('switches back to "notes"', () => {
      const store = useTimelineStore()
      store.setNotesDistanceTab('distance')
      store.setNotesDistanceTab('notes')
      expect(store.notesDistanceTab).toBe('notes')
    })
  })

  // ── addItem / removeItem ──────────────────────────────────────────────────

  describe('addItem', () => {
    it('appends item to items array', () => {
      const store = useTimelineStore()
      const item = makeItem()
      store.addItem(item)
      expect(store.items).toHaveLength(1)
      expect(store.items[0].Id).toBe('item-1')
    })

    it('can add multiple items', () => {
      const store = useTimelineStore()
      store.addItem(makeItem({ Id: 'a' }))
      store.addItem(makeItem({ Id: 'b' }))
      expect(store.items).toHaveLength(2)
    })
  })

  describe('removeItem', () => {
    it('removes item by id', () => {
      const store = useTimelineStore()
      store.addItem(makeItem({ Id: 'keep' }))
      store.addItem(makeItem({ Id: 'delete-me' }))
      store.removeItem('delete-me')
      expect(store.items).toHaveLength(1)
      expect(store.items[0].Id).toBe('keep')
    })

    it('does nothing when id not found', () => {
      const store = useTimelineStore()
      store.addItem(makeItem({ Id: 'a' }))
      store.removeItem('nonexistent')
      expect(store.items).toHaveLength(1)
    })
  })

  // ── addNote / updateNote / removeNote ─────────────────────────────────────

  describe('addNote', () => {
    it('appends note and sorts by AbsoluteTime', () => {
      const store = useTimelineStore()
      const n1 = makeNote({ Id: 'n1', AbsoluteTime: 2000 })
      const n2 = makeNote({ Id: 'n2', AbsoluteTime: 1000 })
      store.addNote(n1)
      store.addNote(n2)
      expect(store.notes[0].Id).toBe('n2')
      expect(store.notes[1].Id).toBe('n1')
    })
  })

  describe('updateNote', () => {
    it('replaces the note with matching id', () => {
      const store = useTimelineStore()
      store.addNote(makeNote({ Id: 'n1', NoteContents: 'original' }))
      store.updateNote(makeNote({ Id: 'n1', NoteContents: 'updated' }))
      expect(store.notes[0].NoteContents).toBe('updated')
    })

    it('does nothing if id not found', () => {
      const store = useTimelineStore()
      store.addNote(makeNote({ Id: 'n1', NoteContents: 'original' }))
      store.updateNote(makeNote({ Id: 'unknown', NoteContents: 'x' }))
      expect(store.notes[0].NoteContents).toBe('original')
    })
  })

  describe('removeNote', () => {
    it('removes note by id', () => {
      const store = useTimelineStore()
      store.addNote(makeNote({ Id: 'n1' }))
      store.addNote(makeNote({ Id: 'n2' }))
      store.removeNote('n1')
      expect(store.notes).toHaveLength(1)
      expect(store.notes[0].Id).toBe('n2')
    })
  })

  // ── lastDeleted / clearLastDeleted ────────────────────────────────────────

  describe('setLastDeleted / clearLastDeleted', () => {
    it('setLastDeleted stores data', () => {
      const store = useTimelineStore()
      const item = makeItem()
      store.setLastDeleted({ item, tagNames: ['a'], characterAppearances: [], storyRefs: [], chapterRefs: [] })
      expect(store.lastDeleted).not.toBeNull()
      expect(store.lastDeleted!.item.Id).toBe('item-1')
    })

    it('clearLastDeleted sets lastDeleted to null', () => {
      const store = useTimelineStore()
      store.setLastDeleted({ item: makeItem(), tagNames: [], characterAppearances: [], storyRefs: [], chapterRefs: [] })
      store.clearLastDeleted()
      expect(store.lastDeleted).toBeNull()
    })
  })

  // ── lodZoomIn / lodZoomOut ────────────────────────────────────────────────

  describe('lodZoomIn', () => {
    it('increments currentLodIndex', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.lodZoomIn()
      expect(store.currentLodIndex).toBe(4)
    })

    it('does not exceed lodProfile length - 1', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 7 // already at max
      store.lodZoomIn()
      expect(store.currentLodIndex).toBe(7)
    })

    it('does nothing when lodProfile is empty', () => {
      const store = useTimelineStore()
      store.lodProfile = []
      store.lodZoomIn()
      expect(store.currentLodIndex).toBe(3) // unchanged
    })

    it('updates currentLodTitle to the new lod formatKey', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3 // YEARS
      store.lodZoomIn()
      expect(store.currentLodTitle).toBe('SEASONS')
    })
  })

  describe('lodZoomOut', () => {
    it('decrements currentLodIndex', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3
      store.lodZoomOut()
      expect(store.currentLodIndex).toBe(2)
    })

    it('does not go below 0', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 0
      store.lodZoomOut()
      expect(store.currentLodIndex).toBe(0)
    })

    it('is a no-op when lodProfile is empty', () => {
      // The guard is `if(!lodProfile.value?.length) return` — zooming through a
      // profile with no levels is meaningless, so the index must not change.
      const store = useTimelineStore()
      store.lodProfile = []
      store.currentLodIndex = 3
      store.lodZoomOut()
      expect(store.currentLodIndex).toBe(3)
    })

    it('updates currentLodTitle to the new lod formatKey', () => {
      const store = useTimelineStore()
      store.lodProfile = makeLodProfile()
      store.currentLodIndex = 3 // YEARS
      store.lodZoomOut()
      expect(store.currentLodTitle).toBe('DECADES')
    })
  })

  // ── pastItems / futureItems computed ──────────────────────────────────────

  describe('pastItems computed', () => {
    it('returns items where year < currentNowYear', () => {
      const store = useTimelineStore()
      store.setNowYear(1500)
      store.addItem(makeItem({ Id: 'past', Year: 1000 }))
      store.addItem(makeItem({ Id: 'future', Year: 2000 }))
      expect(store.pastItems.map(i => i.Id)).toEqual(['past'])
    })

    it('returns empty array when no past items', () => {
      const store = useTimelineStore()
      store.setNowYear(0)
      store.addItem(makeItem({ Id: 'only', Year: 1000 }))
      expect(store.pastItems).toHaveLength(0)
    })
  })

  describe('futureItems computed', () => {
    it('returns items where year >= currentNowYear', () => {
      const store = useTimelineStore()
      store.setNowYear(1500)
      store.addItem(makeItem({ Id: 'past', Year: 1000 }))
      store.addItem(makeItem({ Id: 'now', Year: 1500 }))
      store.addItem(makeItem({ Id: 'future', Year: 2000 }))
      const ids = store.futureItems.map(i => i.Id)
      expect(ids).toContain('now')
      expect(ids).toContain('future')
      expect(ids).not.toContain('past')
    })
  })

  // ── BL-15 phase 3: the appearances window ─────────────────────────────────

  describe('character focus', () => {
    const focus = { Id: 'c1', Name: 'Focus', BirthItemId: 'birth', DeathItemId: null } as unknown as CharacterItem

    it('turns away items the focused character has nothing to do with', () => {
      const store = useTimelineStore()
      store.characterFocus = focus

      store.upsertItem(makeItem({ Id: 'stranger' }))
      store.upsertItem(makeItem({ Id: 'theirs' }), undefined,
        [{ ItemId: 'theirs', CharacterId: 'c1' } as unknown as ItemCharacterLink])
      store.upsertItem(makeItem({ Id: 'birth' }))
      store.upsertItem(makeItem({ Id: 'start', TypeId: 8 }))   // a boundary belongs to everyone

      expect(store.items.map(i => i.Id).sort()).toEqual(['birth', 'start', 'theirs'])
    })

    it('takes everything when no character is focused', () => {
      const store = useTimelineStore()
      store.upsertItem(makeItem({ Id: 'stranger' }))
      expect(store.items.map(i => i.Id)).toEqual(['stranger'])
    })
  })
})
