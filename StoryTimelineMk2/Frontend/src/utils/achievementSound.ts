// Web Audio API chimes — no audio files needed.
// Each note fades in quickly and decays smoothly to avoid clicks.

// Web Audio API chimes — no audio files needed.
// Each note fades in quickly and decays smoothly to avoid clicks.
// Exponential ramps sound more natural than linear for gain envelopes.

function playNotes(frequencies: number[], stepMs: number, peakGain: number): void {
	try {
		const ctx = new AudioContext()
		frequencies.forEach((freq, i) => {
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()
			osc.connect(gain)
			gain.connect(ctx.destination)
			osc.type = 'sine'
			osc.frequency.value = freq
			const t = ctx.currentTime + (i * stepMs) / 1000
			gain.gain.setValueAtTime(0.001, t)
			gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.08)
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
			osc.start(t)
			osc.stop(t + 0.6)
		})
	} catch {
		// Non-fatal: AudioContext blocked or unavailable
	}
}

// C5 → E5 → G5 — a light ascending triad
export function playAchievementChime(): void {
	playNotes([523.25, 659.25, 783.99], 150, 0.16)
}

// C5 → E5 → G5 → C6 — a fuller resolved phrase
export function playMilestoneChime(): void {
	playNotes([523.25, 659.25, 783.99, 1046.5], 180, 0.20)
}
