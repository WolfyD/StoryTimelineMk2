import "./assets/main.scss"
import { createApp } from 'vue'
import { installNumberInputStepping } from './utils/numberInputStepping'
import { createPinia } from 'pinia'
import YearCalendarApp from './pages/YearCalendarApp.vue'

const app = createApp(YearCalendarApp)
app.use(createPinia())
app.mount('#app')
installNumberInputStepping()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
