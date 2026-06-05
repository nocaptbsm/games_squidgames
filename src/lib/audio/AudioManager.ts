// src/lib/audio/AudioManager.ts
// Re-export the canonical SoundManager under the AudioManager name to satisfy
// callers that prefer the new naming. Both refer to the same singleton.

export {
  SoundManager as AudioManager,
  SoundManager,
  type SoundId,
} from "@/managers/SoundManager";
