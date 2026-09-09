import './assets/main.scss' // Or your scss file
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TimelineApp from './pages/TimelineApp.vue' // We will create this next

const app = createApp(TimelineApp)
app.use(createPinia())
app.mount('#app')

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}