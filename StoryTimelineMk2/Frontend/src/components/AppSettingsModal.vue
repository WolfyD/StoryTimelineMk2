<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PhFolderOpen, PhArrowSquareOut, PhCopy, PhFloppyDisk, PhPaintBrush } from '@phosphor-icons/vue'
import { BackendAPI, type BridgeError } from '@/bridge/api'
import type { BackupInfo } from '@/types/models'
import BaseModal from './BaseModal.vue'
import AppThemeModal from './AppThemeModal.vue'
import { useTimelineStore } from '@/stores/timelineStore'
import { FILE_MANAGER } from '@/utils/platform'

const emit = defineEmits<{ close: []; refresh: [] }>()
const store = useTimelineStore()

const showThemeModal = ref(false)
const currentRoot = ref('')
const pendingPath = ref('')
const includeMedia = ref(true)
const isBusy = ref(false)
const feedback = ref<{ type: 'success' | 'error'; msg: string } | null>(null)
const performantPanning = ref(true)
const onScreenControls = ref(false)
const lowResourceMode = ref(false)

const backupInterval  = ref('never')
const backupsFolderPath = ref('')
const recentBackups   = ref<BackupInfo[]>([])

const showAchievementPopups = ref(true)
const achievementSound = ref(true)

function showFeedback(type: 'success' | 'error', msg: string) {
    feedback.value = { type, msg }
    if (type === 'success') setTimeout(() => { feedback.value = null }, 4000)
}

/**
 * Every call in here crosses the bridge, and `api.ts` rejects whatever the backend reports as an
 * error. Not one of these handlers caught it, so a failed backup fell through to the global
 * `unhandledrejection` net in `api.ts`: the message arrived as a bare browser alert from nowhere in
 * particular, and the modal behind it read "Working..." for good -- button disabled, no way back
 * except closing it. A bridge *timeout* carries no payload, so that net skips it and nothing at all
 * was shown. One wrapper rather than a `try` per handler, because the remedy is identical every time
 * and per-handler is exactly what got forgotten. Catching here also means the global net stays quiet,
 * so the message is said once, in the modal that asked for it.
 */
async function guard<T>(what: string, call: () => Promise<T>): Promise<T | null> {
    try {
        return await call()
    } catch (e) {
        // `detail` carries the C# stack; `reported` means the backend already put its own dialog up.
        console.error(`[AppSettings] ${what} failed:`, e, (e as BridgeError).payload?.detail)
        if (!(e as BridgeError).payload?.reported) {
            showFeedback('error', `${what} failed: ${e instanceof Error ? e.message : String(e)}`)
        }
        return null
    } finally {
        isBusy.value = false   // whichever handler raised it; a no-op for the ones that never do
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr)
        return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
            + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch { return dateStr }
}

async function loadBackupSettings() {
    const s = await guard('Loading the backup settings', () => BackendAPI.GetBackupSettings())
    if (s) {
        backupInterval.value = s.interval ?? 'never'
        backupsFolderPath.value = s.backupsFolder ?? ''
        recentBackups.value = s.recentBackups ?? []
    }
}

async function saveInterval() {
    await guard('Saving the backup schedule', () => BackendAPI.SaveBackupSettings(backupInterval.value))
}

onMounted(() => {
    // One guard for the whole load: whichever of the four reads fails, the modal opens on its message
    // rather than on blank fields.
    void guard('Loading the app settings', async () => {
        const cfg = await BackendAPI.GetAppConfig()
        if (cfg) {
            currentRoot.value = cfg.DataRoot
            performantPanning.value = cfg.performantPanning ?? true
            showAchievementPopups.value = cfg.showAchievementPopups ?? true
            achievementSound.value = cfg.achievementSound ?? true
        }
        onScreenControls.value = (await BackendAPI.GetMiscSetting('on_screen_controls', 0))?.value === '1'
        lowResourceMode.value = (await BackendAPI.GetMiscSetting('low_resource_mode', 0))?.value === '1'
        await loadBackupSettings()
    })
})

async function saveNotificationSettings() {
    await guard('Saving the notification settings', async () => {
        await BackendAPI.SaveNotificationSettings(showAchievementPopups.value, achievementSound.value)
        const { useNotificationsStore } = await import('@/stores/notificationsStore')
        useNotificationsStore().setSettings(showAchievementPopups.value, achievementSound.value)
    })
}

async function toggleLowResourceMode(value: boolean) {
    lowResourceMode.value = value
    await guard('Saving low resource mode', () => store.setLowResourceMode(value))
}

