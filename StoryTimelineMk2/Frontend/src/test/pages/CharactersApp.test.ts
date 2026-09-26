import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/bridge/api', () => ({
  BackendAPI: {
    GetTimelineCharacters: vi.fn(),
    GetTimelineCalendar: vi.fn().mockResolvedValue(null),
    GetCharacterAppearances: vi.fn().mockResolvedValue([]),
    GetCharacterRelations: vi.fn().mockResolvedValue({ Relations: [], Types: [] }),
    DeleteCharacter: vi.fn().mockResolvedValue({ status: 'ok' }),
    SaveCharacterFull: vi.fn(),
    OpenCharacterTimeline: vi.fn(),
    GetAppConfig: vi.fn().mockResolvedValue({ themeInitialized: true }),
    onHostMessage: vi.fn(() => () => {}),
  },
  IS_BROWSER_HOST: false,
}))

vi.mock('@/components/WindowTitleBar.vue', () => ({
  default: {
    name: 'WindowTitleBar',
    template: '<div class="title-bar-stub"></div>',
    props: ['title', 'subtitle', 'showMaximize'],
  },
}))

vi.mock('@/components/LodDateInput.vue', () => ({
  default: {
    name: 'LodDateInput',
    template: '<div class="lod-date-input-stub"></div>',
    props: ['label', 'lodIndex', 'lodProfile', 'monthNames', 'monthLengths', 'seasonNames', 'weekCount', 'year', 'subtick'],
    emits: ['update:year', 'update:subtick'],
  },
}))

// The relate dialog itself has its own tests; here it only has to prove the bar reached it.
vi.mock('@/components/CharacterRelateModal.vue', () => ({
  default: {
    name: 'CharacterRelateModal',
    template: '<div class="relate-modal-stub"></div>',
    props: ['character', 'characters', 'relations', 'types', 'editing', 'timelineId',
      'lodProfile', 'monthNames', 'monthLengths', 'seasonNames', 'weekCount', 'calendarConfig'],
    emits: ['close', 'changed'],
  },
}))

import CharactersApp from '@/pages/CharactersApp.vue'
import { BackendAPI } from '@/bridge/api'
import { blankCharacter } from '@/utils/characterItems'

function cast() {
  return [
    { ...blankCharacter(1), Id: 'arin', Name: 'Arin', FirstName: 'Arin' },
    { ...blankCharacter(1), Id: 'bel', Name: 'Bel', FirstName: 'Bel' },
  ]
}

/** The window with the first character open — every button in the bar acts on that one. */
async function openFirst() {
  history.replaceState(null, '', '?timelineId=1')
  const wrapper = mount(CharactersApp)
  await flushPromises()
  await wrapper.findAll('.ch-row')[0]!.trigger('click')
  await flushPromises()
  return wrapper
}

const barButtons = (w: ReturnType<typeof mount>) =>
  w.findAll('.ch-bar button').map(b => b.text())

