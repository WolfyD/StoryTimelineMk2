<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { mediaUrl } from '@/utils/mediaUrl';
import { parseCalendarDef, parseCalendarConfig } from '@/utils/calendarDef'
import { holdDate, placeDate, type HeldDate } from '@/utils/lodDates'
import { DEFAULT_CALENDAR_CONFIG, type CalendarFormatConfig } from '@/utils/timelineLayout'
import { blankCharacter, characterEntity } from '@/utils/characterItems'
import HighlightedTextarea from '@/components/HighlightedTextarea.vue'
import { PhMagicWand } from '@phosphor-icons/vue'
import { BackendAPI, IS_BROWSER_HOST } from '@/bridge/api'
import { useShortcuts, MOD } from '@/utils/shortcuts'
import HelpModal from '@/components/HelpModal.vue'
import ShortcutsModal from '@/components/ShortcutsModal.vue'
import NotificationContainer from '@/components/NotificationContainer.vue'
import { useAppTheme } from '@/utils/useAppTheme'
import { DEFAULT_SWATCHES, loadSwatches } from '@/utils/timelinePrefs'
import LodMaskToggles from '@/components/LodMaskToggles.vue'
import { useLightbox } from '@/composables/useLightbox'
import LightboxOverlay from '@/components/LightboxOverlay.vue'
import WindowTitleBar from '@/components/WindowTitleBar.vue'
import LodDateInput from '@/components/LodDateInput.vue'
import ImagePickerModal from '@/components/ImagePickerModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import type {
  TimelineItem,
  MediaItem,
  Tag,
  CharacterItem,
  Story,
  Book,
  Chapter,
  ItemCharacterAppearance,
  ItemStoryRef,
  ItemChapterRef,
  LodLevel,
} from '@/types/models'

useAppTheme()

// ---------------------------------------------------------------------------
// URL params
// ---------------------------------------------------------------------------
const params            = new URLSearchParams(window.location.search)
const timelineId        = parseInt(params.get('timelineId') ?? '0')
const itemId            = params.get('itemId')           // null for new items
const defaultType       = parseInt(params.get('typeId') ?? '1')
const defaultAbsoluteTime = parseFloat(params.get('year') ?? '0') || 0
const defaultGranularity  = parseInt(params.get('granularity') ?? '3')

const isNew = ref(!itemId)

const ITEM_TYPES = [
  { id: 1, name: 'Event' },
  { id: 2, name: 'Period' },
  { id: 3, name: 'Age' },
  { id: 4, name: 'Picture' },
  { id: 5, name: 'Note' },
  { id: 6, name: 'Bookmark' },
  // The character window generates these; the option is here so an open one shows its own type.
  { id: 7, name: 'Character' },
]

// ---------------------------------------------------------------------------
// Core item state
// ---------------------------------------------------------------------------
const item = ref<TimelineItem>({
  Id: crypto.randomUUID(),
  Title: '',
  Description: '',
  Content: '',
  StoryId: null,
  TypeId: defaultType,
  Year: 0,
  EndYear: 0,
  AbsoluteStart: 0,
  AbsoluteEnd: 0,
  BookTitle: '',
  Chapter: '',
  Page: '',
  Color: '#4a90d9',
  CreationGranularity: 3,
  TimelineId: timelineId,
  ItemIndex: 0,
  Placement: 0,
  Centered: false,
  ShowTitle: false,
  OpenStart: false,
  OpenEnd: false,
  OpenFade: false,
  ItemNotes: '',
  ShowInNotes: true,
  Importance: 5,
  MinLodLevel: 3,
  LodVisibilityMask: 255,
})

// Separate start/end year+subYear refs (written back to item on save)
const startYear    = ref(0)
const startSubYear = ref(0)
const endYear      = ref(0)
const endSubYear   = ref(0)

// ---------------------------------------------------------------------------
// Associated data
// ---------------------------------------------------------------------------
const tags               = ref<Tag[]>([])
const characterAppearances = ref<ItemCharacterAppearance[]>([])
const storyRefs          = ref<ItemStoryRef[]>([])
const chapterRefs        = ref<ItemChapterRef[]>([])
const images             = ref<MediaItem[]>([])
const showImagePicker    = ref(false)

// Lookup data
const allCharacters   = ref<CharacterItem[]>([])
const allStories      = ref<Story[]>([])
const lodProfile      = ref<LodLevel[]>([])
const monthNames      = ref<string[]>([])
const monthLengths    = ref<number[]>([])
const seasonNames     = ref<string[]>([])
const weekCount       = ref<number>(52)
// The calendar's real month and season boundaries, which is where a sub-year date has to land.
const calendarConfig  = ref<CalendarFormatConfig>(DEFAULT_CALENDAR_CONFIG)
// The sub-year positions as loaded, so saving an untouched date leaves it exactly where it was.
const heldStart = ref<HeldDate | null>(null)
const heldEnd   = ref<HeldDate | null>(null)

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------
const isLoading         = ref(true)
const isSaving          = ref(false)
const isCharExpanded    = ref(true)
const isStoryExpanded   = ref(true)
const isNotesExpanded   = ref(false)
const saveError         = ref('')

// Tag autocomplete
const tagInputValue     = ref('')
const tagSuggestions    = ref<Tag[]>([])
const topTags           = ref<Tag[]>([])   // most-used tags of the timeline, offered as click-to-add chips
const suggestedTags     = computed(() => topTags.value.filter(t => !tags.value.some(x => x.Name === t.Name)))
let tagDebounce: ReturnType<typeof setTimeout>

// Lightbox
const { lightboxSrc, lightboxCollection, lightboxIndex, openLightbox, closeLightbox, lightboxPrev, lightboxNext, onLbBeforeEnter, onLbEnter, onLbBeforeLeave, onLbLeave } = useLightbox()

// Character picker
const showCharPicker     = ref(false)
const charPickerFilter   = ref('')
const pendingCharId      = ref('')
const pendingCharRole    = ref('')
const creatingChar       = ref(false)
// Characters the user took off this item. The matcher skips them, so a deleted link stays deleted.
const dismissedChars     = ref(new Set<string>())

const charEntities = computed(() => allCharacters.value.map(characterEntity))

// Story picker
const showStoryPicker    = ref(false)

// Book / chapter
const bookSearchValue    = ref('')
const bookSuggestions    = ref<Book[]>([])
const selectedBook       = ref<Book | null>(null)
const bookChapters       = ref<Chapter[]>([])
const selectedChapterId  = ref('')
let bookDebounce: ReturnType<typeof setTimeout>

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------
const isRangeType = computed(() => item.value.TypeId === 2 || item.value.TypeId === 3)
// Types drawn without a side of the axis (mirrors ItemRepo.SaveItemFull)
const hasSide     = computed(() => ![3, 6, 8, 9].includes(item.value.TypeId))
// Types drawn as a box on a stem — the only ones "Centered" changes (events, notes)
const hasStemBox  = computed(() => item.value.TypeId === 1 || item.value.TypeId === 5)
// BL-72: only a span can run off the edge. Period and Age are the two drawn as a bar.
const hasOpenEnds = computed(() => item.value.TypeId === 2 || item.value.TypeId === 3)