async function toggleOnScreenControls(value: boolean) {
    onScreenControls.value = value
    await guard('Saving the on-screen controls setting', () => store.setOnScreenControls(value))
}

async function togglePerformantPanning(value: boolean) {
    performantPanning.value = value
    store.setPerformantPanning(value)
    await guard('Saving performant panning', () => BackendAPI.SavePerformantPanning(value))
}

async function browse() {
    const result = await guard('Browsing for a folder', () => BackendAPI.BrowseDataFolder())
    if (result?.path) pendingPath.value = result.path
}

async function copyAndSwitch() {
    if (!pendingPath.value) return
    isBusy.value = true
    feedback.value = null
    const result = await guard('Copying the data folder', () => BackendAPI.MoveDataFolder(pendingPath.value))
    if (!result) return   // guard has already said what went wrong
    if (result.status === 'ok') {
        currentRoot.value = pendingPath.value
        pendingPath.value = ''
        showFeedback('success', 'Data copied and folder switched successfully.')
        emit('refresh')
    } else {
        showFeedback('error', result?.message ?? 'Failed to copy data.')
    }
}

async function justSwitch() {
    if (!pendingPath.value) return
    isBusy.value = true
    feedback.value = null
    const result = await guard('Switching the data folder', () => BackendAPI.SetDataRoot(pendingPath.value))
    if (!result) return   // guard has already said what went wrong
    if (result.status === 'ok') {
        currentRoot.value = pendingPath.value
        pendingPath.value = ''
        if ((result as any).isNewDb)
            showFeedback('success', 'Data folder switched. No existing database was found — a fresh one has been created.')
        else
            showFeedback('success', 'Data folder updated. Timelines reloaded from new location.')
        emit('refresh')
    } else {
        showFeedback('error', result?.message ?? 'Failed to update folder.')
    }
}

async function openDataFolder() {
    BackendAPI.OpenDataFolder()   // fire-and-forget: no reply to fail, so nothing for guard to catch
}

async function createBackup() {
    isBusy.value = true
    feedback.value = null
    const result = await guard('Backup', () => BackendAPI.CreateBackup(includeMedia.value))
    if (!result) return   // guard has already said what went wrong
    if (result.status === 'ok') {
        showFeedback('success', `Backup saved to backups folder.`)
        await loadBackupSettings()
    } else if (result.status !== 'cancelled') {
        showFeedback('error', result.message ?? 'Backup failed.')
    }
}
</script>

