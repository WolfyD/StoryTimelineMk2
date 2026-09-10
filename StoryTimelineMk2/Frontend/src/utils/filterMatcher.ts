import type { TimelineItem, FilterRule, ItemTagLink, ItemCharacterLink, ItemStoryRefLink } from '@/types/models';

export interface FilterItemData {
    item: TimelineItem;
    tagIds: number[];
    characterIds: string[];
    storyIds: string[];
    hasPicture: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    if (!hex) return null;
    const clean = hex.replace('#', '');
    if (clean.length < 6) return null;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
}

export function matchesRule(rule: FilterRule, data: FilterItemData): boolean {
    let params: Record<string, any>;
    try {
        params = JSON.parse(rule.ParamsJson);
    } catch {
        return false;
    }

    const item = data.item;

    switch (rule.Dimension) {
        case 'type':
            return item.TypeId === params.typeId;

        case 'tag':
            return data.tagIds.includes(params.tagId);

        case 'character':
            return data.characterIds.includes(params.characterId);

        case 'story':
            return data.storyIds.includes(params.storyId);

        case 'keyword': {
            const q = (params.query ?? '').toLowerCase();
            if (!q) return false;
            return (item.Title ?? '').toLowerCase().includes(q) ||
                   (item.Description ?? '').toLowerCase().includes(q) ||
                   (item.Content ?? '').toLowerCase().includes(q);
        }

        case 'importance': {
            const imp = item.Importance ?? 5;
            switch (params.op) {
                case '>': return imp > params.value;
                case '<': return imp < params.value;
                case '=': return imp === params.value;
            }
            return false;
        }

        case 'time_range': {
            const s = item.AbsoluteStart;
            const e = item.AbsoluteEnd ?? item.AbsoluteStart;
            switch (params.op) {
                case '>': return e > params.year;
                case '<': return s < params.year;
                case '=': return s <= params.year && params.year <= e;
                case 'between': return s <= (params.year2 ?? params.year) && e >= params.year;
            }
            return false;
        }

        case 'boolean': {
            switch (params.field) {
                case 'has_picture': return data.hasPicture;
                case 'has_tags': return data.tagIds.length > 0;
                case 'show_in_notes': return !!item.ShowInNotes;
            }
            return false;
        }

        case 'lod_level':
            return ((item.LodVisibilityMask ?? 255) & (1 << params.lodIndex)) !== 0;

        case 'color': {
            const tolerance = params.tolerance ?? 10;
            const itemRgb = hexToRgb(item.Color ?? '');
            const filterRgb = hexToRgb(params.hex ?? '');
            if (!itemRgb || !filterRgb) return false;
            return Math.abs(itemRgb.r - filterRgb.r) <= tolerance &&
                   Math.abs(itemRgb.g - filterRgb.g) <= tolerance &&
                   Math.abs(itemRgb.b - filterRgb.b) <= tolerance;
        }

        default:
            return false;
    }
}

export function applyFilters(
    items: TimelineItem[],
    rules: FilterRule[],
    andMode: boolean,
    itemDataMap: Map<string, FilterItemData>,
): { visible: TimelineItem[]; dimmed: TimelineItem[] } {
    const positives = rules.filter(r => r.State === 'positive');
    const negatives = rules.filter(r => r.State === 'negative');

    if (positives.length === 0 && negatives.length === 0) {
        return { visible: items, dimmed: [] };
    }

    const visible: TimelineItem[] = [];
    const dimmed: TimelineItem[] = [];

    for (const item of items) {
        const data = itemDataMap.get(item.Id);
        if (!data) { visible.push(item); continue; }

        if (negatives.some(r => matchesRule(r, data))) {
            dimmed.push(item);
            continue;
        }

        if (positives.length === 0) {
            visible.push(item);
        } else if (andMode ? positives.every(r => matchesRule(r, data)) : positives.some(r => matchesRule(r, data))) {
            visible.push(item);
        } else {
            dimmed.push(item);
        }
    }

    return { visible, dimmed };
}

export function buildItemDataMap(
    items: TimelineItem[],
    itemTagMap: Map<string, ItemTagLink[]>,
    itemCharacterMap: Map<string, ItemCharacterLink[]>,
    itemStoryMap: Map<string, ItemStoryRefLink[]>,
    pictureSet: Set<string>,
): Map<string, FilterItemData> {
    const map = new Map<string, FilterItemData>();
    for (const item of items) {
        map.set(item.Id, {
            item,
            tagIds: (itemTagMap.get(item.Id) ?? []).map(t => t.TagId),
            characterIds: (itemCharacterMap.get(item.Id) ?? []).map(c => c.CharacterId),
            storyIds: (itemStoryMap.get(item.Id) ?? []).map(s => s.StoryId),
            hasPicture: pictureSet.has(item.Id),
        });
    }
    return map;
}
