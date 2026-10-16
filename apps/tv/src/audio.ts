import { AudioPlayer } from '@amazon-devices/react-native-w3cmedia';

// Coach voice lines (Polly MP3 served by the relay). Captions are always shown too, so failures are non-fatal.
let player: AudioPlayer | null = null;
let ready: Promise<void> | null = null;

export async function playUrl(url: string) {
  try {
    if (!player) {
      player = new AudioPlayer();
      ready = player.initialize();
    }
    await ready;
    player.src = url;
    await player.play();
    console.log('huddle: playing coach audio', url);
  } catch (e) {
    console.warn('huddle: audio playback failed, captions only', e);
  }
}