<template>
    <BaseModal title="App Settings" width="min(520px, 92vw)" max-height="98dvh" @close="emit('close')">
        <div class="modal-body">

            <!-- ── App Theme ── -->
            <section class="settings-section">
                <h4 class="section-label">Appearance</h4>
                <p class="hint">Customise colors, borders, and sizes for the application chrome.</p>
                <button class="btn btn-secondary" @click="showThemeModal = true">
                    <PhPaintBrush :size="14" />
                    Open theme settings…
                </button>

                <label class="toggle-label">
                    <input type="checkbox" :checked="onScreenControls" @change="toggleOnScreenControls(($event.target as HTMLInputElement).checked)" />
                    On-screen scroll buttons
                </label>
                <p class="hint">
                    Puts a round button on each side of the timeline that scrolls it while you hold
                    it down — the same thing the ← / → keys do, for when your hands are on the mouse.
                    Hold Shift for 3× speed; the speed itself is the box next to the FPS counter.
                </p>
            </section>

            <!-- ── Performance ── -->
            <section class="settings-section">
                <h4 class="section-label">Performance</h4>
                <label class="toggle-label">
                    <input type="checkbox" :checked="lowResourceMode" @change="toggleLowResourceMode(($event.target as HTMLInputElement).checked)" />
                    Low resource mode
                </label>
                <p class="hint">
                    Trades some polish for speed on a busy timeline: the view jumps straight to where
                    it is going instead of gliding there, changing detail level is instant, the
                    marker that follows your cursor is switched off, the minimap is hidden, and the
                    canvas is drawn at 1:1 rather than at your display's full pixel density — sharp
                    text costs four times the drawing on a high-resolution screen. Reopen the
                    timeline window for it to take effect; the FPS counter at the bottom will tell
                    you whether it helped.
                </p>
                <label class="toggle-label">
                    <input type="checkbox" :checked="performantPanning" @change="togglePerformantPanning(($event.target as HTMLInputElement).checked)" />
                    Performant panning
                </label>
                <p class="hint">
                    When enabled, only items are redrawn on each drag frame — grid tick marks
                    rebuild only every 300 px of pan. Disable for a full redraw on every frame
                    (slower, but may help if you notice visual glitches during panning).
                </p>
            </section>

            <!-- ── Data Folder ── -->
            <section class="settings-section">
                <h4 class="section-label">Data Folder</h4>

                <div class="current-path-row">
                    <div class="path-box" :title="currentRoot">
                        <PhFolderOpen :size="14" class="path-icon" />
                        <span class="path-text">{{ currentRoot || '…' }}</span>
                    </div>
                    <button class="btn btn-ghost" @click="openDataFolder" :title="`Open in ${FILE_MANAGER}`">
                        <PhArrowSquareOut :size="15" />
                        Open
                    </button>
                </div>

                <p class="hint">To move or change the data folder, browse for a destination below.</p>

                <div class="browse-row">
                    <input
                        class="path-input"
                        type="text"
                        :value="pendingPath"
                        placeholder="New folder path…"
                        readonly
                    />
                    <button class="btn btn-secondary" :disabled="isBusy" @click="browse">Browse…</button>
                </div>

                <div class="change-actions" v-if="pendingPath && pendingPath !== currentRoot">
                    <button class="btn btn-primary" :disabled="isBusy" @click="copyAndSwitch">
                        <PhCopy :size="14" />
                        Copy data here &amp; switch
                    </button>
                    <button class="btn btn-secondary" :disabled="isBusy" @click="justSwitch">
                        Use this folder (no copy)
                    </button>
                </div>

                <p class="hint warn" v-if="pendingPath && pendingPath !== currentRoot">
                    "Use this folder" will load whatever data already exists there.
                    Old files are never deleted automatically.
                </p>
            </section>

            <!-- ── Backup ── -->
            <section class="settings-section">
                <h4 class="section-label">Backup</h4>

                <div class="setting-row">
                    <span class="setting-key">Auto-backup</span>
                    <select v-model="backupInterval" @change="saveInterval" class="interval-select">
                        <option value="never">Never</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>

                <label class="toggle-label">
                    <input type="checkbox" v-model="includeMedia" />
                    Include images &amp; media files
                </label>

                <div class="backup-actions-row">
                    <button class="btn btn-secondary" :disabled="isBusy" @click="createBackup">
                        <PhFloppyDisk :size="15" />
                        Create Backup Now
                    </button>
                    <button class="btn btn-ghost" @click="BackendAPI.OpenBackupsFolder()" :title="`Open backups folder in ${FILE_MANAGER}`">
                        <PhArrowSquareOut :size="14" />
                        Open folder
                    </button>
                </div>

                <template v-if="recentBackups.length">
                    <p class="backup-list-label">Recent backups</p>
                    <div class="recent-backups">
                        <div v-for="b in recentBackups.slice(0, 8)" :key="b.FileName" class="backup-entry">
                            <span class="backup-name" :title="b.FileName">{{ b.FileName }}</span>
                            <span class="backup-meta">{{ formatBytes(b.SizeBytes) }} · {{ formatDate(b.CreatedAt) }}</span>
                        </div>
                    </div>
                </template>

                <p class="hint">
                    Backups are saved to a <code>backups/</code> folder inside your data directory.
                    The 20 most recent are kept; older ones are pruned automatically.
                </p>
            </section>

            <!-- ── Notifications ── -->
            <section class="settings-section">
                <h4 class="section-label">Notifications</h4>
                <label class="toggle-label">
                    <input
                        type="checkbox"
                        :checked="showAchievementPopups"
                        @change="showAchievementPopups = ($event.target as HTMLInputElement).checked; saveNotificationSettings()"
                    />
                    Achievement notifications
                </label>
                <label class="toggle-label" :class="{ disabled: !showAchievementPopups }">
                    <input
                        type="checkbox"
                        :checked="achievementSound"
                        :disabled="!showAchievementPopups"
                        @change="achievementSound = ($event.target as HTMLInputElement).checked; saveNotificationSettings()"
                    />
                    Achievement sounds
                </label>
                <p class="hint">
                    When enabled, unlocking achievements and character milestones shows
                    a toast notification with an optional chime.
                </p>
            </section>

            <!-- ── Feedback ── -->
            <div v-if="isBusy" class="feedback feedback--busy">Working…</div>
            <div v-else-if="feedback" class="feedback" :class="`feedback--${feedback.type}`">
                {{ feedback.msg }}
            </div>

        </div>
        <template #footer>
            <button class="btn btn-cancel" data-cancel @click="emit('close')">Close</button>
        </template>
    </BaseModal>

    <Teleport to="body">
        <AppThemeModal v-if="showThemeModal" @close="showThemeModal = false" />
    </Teleport>
