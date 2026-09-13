import './assets/main.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installDevHelpers } from './utils/devHelpers'

const app = createApp(App)

app.use(createPinia())

app.mount('#app')

installDevHelpers()

const splash = document.getElementById('app-loading')
if (splash) {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
