import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getItemDetails } from '@/utils/itemDetails'
import { BackendAPI } from '@/bridge/api'
import type { TimelineItem } from '@/types/models'

vi.mock('@/bridge/api', () => ({
  BackendAPI: { GetItemForEdit: vi.fn() },
}))

const fetchItem = BackendAPI.GetItemForEdit as ReturnType<typeof vi.fn>

// The cache is keyed by the item object, so every test needs its own.
let nextId = 0
const makeItem = () =>
  ({ Id: `item-${nextId++}`, TimelineId: 1 }) as unknown as TimelineItem

describe('getItemDetails (BL-18 TC-H5)', () => {
  beforeEach(() => {
    fetchItem.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('asks the backend once per item, however many panels want it', async () => {
    fetchItem.mockResolvedValue({ Pictures: [{ ThumbPath: 'a.png' }] })
    const item = makeItem()

    const [first, second] = await Promise.all([getItemDetails(item), getItemDetails(item)])

    expect(fetchItem).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(await getItemDetails(item)).toBe(first)   // and again after it resolved
  })

  it('refetches once the item object is replaced by a save', async () => {
    fetchItem.mockResolvedValue({ Pictures: [] })
    await getItemDetails(makeItem())
    await getItemDetails(makeItem())   // what upsertItem leaves behind

    expect(fetchItem).toHaveBeenCalledTimes(2)
  })

  it('caches a failure as null instead of retrying on every pan', async () => {
    fetchItem.mockRejectedValue(new Error('backend said no'))
    const item = makeItem()

    expect(await getItemDetails(item)).toBeNull()
    expect(await getItemDetails(item)).toBeNull()
    expect(fetchItem).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })
})
