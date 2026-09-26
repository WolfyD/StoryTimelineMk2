import "./assets/main.scss"
import { createApp } from 'vue'
import { installNumberInputStepping } from './utils/numberInputStepping'
import { createPinia } from 'pinia'
import CalendarApp from './pages/CalendarApp.vue'
import { loadShortcutOverrides } from './utils/shortcutOverrides'
import { installErrorReporting } from './bridge/api'

const app = createApp(CalendarApp)
app.use(createPinia())
// Before mount, or the first render is the one thing not covered.
installErrorReporting(app)
app.mount('#app')
installNumberInputStepping()
void loadShortcutOverrides()   // the registry is reactive, so a late answer still redraws the hints

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
