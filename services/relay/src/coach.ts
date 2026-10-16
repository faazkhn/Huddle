import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import type { RoundSummary } from "@huddle/protocol";
import type { Coach } from "./relay.ts";

const SYSTEM = `You are an upbeat sports commentator for a family living-room game called Huddle.
Write ONE or TWO short sentences (max 40 words total) that name the winner and give one concrete form tip.
Rules: family-friendly; never insult anyone; never comment on bodies, weight or appearance; refer to players only by the display names given; plain text only, no emojis, no markdown.`;

const TIMEOUT_MS = 4000;
const AUDIO_TTL_MS = 5 * 60_000;

/** Mid-round Boot Camp callouts, synthesized once at startup so no LLM call happens mid-round. */
export const CALLOUTS: Record<string, string> = {
  ten_reps: "Ten reps! Keep it rolling!",
  halfway: "Halfway there, don't stop now!",
  last_ten: "Ten seconds left, empty the tank!",
  next_up: "Shake it out, next exercise coming up!",
  swish: "Swish! That's textbook form!",
};

export function fallbackLine(s: RoundSummary): string {
  const w = [...s.players].sort((a, b) => a.rank - b.rank)[0];
  if (!w) return "Great hustle, everyone! Let's run it back.";
  const tip = s.players.find((p) => p.weakest)?.weakest;
  return `${w.name} takes it with ${w.score} points! ${tip ? `Next round, focus on: ${tip}.` : "What a round!"}`;
}

export function createCoach(env: NodeJS.ProcessEnv, baseUrl: string): Coach & { audio: Map<string, { buf: Uint8Array; exp: number }>; ready: Promise<void> } {
  const audio = new Map<string, { buf: Uint8Array; exp: number }>();
  const callouts = new Map<string, string>();
  const enabled = !!(env.BEDROCK_MODEL_ID && env.AWS_REGION);
  const bedrock = enabled ? new BedrockRuntimeClient({ region: env.AWS_REGION }) : null;
  const polly = enabled ? new PollyClient({ region: env.AWS_REGION }) : null;
  const voice = env.POLLY_VOICE_ID || "Matthew";

  async function speak(text: string, signal?: AbortSignal): Promise<Uint8Array> {
    const r = await polly!.send(new SynthesizeSpeechCommand({ Text: text, OutputFormat: "mp3", VoiceId: voice as never, Engine: "neural" }), { abortSignal: signal });
    return r.AudioStream!.transformToByteArray();
  }
  const store = (buf: Uint8Array, ttl = AUDIO_TTL_MS) => {
    const id = crypto.randomUUID();
    audio.set(id, { buf, exp: ttl === Infinity ? Infinity : Date.now() + ttl });
    return `${baseUrl}/audio/${id}.mp3`;
  };
  setInterval(() => { for (const [k, v] of audio) if (v.exp < Date.now()) audio.delete(k); }, 30_000).unref();

  const ready = enabled
    ? Promise.all(Object.entries(CALLOUTS).map(async ([k, text]) => callouts.set(k, store(await speak(text), Infinity))))
      .then(() => console.log(`coach: ${callouts.size} callouts pre-synthesized with Polly (${voice})`))
      .catch((e) => console.warn("coach: callout synthesis failed, captions only:", e.message))
    : Promise.resolve(console.log("coach: BEDROCK_MODEL_ID/AWS_REGION not set — using caption-only fallback lines"));

  return {
    audio, ready,
    callout: (key) => callouts.get(key),
    async line(summary) {
      if (!enabled) return { text: fallbackLine(summary) };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        // Only structured scores and sanitized display names reach the model.
        const input = JSON.stringify({ mode: summary.mode, players: summary.players });
        const r = await bedrock!.send(new ConverseCommand({
          modelId: env.BEDROCK_MODEL_ID,
          system: [{ text: SYSTEM }],
          messages: [{ role: "user", content: [{ text: `Round results JSON: ${input}` }] }],
          inferenceConfig: { maxTokens: 120, temperature: 0.8 },
        }), { abortSignal: ac.signal });
        const text = r.output?.message?.content?.[0]?.text?.trim().replace(/\s+/g, " ").slice(0, 300);
        if (!text) throw new Error("empty completion");
        return { text, audioUrl: store(await speak(text, ac.signal)) };
      } catch (e) {
        console.warn("coach: falling back:", (e as Error).message);
        return { text: fallbackLine(summary) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
