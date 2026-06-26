<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { BackendAPI } from '@/bridge/api'
import LodDateInput from '@/components/LodDateInput.vue'
import type {
  TimelineItem,
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

// ---------------------------------------------------------------------------
// URL params
// ---------------------------------------------------------------------------
const params       = new URLSearchParams(window.location.search)
const timelineId   = parseInt(params.get('timelineId') ?? '0')
const itemId       = params.get('itemId')           // null for new items
const defaultType  = parseInt(params.get('typeId') ?? '1')
const defaultYear  = parseInt(params.get('year') ?? '0') || 0

const isNew = !itemId

const ITEM_TYPES = [
  { id: 1, name: 'Event' },
  { id: 2, name: 'Period' },
  { id: 3, name: 'Age' },
  { id: 4, name: 'Picture' },
  { id: 5, name: 'Note' },
  { id: 6, name: 'Bookmark' },
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
  AbsoluteStart: 0,
  Subtick: 0,
  OriginalSubtick: 0,
  EndYear: 0,
  AbsoluteEnd: 0,
  EndSubtick: 0,
  OriginalEndSubtick: 0,
  BookTitle: '',
  Chapter: '',
  Page: '',
  Color: '#4a90d9',
  CreationGranularity: 3,
  TimelineId: timelineId,
  ItemIndex: 0,
  ShowInNotes: true,
  Importance: 5,
  MinLodLevel: 3,
})

// Separate start/end year+subtick refs (written back to item on save)
const startYear    = ref(0)
const startSubtick = ref(0)
const endYear      = ref(0)
const endSubtick   = ref(0)

// ---------------------------------------------------------------------------
// Associated data
// ---------------------------------------------------------------------------
const tags               = ref<Tag[]>([])
const characterAppearances = ref<ItemCharacterAppearance[]>([])
const storyRefs          = ref<ItemStoryRef[]>([])
const chapterRefs        = ref<ItemChapterRef[]>([])

// Lookup data
const allCharacters   = ref<CharacterItem[]>([])
const allStories      = ref<Story[]>([])
const lodProfile      = ref<LodLevel[]>([])
const monthNames      = ref<string[]>([])

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------
const isLoading         = ref(true)
const isSaving          = ref(false)
const isCharExpanded    = ref(true)
const isStoryExpanded   = ref(true)
const saveError         = ref('')

// Tag autocomplete
const tagInputValue     = ref('')
const tagSuggestions    = ref<Tag[]>([])
let tagDebounce: ReturnType<typeof setTimeout>

// Character picker
const showCharPicker     = ref(false)
const charPickerFilter   = ref('')
const pendingCharId      = ref('')
const pendingCharRole    = ref('')

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

const filteredCharacters = computed(() => {
  const q = charPickerFilter.value.toLowerCase()
  const linked = new Set(characterAppearances.value.map(a => a.CharacterId))
  return allCharacters.value
    .filter(c => !linked.has(c.Id))
    .filter(c => !q || c.Name.toLowerCase().includes(q))
})