const filteredCharacters = computed(() => {
  const q = charPickerFilter.value.toLowerCase()
  const linked = new Set(characterAppearances.value.map(a => a.CharacterId))
  return allCharacters.value
    .filter(c => !linked.has(c.Id))
    .filter(c => !q || c.Name.toLowerCase().includes(q))
})

// Given a fractional year position (0..1) and the calendar's LOD profile, find the
// coarsest sub-year LOD that can represent the position without ambiguity.
// Tries seasons, then months; falls back to the finest available (days = month+day).
function findBestSubYearLod(frac: number, profile: LodLevel[]): number {
    const lods = profile
        .filter(l => l.stepFraction > 0 && l.stepFraction < 1)
        .sort((a, b) => b.stepFraction - a.stepFraction) // coarsest first
    for (const lod of lods) {
        if (lod.stepFraction < 0.05) break // stop before weeks / days in this pass
        const nearest = Math.round(frac / lod.stepFraction) * lod.stepFraction
        // "Close" = within 25% of one step from the nearest tick
        if (Math.abs(frac - nearest) <= lod.stepFraction * 0.25) return lod.index
    }
    return lods[lods.length - 1]?.index ?? 5 // finest available (days shows month+day)
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function loadData(tId: number, iId: string | null, dtype: number, absTime: number, gran: number) {
  // Immediately reset to loading state — old content disappears in one frame,
  // no waiting for navigation or V8 re-init.
  isLoading.value = true
  isNew.value = !iId
  item.value = {
    Id: crypto.randomUUID(),
    Title: '',
    Description: '',
    Content: '',
    StoryId: null,
    TypeId: dtype,
    Year: 0,
    EndYear: 0,
    AbsoluteStart: 0,
    AbsoluteEnd: 0,
    BookTitle: '',
    Chapter: '',
    Page: '',
    Color: '#4a90d9',
    CreationGranularity: 3,
    TimelineId: tId,
    ItemIndex: 0,
    Placement: 0,
    Centered: false,
    ShowTitle: false,
    OpenStart: false,
    OpenEnd: false,
    OpenFade: false,
    ItemNotes: '',
    ShowInNotes: true,
    Importance: 5,
    MinLodLevel: 3,
    LodVisibilityMask: 255,
  }
  startYear.value    = 0
  startSubYear.value = 0
  endYear.value      = 0
  endSubYear.value   = 0
  tags.value               = []
  characterAppearances.value = []
  storyRefs.value          = []
  chapterRefs.value        = []
  images.value             = []
  lodProfile.value         = []
  monthNames.value         = []
  monthLengths.value       = []
  seasonNames.value        = []
  weekCount.value          = 52
  heldStart.value          = null
  heldEnd.value            = null
  showImagePicker.value    = false
  showCharPicker.value     = false
  showStoryPicker.value    = false
  charPickerFilter.value   = ''
  pendingCharId.value      = ''
  pendingCharRole.value    = ''
  bookSearchValue.value    = ''
  bookSuggestions.value    = []
  selectedBook.value       = null
  bookChapters.value       = []
  selectedChapterId.value  = ''
  tagInputValue.value      = ''
  tagSuggestions.value     = []
  topTags.value            = []
  saveError.value          = ''
  isSaving.value           = false

  try {
    const [data, characters, stories] = await Promise.all([
      BackendAPI.GetItemForEdit(tId, iId, dtype),
      BackendAPI.GetTimelineCharacters(tId),
      BackendAPI.GetAllStories(),
    ])

    if (data) {
      if (!isNew.value) {
        item.value = data.Item
      } else {
        item.value.TimelineId = tId
        item.value.TypeId = dtype
        item.value.CreationGranularity = gran
        if (data.Item?.Color) item.value.Color = data.Item.Color
        if (data.Item?.LodVisibilityMask != null) item.value.LodVisibilityMask = data.Item.LodVisibilityMask   // timeline's default for new items
        if (absTime) {
          item.value.Year          = Math.floor(absTime)
          item.value.EndYear       = item.value.Year
          item.value.AbsoluteStart = absTime
          item.value.AbsoluteEnd   = absTime
        }
      }

      tags.value               = data.Tags ?? []
      characterAppearances.value = data.Characters ?? []
      dismissedChars.value = new Set(data.Dismissals ?? [])
      storyRefs.value          = data.StoryRefs ?? []
      chapterRefs.value        = data.ChapterRefs ?? []
      images.value             = data.Pictures ?? []

      if (data.Calendar) {
        // Extract LOD profile (it comes as a raw JSON string in LodProfile.Profile)
        const rawProfile = data.Calendar.LodProfile?.Profile
        if (rawProfile) {
          lodProfile.value = typeof rawProfile === 'string'
            ? JSON.parse(rawProfile)
            : rawProfile as unknown as LodLevel[]
        }
        const yearDef = data.Calendar.YearDefinition ?? ''
        const calDef = parseCalendarDef(yearDef)
        monthNames.value   = calDef.monthNames
        monthLengths.value = calDef.monthLengths
        seasonNames.value  = calDef.seasonNames
        weekCount.value    = calDef.weekCount
        calendarConfig.value = parseCalendarConfig(yearDef)
      }

      // For new items: choose the best granularity to represent the canvas position.
      // If the canvas LOD is year-level or coarser (step >= 1), pick the right sub-year LOD
      // based on how close the fraction is to a recognisable tick (season → month → days).
      if (isNew.value && absTime) {
        const frac = absTime - Math.floor(absTime)
        if (frac > 0.001) {
          const curLod = lodProfile.value.find(l => l.index === item.value.CreationGranularity)
          if (!curLod || curLod.stepFraction >= 1) {
            item.value.CreationGranularity = findBestSubYearLod(frac, lodProfile.value)
          }
        }
      }

      // Derive sub-year UI position from AbsoluteStart/AbsoluteEnd, then sync date fields. Hold on
      // to both, so a save that does not touch them cannot move the item.
      {
        const g = item.value.CreationGranularity
        const cal = calendarConfig.value
        heldStart.value = holdDate(item.value.AbsoluteStart, item.value.Year, g, lodProfile.value, cal)
        heldEnd.value   = holdDate(item.value.AbsoluteEnd, item.value.EndYear, g, lodProfile.value, cal)
        startSubYear.value = heldStart.value.subtick
        endSubYear.value   = heldEnd.value.subtick
      }
      startYear.value = item.value.Year
      endYear.value   = item.value.EndYear
    }

    allCharacters.value = characters ?? []
    allStories.value    = stories ?? []

    BackendAPI.GetTopTags(tId, 8).then(results => { topTags.value = results ?? [] })
    loadSwatches(tId).then(s => { swatches.value = s })
  } catch (err) {
    console.error('[EditItem] loadData error:', err)
  } finally {
    cleanSnapshot = snapshot()
    isLoading.value = false
    await nextTick()
    titleRef.value?.focus()
  }
}

// ---------------------------------------------------------------------------
// Dirty tracking / close confirmation
// ---------------------------------------------------------------------------
let cleanSnapshot = ''
const showDiscard = ref(false)

function snapshot() {
  return JSON.stringify([
    item.value, startYear.value, startSubYear.value, endYear.value, endSubYear.value,
    tags.value.map(t => t.Name), characterAppearances.value, storyRefs.value, chapterRefs.value,
  ])
}

const isDirty = () => snapshot() !== cleanSnapshot

// BL-87: the host reuses this one window for whatever item is opened next, so a second open takes
// the editor over. Set, it means the confirmation below is about that takeover and not about closing.
const pendingLoad = ref<Record<string, unknown> | null>(null)

// Cancel, the window's X and Escape all land here; C# only closes once we send WindowClose.
function requestClose() {
  if (isDirty()) showDiscard.value = true
  else BackendAPI.WindowClose()
}

// The form is hidden, not destroyed, so leave no stale modal behind for the next LoadItem.
function discard() {
  showDiscard.value = false
  const p = pendingLoad.value
  pendingLoad.value = null
  if (p) applyLoad(p)
  else BackendAPI.WindowClose()
}

function keepEditing() {
  showDiscard.value = false
  pendingLoad.value = null
}

const discardTitle   = computed(() => pendingLoad.value ? 'Open the other item?' : 'Discard changes?')
const discardMessage = computed(() => pendingLoad.value
  ? 'The editor shows one item at a time, and this one has unsaved changes.'
  : 'This item has unsaved changes.')
const discardConfirm = computed(() => pendingLoad.value ? 'Discard and open' : 'Discard')

// In a browser the tab's own close, Cmd/Ctrl+W and Back never reach requestClose(), so an
// unsaved item went with them silently. The desktop host routes its X through requestClose
// already and would only stack a second prompt on top, so this is the browser's guard alone.
function warnIfDirty(e: BeforeUnloadEvent) {
  if (!isDirty()) return
  e.preventDefault()
  e.returnValue = ''   // Safari and older Chromium still read this rather than preventDefault
}
if (IS_BROWSER_HOST) {
  onMounted(() => window.addEventListener('beforeunload', warnIfDirty))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', warnIfDirty))
}

// ---------------------------------------------------------------------------
// Keyboard (BL-39) — the registry in utils/shortcuts.ts is the source of truth
// ---------------------------------------------------------------------------
const showHelp      = ref(false)
const showShortcuts = ref(false)
const titleRef      = ref<HTMLInputElement | null>(null)
const descRef       = ref<InstanceType<typeof HighlightedTextarea> | null>(null)
const endDateRef    = ref<InstanceType<typeof LodDateInput> | null>(null)
const tagInputRef   = ref<HTMLInputElement | null>(null)

// Tab walks the writer's path; anywhere else Tab keeps its native order.
function tabPath(e: KeyboardEvent) {
  const endYear = (endDateRef.value?.$el as HTMLElement | undefined)?.querySelector<HTMLInputElement>('input')
  const path = [titleRef.value, descRef.value?.el, endYear, tagInputRef.value].filter((el): el is HTMLInputElement | HTMLTextAreaElement => !!el)
  const i = path.indexOf(document.activeElement as HTMLInputElement)
  const next = i < 0 ? undefined : path[i + (e.shiftKey ? -1 : 1)]
  if (!next) return false
  next.focus()
  if (next.type !== 'number') next.select()
}

function saveShortcut() { if (!isSaving.value) save() }
useShortcuts('edit', {
  save: saveShortcut,
  saveEnter: saveShortcut,
  cancel: () => {
    if (showImagePicker.value || showCharPicker.value || showStoryPicker.value) {
      showImagePicker.value = showCharPicker.value = showStoryPicker.value = false
    } else {
      requestClose()
    }
  },
  tabPath,
  help: () => { showHelp.value = true },
  shortcuts: () => { showShortcuts.value = true },
})

// Receives push messages from C# when the window is reused without page reload.
function handlePushMessage(event: MessageEvent) {
  let data: any
  try { data = JSON.parse(event.data) } catch { return }
  if (data.action === 'CloseRequested') { requestClose(); return }
  if (data.action !== 'LoadItem') return
  const p = data.payload ?? {}
  // Taking the window over drops whatever is half-typed here — the same question the X asks.
  if (isDirty()) { pendingLoad.value = p; showDiscard.value = true; return }
  showDiscard.value = false
  applyLoad(p)
}

function applyLoad(p: Record<string, any>) {
  loadData(
    p.timelineId ?? timelineId,
    p.itemId ?? null,
    p.typeId  ?? defaultType,
    p.year    ?? 0,
    p.granularity ?? defaultGranularity,
  )
}

// ---- Color helpers ----
const swatches = ref<string[]>([...DEFAULT_SWATCHES])   // per-timeline quick-pick colors, see Timeline Settings
const paletteOpen = ref(false)
function randomColor() {
  item.value.Color = '#' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')
}
function closePaletteOutside(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.color-palette-wrap')) paletteOpen.value = false
}

onMounted(() => {
  loadData(timelineId, itemId, defaultType, defaultAbsoluteTime, defaultGranularity)
  window.chrome?.webview?.addEventListener('message', handlePushMessage)
  document.addEventListener('mousedown', closePaletteOutside)
})

onBeforeUnmount(() => {
  window.chrome?.webview?.removeEventListener('message', handlePushMessage)
  document.removeEventListener('mousedown', closePaletteOutside)
})

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
function onTagInput(e: Event) {
  tagInputValue.value = (e.target as HTMLInputElement).value
  clearTimeout(tagDebounce)
  if (tagInputValue.value.length < 1) { tagSuggestions.value = []; return }
  tagDebounce = setTimeout(async () => {
    tagSuggestions.value = (await BackendAPI.SearchTags(tagInputValue.value)) ?? []
  }, 200)
}

async function onTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTagByName(tagInputValue.value)
  }
}

