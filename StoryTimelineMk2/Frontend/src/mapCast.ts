import "./assets/main.scss"
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import MapCastApp from './pages/MapCastApp.vue'
import { installDevHelpers } from './utils/devHelpers'
import { installErrorReporting } from './bridge/api'

const app = createApp(MapCastApp)
app.use(createPinia())
// Before mount, or the first render is the one thing not covered.
installErrorReporting(app)
app.mount('#app')

installDevHelpers()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
