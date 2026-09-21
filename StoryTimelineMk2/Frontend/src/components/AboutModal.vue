<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'
import { BackendAPI } from '@/bridge/api'

defineEmits<{ close: [] }>()

const version = __APP_VERSION__

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-found'
const checkState = ref<CheckState>('idle')
const foundVersion = ref<string | null>(null)
const foundUrl     = ref<string | null>(null)

async function checkForUpdates() {
    checkState.value = 'checking'
    foundVersion.value = null
    foundUrl.value = null
    try {
        const res = await BackendAPI.CheckForUpdates()
        if (res?.updateAvailable && res.version && res.url) {
            foundVersion.value = res.version
            foundUrl.value     = res.url
            checkState.value   = 'update-found'
        } else {
            checkState.value = 'up-to-date'
        }
    } catch {
        checkState.value = 'up-to-date'
    }
}

function openUrl() {
    if (foundUrl.value) BackendAPI.OpenExternalUrl(foundUrl.value)
}
</script>

<template>
    <BaseModal style="user-select: none;" @close="$emit('close')">
        <template #header>
            <span class="modal-title">About</span>
        </template>

        <div class="about-body">
            <div class="about-name">Story Timeline <span style="font-size:smaller; opacity: .6">(Mk2)</span></div>
            <div class="about-version">v{{ version }}</div>
            <p class="about-desc" style="white-space: nowrap;">A timeline management tool for creative writers.</p>
            <p class="about-copy"><span style="vertical-align: super; font-size:smaller">&copy;</span> 2026 WolfyD</p>
            <p class="about-copy">All art by Dergderg Dorgness &mdash; dergdergdorgness@gmail.com</p>
            <p class="about-copy">Free software under the GNU AGPL v3 &mdash; source at github.com/WolfyD/StoryTimelineMk2</p>

            <div class="update-section">
                <button
                    class="check-btn"
                    :disabled="checkState === 'checking'"
                    @click="checkForUpdates"
                >
                    <i v-if="checkState === 'checking'" class="ri-loader-4-line spin"></i>
                    <i v-else class="ri-arrow-up-circle-line"></i>
                    {{ checkState === 'checking' ? 'Checking…' : 'Check for updates' }}
                </button>

                <div v-if="checkState === 'up-to-date'" class="check-result ok">
                    <i class="ri-checkbox-circle-line"></i> You're up to date.
                </div>
                <div v-if="checkState === 'update-found'" class="check-result found">
                    <i class="ri-alert-line"></i>
                    Version <strong>{{ foundVersion }}</strong> is available.
                    <button class="download-link" @click="openUrl">Download</button>
                </div>
            </div>
        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
.about-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 32px 24px 36px;
    text-align: center;
}

.about-name {
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--app-text, #e2e8f0);
    letter-spacing: 0.02em;
}

.about-version {
    font-size: 0.78rem;
    color: var(--app-text-dim, #4a6080);
    font-variant-numeric: tabular-nums;
}

.about-desc {
    margin-top: 12px;
    font-size: 0.85rem;
    color: var(--app-text-muted, #94a3b8);
    max-width: 260px;
    line-height: 1.5;
}

.about-copy {
    font-size: 0.8rem;
    color: var(--app-text-dim, #4a6080);
}

.update-section {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.check-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border-radius: 5px;
    border: 1px solid var(--app-border, #2d3a56);
    background: transparent;
    color: var(--app-text-muted, #94a3b8);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
    &:hover:not(:disabled) { background: var(--app-surface-high, #1e2b44); color: var(--app-text, #e2e8f0); }
    &:disabled { opacity: 0.6; cursor: default; }
}

.check-result {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    &.ok   { color: #4ade80; }
    &.found { color: var(--app-accent-hover, #818cf8); }
}

.download-link {
    margin-left: 4px;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid var(--app-accent, #6366f1);
    background: transparent;
    color: var(--app-accent, #6366f1);
    font-size: 11px;
    cursor: pointer;
    &:hover { background: var(--app-accent, #6366f1); color: #fff; }
}

@keyframes spin { to { transform: rotate(360deg); } }
.spin { display: inline-block; animation: spin 0.8s linear infinite; }
</style>