function addTagByName(name: string) {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return
  if (tags.value.some(t => t.Name === trimmed)) return
  tags.value.push({ Id: 0, Name: trimmed })
  tagInputValue.value = ''
  tagSuggestions.value = []
}

function addTagFromSuggestion(tag: Tag) {
  if (tags.value.some(t => t.Name === tag.Name)) return
  tags.value.push(tag)
  tagInputValue.value = ''
  tagSuggestions.value = []
}

function removeTag(index: number) {
  tags.value.splice(index, 1)
}

function dismissTagSuggestions() {
  setTimeout(() => { tagSuggestions.value = [] }, 150)
}


// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------
function openCharPicker() {
  pendingCharId.value   = ''
  pendingCharRole.value = ''
  charPickerFilter.value = ''
  showCharPicker.value   = true
}

function confirmAddCharacter() {
  if (!pendingCharId.value) return
  const char = allCharacters.value.find(c => c.Id === pendingCharId.value)
  if (!char) return
  characterAppearances.value.push({
    CharacterId: char.Id,
    CharacterName: char.Name,
    CharacterColor: char.Color,
    Role: pendingCharRole.value || null,
  })
  dismissedChars.value.delete(char.Id)   // added by hand: the save clears the stored dismissal too
  showCharPicker.value = false
}

