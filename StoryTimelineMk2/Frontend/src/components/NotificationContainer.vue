<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notificationsStore'
import AchievementToast from './AchievementToast.vue'
import MilestoneToast from './MilestoneToast.vue'

const store = useNotificationsStore()
</script>

<template>
	<!-- Achievement stack: lower-right, slides up Steam-style -->
	<Teleport to="body">
		<div class="achievement-stack" aria-live="polite">
			<TransitionGroup name="achievement-stack" tag="div" class="achievement-stack-inner">
				<AchievementToast
					v-for="notif in store.achievementQueue"
					:key="notif.id"
					:notification="notif"
					@dismiss="store.dismissAchievement"
				/>
			</TransitionGroup>
		</div>
	</Teleport>

	<!-- Milestone: top-center, one at a time -->
	<Teleport to="body">
		<div class="milestone-stack" aria-live="assertive">
			<MilestoneToast
				v-if="store.milestoneQueue[0]"
				:key="store.milestoneQueue[0].id"
				:notification="store.milestoneQueue[0]"
				@dismiss="store.dismissMilestone"
			/>
		</div>
	</Teleport>
</template>

<style scoped lang="scss">
.achievement-stack {
	position: fixed;
	bottom: 20px;
	right: 20px;
	z-index: 9000;
	pointer-events: none;
}

.achievement-stack-inner {
	display: flex;
	flex-direction: column-reverse;
	gap: 10px;
	align-items: flex-end;
	pointer-events: auto;
}

.milestone-stack {
	position: fixed;
	top: 20px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 9001;
	pointer-events: auto;
}

// TransitionGroup move animation so stacked toasts shift smoothly
.achievement-stack-move {
	transition: transform 0.3s ease;
}
</style>
