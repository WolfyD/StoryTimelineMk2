<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { AchievementNotification } from '@/stores/notificationsStore'

const props = defineProps<{
	notification: AchievementNotification
}>()

const emit = defineEmits<{ dismiss: [id: number] }>()

const visible = ref(false)

onMounted(() => {
	requestAnimationFrame(() => { visible.value = true })
	setTimeout(() => dismiss(), 7000)
})

function dismiss() {
	visible.value = false
	setTimeout(() => emit('dismiss', props.notification.id), 400)
}
</script>

<template>
	<Transition name="milestone-slide">
		<div v-if="visible" class="milestone-toast" @click="dismiss" role="alert">
			<div class="milestone-shimmer"></div>
			<div class="milestone-inner">
				<div v-if="notification.characterName" class="milestone-character">
					{{ notification.characterName }}
				</div>
				<img
					v-if="notification.imageBase64"
					:src="notification.imageBase64"
					class="milestone-image"
					alt=""
				/>
				<div class="milestone-title">{{ notification.title }}</div>
				<div class="milestone-flavor">{{ notification.flavorText }}</div>
			</div>
		</div>
	</Transition>
</template>

<style scoped lang="scss">
.milestone-toast {
	position: relative;
	width: 460px;
	max-width: 92vw;
	background: linear-gradient(160deg, #120b2e 0%, #0a0518 100%);
	border-radius: 10px;
	overflow: hidden;
	cursor: pointer;
	user-select: none;
	box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 40px rgba(99,102,241,0.15);

	// Animated shimmer border via pseudo-element
	&::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 10px;
		padding: 1px;
		background: linear-gradient(135deg,
			rgba(167,139,250,0.8) 0%,
			rgba(99,102,241,0.4) 30%,
			rgba(167,139,250,0.8) 60%,
			rgba(99,102,241,0.4) 100%);
		background-size: 200% 200%;
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		animation: shimmer-border 3s linear infinite;
		pointer-events: none;
	}
}

@keyframes shimmer-border {
	0%   { background-position: 0% 50%; }
	50%  { background-position: 100% 50%; }
	100% { background-position: 0% 50%; }
}

.milestone-shimmer {
	position: absolute;
	inset: 0;
	background: linear-gradient(105deg,
		transparent 30%,
		rgba(167,139,250,0.06) 50%,
		transparent 70%);
	background-size: 200% 100%;
	animation: shimmer-sweep 2.5s ease-in-out infinite;
	pointer-events: none;
}

@keyframes shimmer-sweep {
	0%   { background-position: 200% 0; }
	100% { background-position: -100% 0; }
}

.milestone-inner {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 20px 24px 18px;
	text-align: center;
}

.milestone-character {
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: #a78bfa;
}

.milestone-image {
	width: 64px;
	height: 64px;
	object-fit: cover;
	border-radius: 50%;
	border: 2px solid rgba(167,139,250,0.5);
	box-shadow: 0 0 16px rgba(167,139,250,0.3);
}

.milestone-title {
	font-size: 16px;
	font-weight: 700;
	color: #ede9fe;
	line-height: 1.2;
}

.milestone-flavor {
	font-size: 12px;
	color: #7c6bab;
	line-height: 1.5;
	max-width: 360px;
}

// Enters from top, exits upward
.milestone-slide-enter-active { transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease; }
.milestone-slide-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.milestone-slide-enter-from  { transform: translateY(-110%); opacity: 0; }
.milestone-slide-leave-to    { transform: translateY(-110%); opacity: 0; }
</style>
