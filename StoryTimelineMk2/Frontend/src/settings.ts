import './assets/main.css' // Or your scss file
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import SettingsApp from './pages/SettingsApp.vue' // We will create this next

const app = createApp(SettingsApp)
app.use(createPinia())
app.mount('#app')