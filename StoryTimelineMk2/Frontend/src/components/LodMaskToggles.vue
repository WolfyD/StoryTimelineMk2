<script setup lang="ts">
import type { LodLevel } from '@/types/models'

// One button per LOD level of the calendar; bit `index` of the mask = visible at that level.
defineProps<{ modelValue: number; lodProfile: LodLevel[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()
</script>

<template>
  <div class="lod-toggle-row">
    <button
      v-for="lod in lodProfile"
      :key="lod.index"
      type="button"
      class="lod-toggle-btn"
      :class="{ active: modelValue & (1 << lod.index) }"
      :title="lod.formatKey"
      @click="emit('update:modelValue', modelValue ^ (1 << lod.index))"
    >{{ lod.formatKey.slice(0, 3) }}</button>
  </div>
</template>

<style scoped lang="scss">
.lod-toggle-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
}

.lod-toggle-btn {
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--app-border, #334155);
  background: var(--app-bg, #0f172a);
  color: var(--app-text-dim, #64748b);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;

  // Semantic blue active state — intentionally kept
  &.active {
    background: #1e3a5f;
    color: #93c5fd;
    border-color: #3b82f6;
  }

  &:hover { border-color: var(--app-accent, #4a90d9); }
}
</style>
