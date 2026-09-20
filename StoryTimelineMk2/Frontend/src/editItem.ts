import "./assets/main.scss"
import { createApp } from 'vue'
import { installNumberInputStepping } from './utils/numberInputStepping'
import { createPinia } from 'pinia'
import EditItem from './pages/EditItem.vue'
import { installDevHelpers } from './utils/devHelpers'

const app = createApp(EditItem)
app.use(createPinia())
app.mount('#app')
installNumberInputStepping()

installDevHelpers()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