function removeCharacterAppearance(index: number) {
  const [removed] = characterAppearances.value.splice(index, 1)
  if (!removed) return
  // Whether it was detected or added by hand, taking it off is an answer: remember it, or the
  // next blur puts it straight back.
  dismissedChars.value.add(removed.CharacterId)
  BackendAPI.DismissCharacterLink(item.value.Id, removed.CharacterId).catch(err => {
    saveError.value = `Could not remember that removal: ${err}`
    console.error('[EditItem] DismissCharacterLink error:', err)
  })
}

/**
 * Names found in the text attach themselves when the field loses focus — on blur rather than per
 * keystroke, so the list does not reshuffle mid-sentence.
 */
function attachDetectedCharacters(ids: string[]) {
  for (const id of ids) {
    if (dismissedChars.value.has(id)) continue
    if (characterAppearances.value.some(a => a.CharacterId === id)) continue
    const char = allCharacters.value.find(c => c.Id === id)
    if (!char) continue
    characterAppearances.value.push({
      CharacterId: char.Id,
      CharacterName: char.Name,
      CharacterColor: char.Color,
      Role: null,
      AutoDetected: true,
    })
  }
}

function characterInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/** The portrait of an already-linked character: the appearance row only carries name and color. */
function portraitOf(characterId: string) {
  return allCharacters.value.find(c => c.Id === characterId)?.PortraitPath ?? null
}

/**
 * Invent a character without leaving the editor. What was typed into the filter becomes the name,
 * and the backend splits it into first and last — the same path the importer uses.
 */