// Parse month names from the calendar's year_definition JSON
function extractMonthNames(yearDefinition: string): string[] {
  try {
    const def = JSON.parse(yearDefinition)
    const md = def?.month_definition
    if (!md) return []
    const names: string[] = []
    for (let i = 0; i < 12; i++) {
      names.push(md[String(i)]?.name ?? `Month ${i + 1}`)
    }
    return names
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
onMounted(async () => {
  const [data, characters, stories] = await Promise.all([
    BackendAPI.GetItemForEdit(timelineId, itemId, defaultType),
    BackendAPI.GetTimelineCharacters(timelineId),
    BackendAPI.GetTimelineStories(timelineId),
  ])

  if (data) {
    if (!isNew) {
      item.value = data.Item
    } else {
      item.value.TimelineId = timelineId
      item.value.TypeId = defaultType
      if (defaultYear) item.value.Year = defaultYear
    }

    // Sync split date fields
    startYear.value    = item.value.Year
    startSubtick.value = item.value.Subtick
    endYear.value      = item.value.EndYear
    endSubtick.value   = item.value.EndSubtick

    tags.value               = data.Tags ?? []
    characterAppearances.value = data.Characters ?? []
    storyRefs.value          = data.StoryRefs ?? []
    chapterRefs.value        = data.ChapterRefs ?? []

    if (data.Calendar) {
      // Extract LOD profile (it comes as a raw JSON string in LodProfile.Profile)
      const rawProfile = data.Calendar.LodProfile?.Profile
      if (rawProfile) {
        lodProfile.value = typeof rawProfile === 'string'
          ? JSON.parse(rawProfile)
          : rawProfile as unknown as LodLevel[]
      }
      monthNames.value = extractMonthNames(data.Calendar.YearDefinition ?? '')
    }
  }

  allCharacters.value = characters ?? []
  allStories.value    = stories ?? []
  isLoading.value = false
})

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
function onTagInput(e: Event) {
  tagInputValue.value = (e.target as HTMLInputElement).value
  clearTimeout(tagDebounce)
  if (tagInputValue.value.length < 1) { tagSuggestions.value = []; return }
  tagDebounce = setTimeout(async () => {
    tagSuggestions.value = await BackendAPI.SearchTags(tagInputValue.value)
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
  showCharPicker.value = false
}

function removeCharacterAppearance(index: number) {
  characterAppearances.value.splice(index, 1)
}

function characterInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
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
    bookSuggestions.value = await BackendAPI.SearchBooks(bookSearchValue.value)
  }, 250)
}

async function selectBook(book: Book) {
  selectedBook.value    = book
  bookSearchValue.value = book.Title
  bookSuggestions.value = []
  bookChapters.value    = await BackendAPI.GetBookChapters(book.Id)
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
async function save() {
  saveError.value = ''
  isSaving.value = true

  // Write split date fields back to item
  item.value.Year         = startYear.value
  item.value.Subtick      = startSubtick.value
  item.value.OriginalSubtick = startSubtick.value
  item.value.EndYear      = isRangeType.value ? endYear.value   : startYear.value
  item.value.EndSubtick   = isRangeType.value ? endSubtick.value : startSubtick.value
  item.value.OriginalEndSubtick = item.value.EndSubtick

  // Compute absolute positions
  const lod = lodProfile.value.find(l => l.index === item.value.CreationGranularity)
  const step = lod?.stepFraction ?? 1
  item.value.AbsoluteStart = item.value.Year + item.value.Subtick * step
  item.value.AbsoluteEnd   = item.value.EndYear + item.value.EndSubtick * step

  try {
    const result = await BackendAPI.SaveItem(
      item.value,
      tags.value.map(t => t.Name),
      characterAppearances.value.map(a => ({ CharacterId: a.CharacterId, Role: a.Role })),
      storyRefs.value.map(r => r.StoryId),
      chapterRefs.value.map(r => r.ChapterId),
    )

    if (result?.status === 'ok') {
      window.close()
    } else {
      saveError.value = result?.itemId ?? 'Save failed'
    }
  } catch (err) {
    saveError.value = String(err)
  } finally {
    isSaving.value = false
  }
}

function cancel() {
  window.close()
}
</script>

<template>
  <div class="edit-item-root" v-if="!isLoading">

    <!-- ===== HEADER ===== -->
    <div class="section header-section">
      <div class="header-row">
        <span class="item-id-label">{{ isNew ? 'New Item' : item.Id.slice(0, 8) }}</span>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="cancel">Cancel</button>
          <button class="btn btn-primary" :disabled="isSaving" @click="save">
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
      <p v-if="saveError" class="save-error">{{ saveError }}</p>

      <div class="field">
        <label>Title</label>
        <input type="text" v-model="item.Title" placeholder="Item title" />
      </div>

      <div class="row">
        <div class="field flex-1">
          <label>Description</label>
          <input type="text" v-model="item.Description" placeholder="Short description" />
        </div>
        <div class="field color-field">
          <label>Color</label>
          <input type="color" v-model="item.Color" />
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
              <option v-for="t in ITEM_TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
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

          <div class="field flex-1">
            <label>Visible from LOD</label>
            <select v-model="item.MinLodLevel">
              <option v-for="lod in lodProfile" :key="lod.index" :value="lod.index">
                {{ lod.formatKey }}
              </option>
            </select>
          </div>
        </div>

        <!-- Start date -->
        <LodDateInput
          label="Start"
          :lodIndex="item.CreationGranularity"
          :lodProfile="lodProfile"
          :monthNames="monthNames"
          :year="startYear"
          :subtick="startSubtick"
          @update:year="startYear = $event"
          @update:subtick="startSubtick = $event"
        />

        <!-- End date (only for Period / Age) -->
        <LodDateInput
          v-if="isRangeType"
          label="End"
          :lodIndex="item.CreationGranularity"
          :lodProfile="lodProfile"
          :monthNames="monthNames"
          :year="endYear"
          :subtick="endSubtick"
          @update:year="endYear = $event"
          @update:subtick="endSubtick = $event"
        />
      </div>

      <!-- Right: specifics -->
      <div class="section specifics-section">
        <h3 class="section-title">Details</h3>

        <div class="field">
          <label>Content</label>
          <textarea v-model="item.Content" rows="5" placeholder="Full content / notes…" />
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

        <!-- Tags -->
        <div class="field">
          <label>Tags</label>
          <div class="tag-input-wrap">
            <div class="tag-chips">
              <span class="chip" v-for="(tag, i) in tags" :key="tag.Name">
                {{ tag.Name }}
                <button class="chip-remove" @click="removeTag(i)">×</button>
              </span>
              <input
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
        </div>

        <!-- Images placeholder -->
        <div class="field">
          <label>Images</label>
          <p class="placeholder-note">Image management coming soon.</p>
        </div>
      </div>
    </div>

    <!-- ===== FOOTER ===== -->
    <div class="footer-sections">

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
              >{{ characterInitials(app.CharacterName) }}</div>
              <div class="char-info">
                <span class="char-name">{{ app.CharacterName }}</span>
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
                  >{{ characterInitials(c.Name) }}</div>
                  {{ c.Name }}
                </div>
                <p v-if="!filteredCharacters.length" class="picker-empty">No characters found.</p>
              </div>
              <div class="picker-role">
                <input type="text" v-model="pendingCharRole" placeholder="Role / connection (optional)" />
              </div>
              <div class="picker-footer">
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
          <div class="subsection">
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
  </div>

  <div v-else class="loading-screen">Loading…</div>
</template>

<style scoped lang="scss">
* { box-sizing: border-box; }

.edit-item-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  font-family: Arial, sans-serif;
  font-size: 14px;
  color: #222;
  background: #f5f5f5;
  min-height: 100vh;
}

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-size: 1.2rem;
  color: #888;
}

