import "./assets/main.scss"
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import YearCalendarApp from './pages/YearCalendarApp.vue'

const app = createApp(YearCalendarApp)
app.use(createPinia())
app.mount('#app')

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