async function createCharacterFromFilter() {
  const name = charPickerFilter.value.trim()
  if (!name || creatingChar.value) return
  creatingChar.value = true
  try {
    const result = await BackendAPI.SaveCharacter({ ...blankCharacter(timelineId), Name: name })
    if (result?.status !== 'ok') throw new Error('The character was not saved.')
    allCharacters.value.push(result.character)
    pendingCharId.value    = result.character.Id
    charPickerFilter.value = ''
  } catch (err) {
    saveError.value = `Could not create the character: ${err}`
    console.error('[EditItem] createCharacter error:', err)
  } finally {
    creatingChar.value = false
  }
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------
function toggleStory(story: Story) {
  const idx = storyRefs.value.findIndex(r => r.StoryId === story.Id)
  if (idx >= 0) {
    storyRefs.value.splice(idx, 1)
  } else {
    storyRefs.value.push({ StoryId: story.Id, StoryTitle: story.Title })
  }
}

function isStoryLinked(storyId: string) {
  return storyRefs.value.some(r => r.StoryId === storyId)
}

function removeStoryRef(index: number) {
  storyRefs.value.splice(index, 1)
}

// ---------------------------------------------------------------------------
// Books / chapters
// ---------------------------------------------------------------------------
function onBookSearchInput(e: Event) {
  bookSearchValue.value = (e.target as HTMLInputElement).value
  clearTimeout(bookDebounce)
  selectedBook.value = null
  bookChapters.value = []
  selectedChapterId.value = ''
  if (bookSearchValue.value.length < 1) { bookSuggestions.value = []; return }
  bookDebounce = setTimeout(async () => {
    bookSuggestions.value = (await BackendAPI.SearchBooks(bookSearchValue.value)) ?? []
  }, 250)
}

async function selectBook(book: Book) {
  selectedBook.value    = book
  bookSearchValue.value = book.Title
  bookSuggestions.value = []
  bookChapters.value    = (await BackendAPI.GetBookChapters(book.Id)) ?? []
  selectedChapterId.value = ''
}

function addChapterRef() {
  if (!selectedBook.value || !selectedChapterId.value) return
  if (chapterRefs.value.some(r => r.ChapterId === selectedChapterId.value)) return
  const chapter = bookChapters.value.find(c => c.Id === selectedChapterId.value)
  if (!chapter) return
  chapterRefs.value.push({
    ChapterId: chapter.Id,
    ChapterNumber: chapter.Number,
    ChapterTitle: chapter.Title,
    BookId: selectedBook.value.Id,
    BookTitle: selectedBook.value.Title,
  })
  selectedChapterId.value = ''
}

function removeChapterRef(index: number) {
  chapterRefs.value.splice(index, 1)
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
async function save(closeOnSuccess = true) {
  saveError.value = ''
  isSaving.value = true

  // Write split date fields back to item and compute absolute positions
  item.value.Year    = startYear.value
  item.value.EndYear = isRangeType.value ? endYear.value : startYear.value

  const g = item.value.CreationGranularity
  const cal = calendarConfig.value
  const endSub = isRangeType.value ? endSubYear.value : startSubYear.value
  item.value.AbsoluteStart =
      placeDate(item.value.Year, startSubYear.value, g, heldStart.value, lodProfile.value, cal) ?? 0
  item.value.AbsoluteEnd =
      placeDate(item.value.EndYear, endSub, g, isRangeType.value ? heldEnd.value : heldStart.value,
                lodProfile.value, cal) ?? 0

  try {
    const result = await BackendAPI.SaveItem(
      item.value,
      tags.value.map(t => t.Name),
      characterAppearances.value.map(a => ({
        CharacterId: a.CharacterId, Role: a.Role, AutoDetected: !!a.AutoDetected,
      })),
      storyRefs.value.map(r => r.StoryId),
      chapterRefs.value.map(r => r.ChapterId),
    )

    if (result?.status === 'ok') {
      isNew.value = false
      item.value.Id = result.itemId
      cleanSnapshot = snapshot()
      if (closeOnSuccess) window.close()
    } else {
      saveError.value = (result as { message?: string })?.message ?? 'Save failed'
    }
  } catch (err) {
    saveError.value = String(err)
  } finally {
    isSaving.value = false
  }
}

function cancel() {
  requestClose()
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
async function addImage() {
  if (isNew.value) {
    await save(false)
    if (saveError.value) return
  }
  showImagePicker.value = true
}

function onImageLinked(pictures: MediaItem[]) {
  for (const picture of pictures) {
    if (!images.value.some(i => i.Id === picture.Id)) {
      images.value.push(picture)
    }
  }
  showImagePicker.value = false
}

async function removeImage(pictureId: string) {
  await BackendAPI.RemoveImageFromItem(pictureId, item.value.Id)
  images.value = images.value.filter(img => img.Id !== pictureId)
}
</script>

<template>
  <div class="edit-item-root" v-if="!isLoading">

    <WindowTitleBar
        :title="item.Title || (ITEM_TYPES.find(t => t.id === item.TypeId)?.name ?? 'Edit Item')"
        :show-maximize="false"
        :close-handler="requestClose"
    />

    <div class="edit-item-content">

    <!-- ===== HEADER ===== -->
    <div class="section header-section">
      <div class="header-row">
        <span class="type-pill">
          {{ ITEM_TYPES.find(t => t.id === item.TypeId)?.name ?? 'Item' }}
        </span>
        <div class="header-actions">
          <button class="btn btn-primary" :disabled="isSaving" @click="save()">
            {{ isSaving ? 'Saving…' : 'Save' }}
            <small class="btn-hint">{{ MOD }}+S</small>
          </button>
          <button class="btn btn-secondary" @click="cancel">
            Cancel
            <small class="btn-hint">Esc</small>
          </button>
        </div>
        <span class="item-id-label">{{ isNew ? '' : item.Id.slice(0, 8) }}</span>
      </div>
      <p v-if="saveError" class="save-error">{{ saveError }}</p>

      <div class="field">
        <label>Title</label>
        <input ref="titleRef" type="text" v-model="item.Title" placeholder="Item title" />
      </div>

      <div class="row">
        <div class="field flex-1">
          <label>Description</label>
          <HighlightedTextarea
            ref="descRef"
            v-model="item.Description"
            :entities="charEntities"
            :rows="7"
            placeholder="Short description"
            @matched="attachDetectedCharacters"
          />
        </div>
        <div class="field color-field">
          <label>Color</label>
          <div class="color-row">
            <input type="color" v-model="item.Color" />
            <button type="button" class="color-tool" title="Random" @click="randomColor"><i class="ri-shuffle-line" /></button>
            <div class="color-palette-wrap">
              <button type="button" class="color-tool" :class="{ open: paletteOpen }" title="Palette" @click="paletteOpen = !paletteOpen"><i class="ri-arrow-down-s-line" /></button>
              <div v-if="paletteOpen" class="color-palette">
                <button
                  v-for="c in swatches" :key="c" type="button" class="color-swatch"
                  :class="{ active: item.Color?.toLowerCase() === c }" :style="{ background: c }" :title="c"
                  @click="item.Color = c; paletteOpen = false" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== BODY ===== -->
    <div class="body-grid">

      <!-- Left: date range -->
      <div class="section range-section">
        <h3 class="section-title">Date &amp; Range</h3>

        <!-- Row 1: Type + Granularity -->
        <div class="row">
          <div class="field flex-1">
            <label>Type</label>
            <select v-model="item.TypeId">
              <option
                v-for="t in ITEM_TYPES"
                :key="t.id"
                :value="t.id"
                :disabled="t.id === 7 && item.TypeId !== 7"
              >{{ t.name }}</option>
            </select>
          </div>

          <div class="field flex-1">
            <label>Date granularity</label>
            <select v-model="item.CreationGranularity">
              <option v-for="lod in lodProfile" :key="lod.index" :value="lod.index">
                {{ lod.formatKey }}
              </option>
            </select>
          </div>
        </div>

        <!-- Row 2: LOD visibility -->
        <div class="row">
          <div class="field" style="flex: 1;">
            <label>Visible at LOD levels</label>
            <LodMaskToggles v-model="item.LodVisibilityMask" :lodProfile="lodProfile" />
          </div>
        </div>

        <!-- Start date -->
        <div class="date-row">
          <LodDateInput
            label="Start"
            :lodIndex="item.CreationGranularity"
            :lodProfile="lodProfile"
            :monthNames="monthNames"
            :monthLengths="monthLengths"
            :seasonNames="seasonNames"
            :weekCount="weekCount"
            :year="startYear"
            :subtick="startSubYear"
            @update:year="startYear = $event"
            @update:subtick="startSubYear = $event"
          />
        </div>

        <!-- End date (only for Period / Age) -->
        <div v-if="isRangeType" class="date-row">
          <LodDateInput
            ref="endDateRef"
            label="End"
            :lodIndex="item.CreationGranularity"
            :lodProfile="lodProfile"
            :monthNames="monthNames"
            :monthLengths="monthLengths"
            :seasonNames="seasonNames"
            :weekCount="weekCount"
            :year="endYear"
            :subtick="endSubYear"
            @update:year="endYear = $event"
            @update:subtick="endSubYear = $event"
          />
        </div>
      </div>

      <!-- Right: specifics -->
      <div class="section specifics-section">
        <h3 class="section-title">Details</h3>

        <div class="field">
          <label>Content</label>
          <HighlightedTextarea
            v-model="item.Content"
            :entities="charEntities"
            :rows="5"
            placeholder="Full content / notes…"
            @matched="attachDetectedCharacters"
          />
        </div>

        <div class="row">
          <div class="field flex-1">
            <label>Importance ({{ item.Importance }})</label>
            <input type="range" v-model.number="item.Importance" min="1" max="10" step="1" />
          </div>
          <div class="field checkbox-field">
            <label>
              <input type="checkbox" v-model="item.ShowInNotes" />
              Show in notes
            </label>
          </div>
        </div>

        <div class="row" v-if="hasSide || hasStemBox || hasOpenEnds || item.TypeId === 4">
          <!-- Side of the axis. Auto sends 0 and the backend picks the emptier side again on save -->
          <div class="field" v-if="hasSide">
            <label>Side</label>
            <div class="seg-btns">
              <button
                v-for="(name, v) in ['Auto', 'Above', 'Below']"
                :key="name"
                type="button"
                class="seg-btn"
                :class="{ active: (item.Placement ?? 0) === v }"
                @click="item.Placement = v"
              >{{ name }}</button>
            </div>
          </div>
          <div class="field checkbox-field" v-if="hasStemBox" title="Center the box on its stem instead of offsetting it to one side">
            <label>
              <input type="checkbox" v-model="item.Centered" />
              Centered
            </label>
          </div>
          <div class="field checkbox-field" v-if="item.TypeId === 4" title="Draw the title as a caption strip along the bottom of the picture">
            <label>
              <input type="checkbox" v-model="item.ShowTitle" />
              Show title
            </label>
          </div>
          <div class="field checkbox-field" v-if="hasOpenEnds" title="It began before this — draw an arrow off the left instead of a hard edge, so the timeline needn't stretch back to say so">
            <label>
              <input type="checkbox" v-model="item.OpenStart" />
              Open start
            </label>
          </div>
          <div class="field checkbox-field" v-if="hasOpenEnds" title="It carries on after this — draw an arrow off the right instead of a hard edge">
            <label>
              <input type="checkbox" v-model="item.OpenEnd" />
              Open end
            </label>
          </div>
          <div class="field checkbox-field" v-if="hasOpenEnds && (item.OpenStart || item.OpenEnd)" title="Trail the open side off instead of ending it flat: half-transparent at the arrow's point, full color a year in">
            <label>
              <input type="checkbox" v-model="item.OpenFade" />
              Fade out
            </label>
          </div>
        </div>

        <!-- Tags -->
        <div class="field spaced-field">
          <label>Tags</label>
          <div class="tag-input-wrap">
            <div class="tag-chips">
              <span class="chip" v-for="(tag, i) in tags" :key="tag.Name">
                {{ tag.Name }}
                <button class="chip-remove" @click="removeTag(i)">×</button>
              </span>
              <input
                ref="tagInputRef"
                type="text"
                class="tag-inline-input"
                v-model="tagInputValue"
                placeholder="Add tag…"
                @input="onTagInput"
                @keydown="onTagKeydown"
                @blur="dismissTagSuggestions"
              />
            </div>
            <div class="suggestions" v-if="tagSuggestions.length">
              <div
                class="suggestion-item"
                v-for="s in tagSuggestions"
                :key="s.Id"
                @mousedown.prevent="addTagFromSuggestion(s)"
              >{{ s.Name }}</div>
            </div>
          </div>
          <!-- Most-used tags of this timeline, minus the ones already on the item -->
          <div class="top-tags" v-if="suggestedTags.length">
            <button type="button" class="chip chip-suggest" v-for="t in suggestedTags" :key="t.Id" @click="addTagFromSuggestion(t)">+ {{ t.Name }}</button>
          </div>
        </div>

      </div>
    </div>

    <!-- ===== FOOTER ===== -->
    <div class="footer-sections">

      <!-- Images -->
      <div class="section">
        <h3 class="section-title">Images</h3>

        <div class="image-grid" v-if="images.length">
          <div class="image-thumb" v-for="img in images" :key="img.Id">
            <img
              :src="mediaUrl(img.ThumbPath)"
              :alt="img.Title || img.FileName"
              @error="($event.target as HTMLImageElement).src = ''"
              class="image-thumb-img"
              @click="openLightbox($event, mediaUrl(img.FilePath), images.map(i => mediaUrl(i.FilePath)))"
            />
            <div class="image-thumb-footer">
              <span class="image-label" :title="img.Title || img.FileName">
                {{ img.Title || img.FileName }}
              </span>
              <button class="btn-icon btn-icon--danger" @click="removeImage(img.Id)" title="Remove">×</button>
            </div>
          </div>
        </div>
        <p v-else class="placeholder-note">No images attached.</p>
        <button class="btn btn-secondary btn-sm mt-6" @click="addImage">+ Add Image</button>

        <ImagePickerModal
          v-if="showImagePicker"
          :item-id="item.Id"
          :already-linked="images.map(i => i.Id)"
          @close="showImagePicker = false"
          @linked="onImageLinked"
        />
      </div>

      <!-- Item notes (BL-51): private bookkeeping — saved and exported, never drawn anywhere -->
      <div class="section collapsible-section item-notes">
        <div class="collapsible-header" @click="isNotesExpanded = !isNotesExpanded">
          <h3 class="section-title">Item Notes</h3>
          <span class="collapse-toggle">{{ isNotesExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-if="isNotesExpanded" class="collapsible-body field">
          <textarea v-model="item.ItemNotes" rows="5" placeholder="Item notes are not displayed on the timeline or in the data panel." />
        </div>
      </div>

      <!-- Characters -->
      <div class="section collapsible-section">
        <div class="collapsible-header" @click="isCharExpanded = !isCharExpanded">
          <h3 class="section-title">Characters</h3>
          <span class="collapse-toggle">{{ isCharExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-if="isCharExpanded" class="collapsible-body">
          <div class="char-list">
            <div class="char-ref" v-for="(app, i) in characterAppearances" :key="app.CharacterId">
              <div
                class="char-avatar"
                :style="{ backgroundColor: app.CharacterColor || '#7c8cbe' }"
              >
                <img v-if="portraitOf(app.CharacterId)" :src="mediaUrl(portraitOf(app.CharacterId)!)" :alt="app.CharacterName" />
                <template v-else>{{ characterInitials(app.CharacterName) }}</template>
              </div>
              <div class="char-info">
                <span class="char-name">
                  {{ app.CharacterName }}
                  <span v-if="app.AutoDetected" class="char-auto" title="Found in this item's text"><PhMagicWand :size="12" /></span>
                </span>
                <input
                  class="char-role-input"
                  type="text"
                  :value="app.Role ?? ''"
                  placeholder="Role / connection…"
                  @input="app.Role = ($event.target as HTMLInputElement).value || null"
                />
              </div>
              <button class="btn-icon" @click="removeCharacterAppearance(i)">×</button>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" @click="openCharPicker">+ Add character</button>

          <!-- Character picker overlay -->
          <div class="picker-overlay" v-if="showCharPicker">
            <div class="picker-panel">
              <div class="picker-header">
                <span>Select character</span>
                <button class="btn-icon" @click="showCharPicker = false">×</button>
              </div>
              <input
                type="text"
                class="picker-search"
                v-model="charPickerFilter"
                placeholder="Filter…"
              />
              <div class="picker-list">
                <div
                  class="picker-item"
                  v-for="c in filteredCharacters"
                  :key="c.Id"
                  :class="{ selected: pendingCharId === c.Id }"
                  @click="pendingCharId = c.Id"
                >
                  <div
                    class="char-avatar sm"
                    :style="{ backgroundColor: c.Color || '#7c8cbe' }"
                  >
                    <img v-if="c.PortraitPath" :src="mediaUrl(c.PortraitPath)" :alt="c.Name" />
                    <template v-else>{{ characterInitials(c.Name) }}</template>
                  </div>
                  {{ c.Name }}
                </div>
                <p v-if="!filteredCharacters.length" class="picker-empty">
                  {{ charPickerFilter.trim() ? 'No one by that name yet.' : 'No characters found.' }}
                </p>
              </div>
              <div class="picker-role">
                <input type="text" v-model="pendingCharRole" placeholder="Role / connection (optional)" />
              </div>
              <div class="picker-footer">
                <button
                  v-if="charPickerFilter.trim()"
                  class="btn btn-secondary btn-sm picker-new"
                  :disabled="creatingChar"
                  @click="createCharacterFromFilter"
                >+ New &ldquo;{{ charPickerFilter.trim() }}&rdquo;</button>
                <button class="btn btn-secondary btn-sm" @click="showCharPicker = false">Cancel</button>
                <button class="btn btn-primary btn-sm" :disabled="!pendingCharId" @click="confirmAddCharacter">Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stories & Books -->
      <div class="section collapsible-section">
        <div class="collapsible-header" @click="isStoryExpanded = !isStoryExpanded">
          <h3 class="section-title">Stories &amp; Books</h3>
          <span class="collapse-toggle">{{ isStoryExpanded ? '▲' : '▼' }}</span>
        </div>
        <div v-if="isStoryExpanded" class="collapsible-body">

          <!-- Story refs -->
          <div class="subsection">
            <h4 class="subsection-title">Story references</h4>
            <div class="ref-chips">
              <span class="chip" v-for="(ref, i) in storyRefs" :key="ref.StoryId">
                {{ ref.StoryTitle }}
                <button class="chip-remove" @click="removeStoryRef(i)">×</button>
              </span>
            </div>
            <button class="btn btn-secondary btn-sm" @click="showStoryPicker = !showStoryPicker">
              {{ showStoryPicker ? 'Close' : '+ Link story' }}
            </button>
            <div class="story-picker" v-if="showStoryPicker">
              <label
                class="story-option"
                v-for="story in allStories"
                :key="story.Id"
              >
                <input
                  type="checkbox"
                  :checked="isStoryLinked(story.Id)"
                  @change="toggleStory(story)"
                />
                {{ story.Title }}
              </label>
              <p v-if="!allStories.length" class="placeholder-note">No stories in this timeline.</p>
            </div>
          </div>

          <!-- Book / chapter refs -->
          <div class="subsection spaced-subsection">
            <h4 class="subsection-title">Book &amp; chapter references</h4>
            <div class="chapter-ref-list">
              <div class="chapter-ref" v-for="(ref, i) in chapterRefs" :key="ref.ChapterId">
                <span class="book-title">{{ ref.BookTitle }}</span>
                <span class="chapter-num">Ch. {{ ref.ChapterNumber }}<template v-if="ref.ChapterTitle"> — {{ ref.ChapterTitle }}</template></span>
                <button class="btn-icon" @click="removeChapterRef(i)">×</button>
              </div>
            </div>

            <div class="book-search-row">
              <div class="field flex-1" style="position:relative">
                <label>Search book</label>
                <input
                  type="text"
                  :value="bookSearchValue"
                  placeholder="Book title…"
                  @input="onBookSearchInput"
                />
                <div class="suggestions" v-if="bookSuggestions.length">
                  <div
                    class="suggestion-item"
                    v-for="b in bookSuggestions"
                    :key="b.Id"
                    @mousedown.prevent="selectBook(b)"
                  >{{ b.Title }}</div>
                </div>
              </div>
              <div class="field flex-1" v-if="selectedBook && bookChapters.length">
                <label>Chapter</label>
                <select v-model="selectedChapterId">
                  <option value="">Select chapter…</option>
                  <option v-for="c in bookChapters" :key="c.Id" :value="c.Id">
                    {{ c.Number }}<template v-if="c.Title"> — {{ c.Title }}</template>
                  </option>
                </select>
              </div>
              <div class="field" v-if="selectedChapterId">
                <label>&nbsp;</label>
                <button class="btn btn-secondary btn-sm" @click="addChapterRef">+ Add</button>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>

    </div> <!-- /edit-item-content -->

    <Teleport to="body">
      <Transition :css="false"
        @before-enter="onLbBeforeEnter" @enter="onLbEnter"
        @before-leave="onLbBeforeLeave" @leave="onLbLeave"
      >
        <LightboxOverlay
          v-if="lightboxSrc"
          :src="lightboxSrc"
          :has-prev="lightboxIndex > 0"
          :has-next="lightboxIndex < lightboxCollection.length - 1"
          @close="closeLightbox()"
          @prev="lightboxPrev()"
          @next="lightboxNext()"
        />
      </Transition>
    </Teleport>
  </div>

  <div v-else class="loading-screen">Loading…</div>
  <ConfirmModal
    v-if="showDiscard"
    :title="discardTitle" :message="discardMessage"
    :confirm-label="discardConfirm" cancel-label="Keep editing" danger
    @confirm="discard" @cancel="keepEditing"
  />
  <HelpModal v-if="showHelp" @close="showHelp = false" />
  <ShortcutsModal v-if="showShortcuts" context="edit" @close="showShortcuts = false" />
  <NotificationContainer />
</template>

<style scoped lang="scss">
* { box-sizing: border-box; }

.edit-item-root {
  display: flex;
  flex-direction: column;
  font-family: Arial, sans-serif;
  font-size: 14px;
  color: var(--app-text, #e2e8f0);
  background: var(--app-bg, #0f172a);
  height: 100vh;
  overflow: hidden;
}

// Padding lives here (not on the root) so the title bar stays flush with the
// window edges. This wrapper is also the scroll container.
.edit-item-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-size: 1.2rem;
  color: var(--app-text-dim, #64748b);
}

// ---- Sections ----
.section {
  background: var(--app-surface-raised, #1e293b);
  border: 1px solid var(--app-border, #334155);
  border-radius: var(--app-radius, 6px);
  padding: 14px 16px;
}

.section-title {
  margin: 0 0 10px 0;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--app-text-muted, #94a3b8);
  user-select: none;
}

.subsection { margin-top: 12px; }
.spaced-subsection { margin-top: 20px; }

.subsection-title {
  margin: 0 0 6px 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--app-text-muted, #94a3b8);
  user-select: none;
}


// ---- Header ----
.header-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.type-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #ffffff;
  background: #db0000;
  border: 1px solid #460000;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  user-select: none;
}

.item-id-label {
  font-size: 0.75rem;
  color: var(--app-text-dim, #64748b);
  font-family: monospace;
  min-width: 64px;
  text-align: right;
}

.header-actions {
  display: flex;
  gap: 8px;

  .btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 16px;
    line-height: 1.2;
  }
}

.btn-hint {
  font-size: 0.62rem;
  font-weight: 400;
  opacity: 0.7;
}


.save-error {
  margin: 0;
  color: #f87171;
  font-size: 0.85rem;
}

// ---- Body grid ----
.body-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 700px) {
  .body-grid { grid-template-columns: 1fr; }
}

// ---- Fields ----
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;

  label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--app-text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    user-select: none;
  }

  input[type='text'],
  input[type='color'],
  select,
  textarea {
    padding: 5px 8px;
    border: 1px solid var(--app-border, #334155);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    width: 100%;
    &:focus { outline: 2px solid var(--app-accent, #4a90d9); border-color: transparent; }
    &::placeholder { color: var(--app-text-dim, #64748b); }
  }

  input[type='color'] {
    height: 34px;
    padding: 2px;
    cursor: pointer;
    width: 48px;
  }

  input[type='range'] {
    width: 100%;
    cursor: pointer;
  }

  textarea { resize: vertical; }
}

.row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  margin-top: 20px;
}

.flex-1 { flex: 1; }

.date-row { margin-top: 16px; }

.spaced-field { margin-top: 16px; }

.color-field { flex-shrink: 0; }

.color-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-tool {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--app-border, #334155);
  background: var(--app-bg, #0f172a);
  color: var(--app-text-muted, #94a3b8);
  font-size: 1.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  &:hover, &.open { border-color: var(--app-accent, #4a90d9); color: var(--app-text, #e2e8f0); }
  &.open { background: var(--app-accent, #4a90d9); color: #fff; }
}

.color-palette-wrap { position: relative; }

.color-palette {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(6, 22px);
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--app-border, #334155);
  background: var(--app-surface-raised, #1e293b);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  transform-origin: top right;
  animation: palette-pop 0.12s ease-out;
}

@keyframes palette-pop {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, border-color 0.1s;
  &:hover { transform: scale(1.15); }
  &.active { border-color: #fff; }
}

.checkbox-field {
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    text-transform: none;
    letter-spacing: 0;
    font-weight: normal;
    cursor: pointer;
  }
}

// ---- Side toggle (same look as RelativeRuleEditor's segmented buttons) ----
.seg-btns {
  display: flex;
  border: 1px solid var(--app-border, #2d3a56);
  border-radius: 4px;
  overflow: hidden;
}

.seg-btn {
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 500;
  background: var(--app-surface, #0c1524);
  color: var(--app-text-muted, #94a3b8);
  border: none;
  border-right: 1px solid var(--app-border, #2d3a56);
  cursor: pointer;
  user-select: none;

  &:last-child { border-right: none; }
  &:hover:not(.active) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
  &.active { background: #2c5f8a; color: #e8f0ff; font-weight: 600; }
}

// ---- Tags ----
.tag-input-wrap { position: relative; }

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--app-border, #334155);
  border-radius: 4px;
  background: var(--app-bg, #0f172a);
  min-height: 34px;
  align-items: center;

  &:focus-within { outline: 2px solid var(--app-accent, #4a90d9); }
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #1e3a5f;
  color: #93c5fd;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
}

.top-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.chip-suggest {
  border: 1px dashed #93c5fd66;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  &:hover { background: #1e3a5f; }
}

.chip-remove {
  border: none;
  background: none;
  cursor: pointer;
  color: #93c5fd;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  &:hover { color: #f87171; }
}

.tag-inline-input {
  border: none !important;
  outline: none !important;
  background: transparent !important;
  padding: 2px 4px !important;
  width: 120px;
  font-size: 0.9rem;
  color: var(--app-text, #e2e8f0);
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--app-surface-raised, #1e293b);
  border: 1px solid var(--app-border, #334155);
  border-top: none;
  border-radius: 0 0 4px 4px;
  z-index: 100;
  max-height: 180px;
  overflow-y: auto;
  box-shadow: 0 4px 8px rgba(0,0,0,.4);
}

.suggestion-item {
  padding: 7px 10px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--app-text, #e2e8f0);
  &:hover { background: color-mix(in srgb, var(--app-accent, #6366f1) 15%, var(--app-surface-raised, #1e293b)); }
}

// ---- Footer ----
.footer-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.collapsible-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;

  .section-title { margin: 0; }
}

.collapse-toggle { color: var(--app-text-dim, #64748b); font-size: 0.8rem; }

.collapsible-body { margin-top: 12px; }

// ---- Characters ----
.char-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.char-ref {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  background: var(--app-surface, #162032);
  border: 1px solid var(--app-border, #334155);
  border-radius: 5px;
}

.char-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;

  &.sm { width: 28px; height: 28px; font-size: 0.75rem; }

  img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
}

.char-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.char-name { font-weight: 600; font-size: 0.9rem; }

.char-role-input {
  border: 1px solid var(--app-border, #334155);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 0.82rem;
  background: var(--app-bg, #0f172a);
  color: var(--app-text, #e2e8f0);
  width: 100%;
  &:focus { outline: 2px solid var(--app-accent, #4a90d9); }
}

// ---- Picker overlay ----
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}

.picker-panel {
  background: var(--app-surface-raised, #1e293b);
  border: 1px solid var(--app-border, #334155);
  border-radius: var(--app-radius, 8px);
  width: 340px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0,0,0,.5);
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border, #334155);
  font-weight: 600;
  color: var(--app-text, #e2e8f0);
}

.picker-search {
  margin: 10px 14px;
  padding: 6px 10px;
  border: 1px solid var(--app-border, #334155);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--app-bg, #0f172a);
  color: var(--app-text, #e2e8f0);
  &:focus { outline: 2px solid var(--app-accent, #4a90d9); }
  &::placeholder { color: var(--app-text-dim, #64748b); }
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--app-text, #e2e8f0);
  &:hover { background: color-mix(in srgb, var(--app-accent, #6366f1) 15%, var(--app-surface-raised, #1e293b)); }
  &.selected { background: color-mix(in srgb, var(--app-accent, #6366f1) 20%, var(--app-surface-raised, #1e293b)); font-weight: 600; }
}

.picker-empty {
  padding: 10px 0;
  color: var(--app-text-dim, #64748b);
  font-size: 0.85rem;
}

.picker-role {
  padding: 10px 14px;
  border-top: 1px solid var(--app-border, #334155);

  input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--app-border, #334155);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--app-bg, #0f172a);
    color: var(--app-text, #e2e8f0);
    &:focus { outline: 2px solid var(--app-accent, #4a90d9); }
    &::placeholder { color: var(--app-text-dim, #64748b); }
  }
}

.picker-new {
  margin-right: auto;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--app-border, #334155);
}

// ---- Story picker ----
.story-picker {
  margin-top: 8px;
  border: 1px solid var(--app-border, #334155);
  border-radius: 5px;
  padding: 8px 10px;
  max-height: 180px;
  overflow-y: auto;
  background: var(--app-surface, #162032);
}

.story-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--app-text, #e2e8f0);
}

.ref-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}

// ---- Chapter refs ----
.chapter-ref-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}

.chapter-ref {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  background: var(--app-surface, #162032);
  border: 1px solid var(--app-border, #334155);
  border-radius: 5px;
  font-size: 0.88rem;
  color: var(--app-text, #e2e8f0);
}

.book-title { font-weight: 600; }

.chapter-num { color: var(--app-text-muted, #94a3b8); flex: 1; }

.book-search-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}

// ---- Buttons ----
.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: opacity 0.15s;

  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &.btn-primary { background: var(--app-accent, #4a90d9); color: #fff; &:hover:not(:disabled) { background: var(--app-accent-hover, #3578c5); } }
  &.btn-secondary { background: var(--app-surface-high, #334155); color: var(--app-text-muted, #cbd5e1); &:hover:not(:disabled) { background: color-mix(in srgb, var(--app-surface-high, #334155) 80%, var(--app-text, #fff)); } }
  &.btn-sm { padding: 4px 12px; font-size: 0.82rem; }
  &.btn-danger { background: #7f1d1d; color: #fecaca; &:hover:not(:disabled) { background: #991b1b; } }
}

.btn-icon {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: var(--app-text-dim, #64748b);
  padding: 0 2px;
  line-height: 1;
  &:hover { color: #f87171; }
}

.placeholder-note {
  color: var(--app-text-dim, #64748b);
  font-size: 0.85rem;
  font-style: italic;
  margin: 0;
}

// ---- Image grid ----
.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}

.image-thumb {
  width: 110px;
  border: 1px solid var(--app-border, #334155);
  border-radius: 5px;
  overflow: hidden;
  background: var(--app-surface-raised, #1e293b);

  img {
    width: 100%;
    height: 84px;
    object-fit: cover;
    display: block;
    background: color-mix(in srgb, var(--app-border, #334155) 60%, var(--app-surface-raised, #1e293b));
    cursor: zoom-in;
  }
}

.image-thumb-footer {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 5px;
}

.image-label {
  flex: 1;
  font-size: 10px;
  color: var(--app-text-muted, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-icon--danger:hover {
  color: #f87171;
}

.mt-6 { margin-top: 6px; }

</style>
