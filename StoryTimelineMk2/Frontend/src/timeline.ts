import './assets/main.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TimelineApp from './pages/TimelineApp.vue'
import { installDevHelpers } from './utils/devHelpers'

const app = createApp(TimelineApp)
app.use(createPinia())
app.mount('#app')

installDevHelpers()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}