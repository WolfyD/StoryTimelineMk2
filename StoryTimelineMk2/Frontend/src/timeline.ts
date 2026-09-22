import './assets/main.scss'
import { createApp } from 'vue'
import { installNumberInputStepping } from './utils/numberInputStepping'
import { createPinia } from 'pinia'
import TimelineApp from './pages/TimelineApp.vue'
import { loadShortcutOverrides } from './utils/shortcutOverrides'
import { installDevHelpers } from './utils/devHelpers'

const app = createApp(TimelineApp)
app.use(createPinia())
app.mount('#app')
installNumberInputStepping()
void loadShortcutOverrides()   // the registry is reactive, so a late answer still redraws the hints

installDevHelpers()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}