</template>

<style scoped lang="scss">
.modal-body {
    padding: 16px 24px 20px;
    display: flex; flex-direction: column; gap: 16px;
    overflow-y: auto;
}

// ── Sections ──
.settings-section {
    display: flex; flex-direction: column; gap: 8px;
    padding: 14px 16px;
    background: var(--app-surface, #0c1524);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 6px);
}

.section-label {
    margin: 0 0 4px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--app-text-dim, #4a6080);
}

// ── Current path ──
.current-path-row {
    display: flex; align-items: center; gap: 8px;
}

.path-box {
    flex: 1; display: flex; align-items: center; gap: 6px;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    padding: 6px 10px; overflow: hidden; min-width: 0;
}

.path-icon { color: #79876b; flex-shrink: 0; }

.path-text {
    font-size: 12px; color: var(--app-text-muted, #94a3b8); font-family: monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

// ── Browse row ──
.browse-row {
    display: flex; gap: 8px; align-items: center;
}

.path-input {
    flex: 1;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    color: var(--app-text-muted, #94a3b8); font-size: 12px; font-family: monospace;
    padding: 6px 10px; outline: none; cursor: default;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}

// ── Change actions ──
.change-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding-top: 4px;
}

// ── Hints ──
.hint {
    margin: 0; font-size: 11px; color: var(--app-text-dim, #4a6080); line-height: 1.5;
    &.warn { color: #c9953a; }
}

// ── Toggle ──
.toggle-label {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; color: var(--app-text-muted, #94a3b8); cursor: pointer; user-select: none;
    input { cursor: pointer; }
}

// ── Feedback ──
.feedback {
    padding: 8px 12px; border-radius: var(--app-radius-sm, 5px); font-size: 12px; line-height: 1.5;
    &--busy    { background: var(--app-surface-high, #1e2b44); color: var(--app-text-muted, #94a3b8); }
    &--success { background: #1a3326; color: #6fcf97; border: 1px solid #2d6b4a; }
    &--error   { background: #3a1a1a; color: #f87171; border: 1px solid #6b2d2d; }
}

// ── Backup section ──
.setting-row {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 13px; color: var(--app-text-muted, #94a3b8);
}
.setting-key { color: var(--app-text-muted, #94a3b8); }
.interval-select {
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px);
    color: var(--app-text, #e2e8f0); font-size: 12px;
    padding: 4px 8px; cursor: pointer; outline: none;
    &:focus { border-color: var(--app-accent, #3b6ec4); }
}
.backup-actions-row {
    display: flex; gap: 8px; align-items: center;
}
.backup-list-label {
    margin: 4px 0 0; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--app-text-dim, #4a6080);
}
.recent-backups {
    display: flex; flex-direction: column; gap: 2px;
    max-height: 160px; overflow-y: auto;
    background: var(--app-surface-raised, #141e33);
    border: 1px solid var(--app-border, #2d3a56);
    border-radius: var(--app-radius-sm, 4px); padding: 6px 10px;
}
.backup-entry {
    display: flex; justify-content: space-between; align-items: center;
    gap: 8px; padding: 2px 0;
}
.backup-name {
    font-size: 11px; font-family: monospace; color: var(--app-text-muted, #94a3b8);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.backup-meta {
    font-size: 10px; color: var(--app-text-dim, #4a6080); white-space: nowrap; flex-shrink: 0;
}

// ── Buttons ──
.btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border: none; border-radius: var(--app-radius-sm, 4px);
    cursor: pointer; font-size: 12px; font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.btn-primary {
    background: var(--app-accent, #3b6ec4); color: var(--app-text, #e2e8f0);
    &:hover:not(:disabled) { background: var(--app-accent-hover, #4d80d6); }
}

.btn-secondary {
    background: var(--app-surface-high, #1e2b44); color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);
    &:hover:not(:disabled) { background: var(--app-surface-raised, #253453); color: var(--app-text, #e2e8f0); }
}

.btn-ghost {
    background: transparent; color: var(--app-text-dim, #64748b);
    border: 1px solid var(--app-border, #2d3a56);
    padding: 5px 10px; white-space: nowrap;
    &:hover { color: var(--app-text, #e2e8f0); background: rgba(255,255,255,0.04); }
}

.btn-cancel {
    background: transparent; color: var(--app-text-muted, #94a3b8);
    border: 1px solid var(--app-border, #2d3a56);
    &:hover { background: rgba(255,255,255,0.05); color: var(--app-text, #e2e8f0); }
}
</style>
