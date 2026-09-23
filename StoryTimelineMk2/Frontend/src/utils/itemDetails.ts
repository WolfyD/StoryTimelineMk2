import { BackendAPI } from '@/bridge/api';
import type { ItemForEdit, TimelineItem } from '@/types/models';

/**
 * One GetItemForEdit round trip per item, shared by everything that needs an item's pictures
 * or details (BL-18 TC-H5). The data and gallery panels both walk the same in-range items, so
 * they used to ask for each one twice, and again on every pan.
 *
 * Keyed by the item object rather than its id: `upsertItem` replaces the object when an item is
 * saved, which drops that entry by itself — there is nothing to invalidate by hand.
 */
const cache = new WeakMap<TimelineItem, Promise<ItemForEdit | null>>();

export function getItemDetails(item: TimelineItem): Promise<ItemForEdit | null> {
    let pending = cache.get(item);
    if (!pending) {
        // The promise is cached, not the result, so two panels asking at the same moment still
        // make one request. A failure is cached as null as well: retrying on every pan would
        // hammer a backend that just said no, and the reason is in the log either way.
        pending = BackendAPI.GetItemForEdit(item.TimelineId, item.Id).catch((e) => {
            console.error(`[itemDetails] loading item ${item.Id} failed:`, e);
            return null;
        });
        cache.set(item, pending);
    }
    return pending;
}
