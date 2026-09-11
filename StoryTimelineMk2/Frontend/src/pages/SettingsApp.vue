<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { BackendAPI } from '@/bridge/api'
import { useTimelineStore } from '@/stores/timelineStore'
import { useAppTheme } from '@/utils/useAppTheme'

// ==========================================
// 1. Inputs & Outputs (Props & Emits)
// ==========================================
// Props: Data passed down from the parent window/component
const props = defineProps<{
  itemId: number
  initialTitle: string
}>()

// Emits: Events this component shouts back up to its parent (e.g., closing a dialog)
const emit = defineEmits(['close', 'updated'])

// ==========================================
// 2. State & Data
// ==========================================
const store = useTimelineStore()
useAppTheme()
const localTitle = ref(props.initialTitle)
const isSaving = ref(false)

// ==========================================
// 3. Methods & C# Bridge Calls
// ==========================================
async function saveToDatabase() {
  isSaving.value = true

  // Package your data and fire it across the WebView2 bridge
  BackendAPI.send('UpdateItemTitle', {
    id: props.itemId,
    newTitle: localTitle.value,
  })

  // Close the dialog UI once the command is sent
  emit('close')
}

// Optional: Run code the moment this UI module appears on screen
onMounted(() => {
  console.log(`Module loaded for Item: ${props.itemId}`)
})
</script>

<template>
  <!-- Main Wrapper -->
  <div class="module-wrapper bg-slate-800 p-6 rounded-lg shadow-xl border border-slate-700">
    <!-- Header -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-white">Edit Item {{ itemId }}</h2>
      <button @click="emit('close')" class="text-slate-400 hover:text-white">✕</button>
    </div>

    <!-- Content Form -->
    <div class="space-y-4">
      <div>
        <label class="block text-sm text-slate-400 mb-1">Title</label>
        <input
          v-model="localTitle"
          type="text"
          class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-sky-500"
        />
      </div>

      <!-- Actions -->
      <div class="flex justify-end pt-2">
        <button
          @click="saveToDatabase"
          :disabled="isSaving"
          class="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
        >
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 'scoped' ensures these styles ONLY apply to this specific component */
.module-wrapper {
  // Add any complex custom styling here if Tailwind utility classes aren't enough
}
</style>
