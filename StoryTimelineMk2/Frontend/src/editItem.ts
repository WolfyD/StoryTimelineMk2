import "./assets/main.scss" // Or your scss file
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import EditItem from './pages/EditItem.vue' // We will create this next

const app = createApp(EditItem)
app.use(createPinia())
app.mount('#app')
