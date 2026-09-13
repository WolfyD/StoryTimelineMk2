<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { AchievementNotification } from '@/stores/notificationsStore'

const props = defineProps<{
	notification: AchievementNotification
}>()

const emit = defineEmits<{ dismiss: [id: number] }>()

const visible = ref(false)

onMounted(() => {
	// Small delay so the CSS transition fires after mount
	requestAnimationFrame(() => { visible.value = true })
	setTimeout(() => dismiss(), 5000)
})

function dismiss() {
	visible.value = false
	setTimeout(() => emit('dismiss', props.notification.id), 400)
}
</script>

<template>
	<Transition name="achievement-slide">
		<div v-if="visible" class="achievement-toast" @click="dismiss" role="alert">
			<div class="achievement-header">
				<i class="ri-trophy-fill achievement-icon"></i>
				<span class="achievement-label">Achievement Unlocked</span>
			</div>
			<div class="achievement-body">
				<img
					v-if="notification.imageBase64"
					:src="notification.imageBase64"
					class="achievement-image"
					alt=""
				/>
				<div class="achievement-text">
					<div class="achievement-title">{{ notification.title }}</div>
					<div class="achievement-flavor">{{ notification.flavorText }}</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<style scoped lang="scss">
.achievement-toast {
	width: 300px;
	background: linear-gradient(135deg, #1a1130 0%, #0d0820 100%);
	border: 1px solid rgba(167, 139, 250, 0.35);
	border-radius: 8px;
	box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.1);
	cursor: pointer;
	overflow: hidden;
	user-select: none;

	&:hover { border-color: rgba(167, 139, 250, 0.55); }
}

.achievement-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 7px 12px 6px;
	background: rgba(167, 139, 250, 0.12);
	border-bottom: 1px solid rgba(167, 139, 250, 0.2);
}

.achievement-icon {
	color: #c4b5fd;
	font-size: 13px;
}

.achievement-label {
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: #a78bfa;
}

.achievement-body {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
}

.achievement-image {
	width: 40px;
	height: 40px;
	object-fit: cover;
	border-radius: 6px;
	border: 1px solid rgba(167, 139, 250, 0.3);
	flex-shrink: 0;
}

.achievement-text {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.achievement-title {
	font-size: 13px;
	font-weight: 600;
	color: #e2d9ff;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.achievement-flavor {
	font-size: 11px;
	color: #8b7ab8;
	line-height: 1.4;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

// Steam-style: enters sliding up from below
.achievement-slide-enter-active { transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease; }
.achievement-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.achievement-slide-enter-from  { transform: translateY(110%); opacity: 0; }
.achievement-slide-leave-to    { transform: translateX(110%); opacity: 0; }
</style>
