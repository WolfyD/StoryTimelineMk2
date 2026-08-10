import "./assets/main.scss"
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import CalendarApp from './pages/CalendarApp.vue'

const app = createApp(CalendarApp)
app.use(createPinia())
app.mount('#app')
