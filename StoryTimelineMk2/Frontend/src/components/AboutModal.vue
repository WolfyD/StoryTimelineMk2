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

// AGPL §13: anyone using this over a network has to be offered the source of the version
// they are actually using, so the link carries the running version's tag rather than main.
const SOURCE_URL = `https://github.com/WolfyD/StoryTimelineMk2/tree/v${version}`
function openSource() {
    BackendAPI.OpenExternalUrl(SOURCE_URL)
}

const LICENSE_URL = `https://github.com/WolfyD/StoryTimelineMk2/blob/v${version}/LICENSE`
function openLicense() {
    BackendAPI.OpenExternalUrl(LICENSE_URL)
}

const activeTab = ref<'about' | 'licenses'>('about')

// Only what actually ships. Build tooling (Vite, ESLint, Vitest…) never reaches a user's
// machine, so it carries no attribution duty and is deliberately absent.
// ponytail: hand-listed — seven-odd entries that change a few times a year. If it ever drifts
// from package.json / the .csproj files, generate it at build time rather than growing this.
const DEPENDENCIES: { group: string; items: { name: string; license: string }[] }[] = [
    {
        group: 'Interface',
        items: [
            { name: 'Vue',            license: 'MIT' },
            { name: 'Pinia',          license: 'MIT' },
            { name: 'Konva',          license: 'MIT' },
            { name: 'vue-konva',      license: 'MIT' },
            { name: 'Splitpanes',     license: 'MIT' },
            { name: 'Phosphor Icons', license: 'MIT' },
            { name: 'Remix Icon',     license: 'Apache-2.0' },
        ],
    },
    {
        group: 'Application',
        items: [
            { name: 'Dapper',                  license: 'Apache-2.0' },
            { name: 'Microsoft.Data.Sqlite',   license: 'MIT' },
            { name: 'SQLitePCLRaw',            license: 'Apache-2.0' },
            { name: 'SQLite',                  license: 'Public domain' },
            { name: 'SkiaSharp',               license: 'MIT' },
            { name: 'Microsoft Edge WebView2', license: 'BSD-3-Clause' },
        ],
    },
]
</script>

<template>
    <BaseModal style="user-select: none;" @close="$emit('close')">
        <template #header>
            <span class="modal-title">About</span>
        </template>

        <div class="tab-bar">
            <button class="tab-btn" :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">About</button>
            <button class="tab-btn" :class="{ active: activeTab === 'licenses' }" @click="activeTab = 'licenses'">Licenses</button>
        </div>

        <div v-show="activeTab === 'about'" class="about-body">
            <div class="about-name">Story Timeline <span style="font-size:smaller; opacity: .6">(Mk2)</span></div>
            <div class="about-version">v{{ version }}</div>
            <p class="about-desc" style="white-space: nowrap;">A timeline management tool for creative writers.</p>
            <p class="about-copy"><span style="vertical-align: super; font-size:smaller">&copy;</span> 2026 WolfyD</p>
            <p class="about-copy">All art by Dergderg Dorgness &mdash; dergdergdorgness@gmail.com</p>
            <p class="about-copy">
                Free software under the GNU AGPL v3 &mdash;
                <button class="source-link" :data-tip="SOURCE_URL" @click="openSource">source for v{{ version }}</button>
            </p>

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

        <div v-show="activeTab === 'licenses'" class="lic-body">
            <p class="lic-lead">
                Story Timeline is free software under the
                <button class="source-link" :data-tip="LICENSE_URL" @click="openLicense">GNU Affero General Public License v3</button>.
                You may use, study, change and share it; anything you distribute or serve over a
                network has to carry the same freedoms and offer its source.
            </p>

            <div class="lic-sep"></div>

            <p class="lic-lead">It is built on the work of others, used under their own terms:</p>

            <div v-for="grp in DEPENDENCIES" :key="grp.group" class="lic-group">
                <div class="lic-group-title">{{ grp.group }}</div>
                <div v-for="dep in grp.items" :key="dep.name" class="lic-row">
                    <span class="lic-name">{{ dep.name }}</span>
                    <span class="lic-dots"></span>
                    <span class="lic-type">{{ dep.license }}</span>
                </div>
            </div>
        </div>
    </BaseModal>
</template>

<style scoped lang="scss">
/* Same tab chrome as TimelineSettingsModal, so the two modals read as one app. */
.tab-bar {
    display: flex;
    border-bottom: 1px solid var(--app-border, #2d3a56);
    flex-shrink: 0;
    background: var(--app-surface, #0c1524);
}

.tab-btn {
    flex: 1;
    padding: 9px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--app-text-dim, #4a6080);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;

    &:hover { color: var(--app-text-muted, #94a3b8); }

    &.active {
        color: var(--app-text, #e2e8f0);
        border-bottom-color: var(--app-accent, #3b6ec4);
    }
}

.lic-body {
    padding: 20px 24px 24px;
    max-height: 60vh;
    overflow-y: auto;
    user-select: text;
}

.lic-lead {
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--app-text-muted, #94a3b8);
}

.lic-sep {
    height: 1px;
    margin: 16px 0;
    background: var(--app-border, #2d3a56);
}

.lic-group { margin-top: 14px; }

.lic-group-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--app-text-dim, #4a6080);
    margin-bottom: 6px;
}

.lic-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 0;
    font-size: 0.8rem;
}

.lic-name { color: var(--app-text, #e2e8f0); }

.lic-dots {
    flex: 1;
    border-bottom: 1px dotted var(--app-border, #2d3a56);
    transform: translateY(-3px);
}

.lic-type {
    color: var(--app-text-dim, #4a6080);
    font-variant-numeric: tabular-nums;
}

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

.source-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--app-accent, #6366f1);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
    &:hover { color: var(--app-text, #e2e8f0); }
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
