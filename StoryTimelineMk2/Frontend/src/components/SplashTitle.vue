<template>
	<h1 class="gradient-title">Story Timeline</h1>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&display=swap');

* {
	user-select: none;
	-webkit-user-drag: none;
}

.gradient-title {
	font-family: 'cinzel', sans-serif;
	font-size: 4rem;
	font-weight: 800;
	letter-spacing: 2px;
	margin: 60px 0 20px 0;
	max-height: 120px;

	/* Create a wide gradient map */
	background: linear-gradient(
		45deg, 
		#9B2A2A, 
		#9EC757, 
		#79C6CC, 
		#8274CE, 
		#ED53B2
	);
	background-size: 400% 400%;
	
	/* Clip the background to the text text */
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
	
	/* Smooth animation loop */
	animation: shiftGradient 12s ease infinite;
}

@keyframes shiftGradient {
	0% {
		background-position: 0% 50%;
	}
	50% {
		background-position: 100% 50%;
	}
	100% {
		background-position: 0% 50%;
	}
}
</style>