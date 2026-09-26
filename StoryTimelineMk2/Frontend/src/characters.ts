import "./assets/main.scss"
import { createApp } from 'vue'
import { installNumberInputStepping } from './utils/numberInputStepping'
import { createPinia } from 'pinia'
import CharactersApp from './pages/CharactersApp.vue'
import { installErrorReporting } from './bridge/api'

const app = createApp(CharactersApp)
app.use(createPinia())
// Before mount, or the first render is the one thing not covered.
installErrorReporting(app)
app.mount('#app')
installNumberInputStepping()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
