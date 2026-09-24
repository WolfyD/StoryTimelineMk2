import "./assets/main.scss"
import { createApp } from 'vue'
import { installNumberInputStepping } from './utils/numberInputStepping'
import { createPinia } from 'pinia'
import RelationsApp from './pages/RelationsApp.vue'
import { installDevHelpers } from './utils/devHelpers'

const app = createApp(RelationsApp)
app.use(createPinia())
app.mount('#app')
installNumberInputStepping()

installDevHelpers()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
