import './assets/main.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import SettingsApp from './pages/SettingsApp.vue' // We will create this next

const app = createApp(SettingsApp)
app.use(createPinia())
app.mount('#app')

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}