// ---- Sections ----
.section {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 14px 16px;
}

.section-title {
  margin: 0 0 10px 0;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #555;
}

.subsection { margin-top: 12px; }

.subsection-title {
  margin: 0 0 6px 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
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

.item-id-label {
  font-size: 0.75rem;
  color: #aaa;
  font-family: monospace;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.save-error {
  margin: 0;
  color: #c0392b;
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
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  input[type='text'],
  input[type='color'],
  select,
  textarea {
    padding: 5px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
    background: #fafafa;
    color: #222;
    width: 100%;
    &:focus { outline: 2px solid #4a90d9; border-color: transparent; }
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
}

.flex-1 { flex: 1; }

.color-field { flex-shrink: 0; }

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

// ---- Tags ----
.tag-input-wrap { position: relative; }

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fafafa;
  min-height: 34px;
  align-items: center;

  &:focus-within { outline: 2px solid #4a90d9; }
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #e8f0fe;
  color: #2c5fbc;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
}

.chip-remove {
  border: none;
  background: none;
  cursor: pointer;
  color: #2c5fbc;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  &:hover { color: #c0392b; }
}

.tag-inline-input {
  border: none !important;
  outline: none !important;
  background: transparent !important;
  padding: 2px 4px !important;
  width: 120px;
  font-size: 0.9rem;
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #ccc;
  border-top: none;
  border-radius: 0 0 4px 4px;
  z-index: 100;
  max-height: 180px;
  overflow-y: auto;
  box-shadow: 0 4px 8px rgba(0,0,0,.1);
}

.suggestion-item {
  padding: 7px 10px;
  cursor: pointer;
  font-size: 0.9rem;
  &:hover { background: #f0f4ff; }
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

.collapse-toggle { color: #aaa; font-size: 0.8rem; }

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
  background: #f9f9f9;
  border: 1px solid #eee;
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
}

.char-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.char-name { font-weight: 600; font-size: 0.9rem; }

.char-role-input {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 0.82rem;
  background: #fff;
  width: 100%;
  &:focus { outline: 2px solid #4a90d9; }
}

// ---- Picker overlay ----
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}

.picker-panel {
  background: #fff;
  border-radius: 8px;
  width: 340px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #eee;
  font-weight: 600;
}

.picker-search {
  margin: 10px 14px;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  &:focus { outline: 2px solid #4a90d9; }
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
  &:hover { background: #f0f4ff; }
  &.selected { background: #e8f0fe; font-weight: 600; }
}

.picker-empty {
  padding: 10px 0;
  color: #aaa;
  font-size: 0.85rem;
}

.picker-role {
  padding: 10px 14px;
  border-top: 1px solid #eee;

  input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
    &:focus { outline: 2px solid #4a90d9; }
  }
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #eee;
}

// ---- Story picker ----
.story-picker {
  margin-top: 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  padding: 8px 10px;
  max-height: 180px;
  overflow-y: auto;
  background: #fafafa;
}

.story-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  cursor: pointer;
  font-size: 0.9rem;
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
  background: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 5px;
  font-size: 0.88rem;
}

.book-title { font-weight: 600; }

.chapter-num { color: #666; flex: 1; }

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
  &.btn-primary { background: #4a90d9; color: #fff; &:hover:not(:disabled) { background: #3578c5; } }
  &.btn-secondary { background: #eee; color: #333; &:hover:not(:disabled) { background: #ddd; } }
  &.btn-sm { padding: 4px 12px; font-size: 0.82rem; }
}

.btn-icon {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: #aaa;
  padding: 0 2px;
  line-height: 1;
  &:hover { color: #c0392b; }
}

.placeholder-note {
  color: #aaa;
  font-size: 0.85rem;
  font-style: italic;
  margin: 0;
}
</style>