describe('CharactersApp bottom bar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(BackendAPI.GetTimelineCharacters as ReturnType<typeof vi.fn>).mockResolvedValue(cast())
    ;(BackendAPI.GetCharacterRelations as ReturnType<typeof vi.fn>).mockResolvedValue({ Relations: [], Types: [] })
    ;(BackendAPI.GetCharacterAppearances as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('holds the four actions, and only once a character is open', async () => {
    history.replaceState(null, '', '?timelineId=1')
    const wrapper = mount(CharactersApp)
    await flushPromises()
    expect(wrapper.find('.ch-bar').exists()).toBe(false)

    await wrapper.findAll('.ch-row')[0]!.trigger('click')
    await flushPromises()
    expect(barButtons(wrapper)).toEqual(['Save', 'Delete', 'Relate', 'Their timeline'])
    // Inside the form's pane, not across the window — it acts on the open character, not the list.
    expect(wrapper.find('.ch-pane > .ch-bar').exists()).toBe(true)
    // Red standing, not only under the pointer.
    expect(wrapper.find('.ch-bar .ch-btn--danger').text()).toBe('Delete')
  })

  it('asks in the app’s own dialog before deleting, and Keep means keep', async () => {
    const wrapper = await openFirst()
    await wrapper.find('.ch-bar .ch-btn--danger').trigger('click')

    expect(wrapper.text()).toContain('Delete Arin?')
    expect(BackendAPI.DeleteCharacter).not.toHaveBeenCalled()

    await wrapper.find('[data-cancel]').trigger('click')
    expect(BackendAPI.DeleteCharacter).not.toHaveBeenCalled()
    // Still the same character open, dialog gone.
    expect((wrapper.find('.ch-grid input').element as HTMLInputElement).value).toBe('Arin')
    expect(wrapper.text()).not.toContain('Delete Arin?')
  })

  it('deletes once the dialog is confirmed', async () => {
    const wrapper = await openFirst()
    await wrapper.find('.ch-bar .ch-btn--danger').trigger('click')
    await wrapper.find('[data-primary]').trigger('click')
    await flushPromises()

    expect(BackendAPI.DeleteCharacter).toHaveBeenCalledWith('arin')
  })

  it('a new character is discarded outright — nothing is saved to warn about', async () => {
    const wrapper = await openFirst()
    await wrapper.find('.ch-list-head .ch-btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.find('.ch-bar .ch-btn--danger').text()).toBe('Discard')
    await wrapper.find('.ch-bar .ch-btn--danger').trigger('click')
    expect(wrapper.text()).not.toContain('Their portrait')
    expect(BackendAPI.DeleteCharacter).not.toHaveBeenCalled()
    expect(wrapper.find('.ch-bar').exists()).toBe(false)
  })

  it('Relate opens the relations dialog the panel owns', async () => {
    const wrapper = await openFirst()
    expect(wrapper.find('.relate-modal-stub').exists()).toBe(false)

    await wrapper.findAll('.ch-bar button')[2]!.trigger('click')
    expect(wrapper.find('.relate-modal-stub').exists()).toBe(true)
  })

  it('Relate is dead until there is somebody else to tie them to', async () => {
    ;(BackendAPI.GetTimelineCharacters as ReturnType<typeof vi.fn>)
      .mockResolvedValue([{ ...blankCharacter(1), Id: 'arin', Name: 'Arin', FirstName: 'Arin' }])
    const wrapper = await openFirst()

    expect(wrapper.findAll('.ch-bar button')[2]!.attributes('disabled')).toBeDefined()
  })

  it('Their timeline asks the host for the one character’s timeline', async () => {
    const wrapper = await openFirst()
    await wrapper.findAll('.ch-bar button')[3]!.trigger('click')

    expect(BackendAPI.OpenCharacterTimeline).toHaveBeenCalledWith(1, 'arin')
  })
})

describe('CharactersApp save', () => {
  const ok = (over: Record<string, unknown> = {}) => ({
    status: 'ok',
    character: { ...blankCharacter(1), Id: 'arin', Name: 'Arin', FirstName: 'Arin', ...over },
  })
  const save = (w: ReturnType<typeof mount>) => w.findAll('.ch-bar button')[0]!.trigger('click')
  const callsTo = () => (BackendAPI.SaveCharacterFull as ReturnType<typeof vi.fn>).mock.calls

  beforeEach(() => {
    vi.clearAllMocks()
    ;(BackendAPI.GetCharacterRelations as ReturnType<typeof vi.fn>).mockResolvedValue({ Relations: [], Types: [] })
    ;(BackendAPI.GetCharacterAppearances as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(BackendAPI.SaveCharacterFull as ReturnType<typeof vi.fn>).mockResolvedValue(ok())
  })

  it('sends the character and the items it generates as one call', async () => {
    ;(BackendAPI.GetTimelineCharacters as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...blankCharacter(1), Id: 'arin', Name: 'Arin', FirstName: 'Arin',
        ShowOnTimeline: true, BirthYear: 10 },
    ])
    const wrapper = await openFirst()
    await save(wrapper)
    await flushPromises()

    const [character, dropped, birthItem, deathItem] = callsTo()[0]!
    expect(character.Id).toBe('arin')
    expect(dropped).toEqual([])
    // Planned before the call, so one write stores the id rather than a save and a re-save.
    expect(birthItem).toMatchObject({ Id: character.BirthItemId, TypeId: 7, Year: 10 })
    expect(deathItem).toBeNull()                       // no death year — nothing to generate
    expect(wrapper.text()).not.toContain('Save failed')
  })

  it('leaves the draft alone when the save fails, so the retry still drops the same item', async () => {
    // Show on timeline off, but an item still owned from when it was on: this save deletes it.
    ;(BackendAPI.GetTimelineCharacters as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...blankCharacter(1), Id: 'arin', Name: 'Arin', FirstName: 'Arin',
        ShowOnTimeline: false, BirthYear: 10, BirthItemId: 'old-birth' },
    ])
    const wrapper = await openFirst()
    ;(BackendAPI.SaveCharacterFull as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('the bridge is down'))

    await save(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('Save failed')
    expect(callsTo()[0]![1]).toEqual(['old-birth'])

    await save(wrapper)
    await flushPromises()
    // The planning ran on a copy, so the failed attempt did not clear the id off the draft.
    expect(callsTo()[1]![1]).toEqual(['old-birth'])
  })
})
