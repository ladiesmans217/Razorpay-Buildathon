/** Browser audio helpers for Gemini Live: 16 kHz PCM in, 24 kHz PCM out. */

export type PcmHandler = (base64Pcm: string) => void;

function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function downsampleBuffer(buffer: Float32Array, sampleRate: number, outRate: number): Float32Array {
  if (outRate === sampleRate) return buffer;
  const ratio = sampleRate / outRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export class MicStreamer {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muted = false;

  async start(onPcm: PcmHandler) {
    if (typeof window === "undefined") throw new Error("Mic only works in the browser.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1
      },
      video: false
    });
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but widely supported; fine for demo reliability.
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (this.muted || !this.context) return;
      const input = event.inputBuffer.getChannelData(0);
      const down = downsampleBuffer(input, this.context.sampleRate, 16000);
      const pcm = floatTo16BitPCM(down);
      onPcm(arrayBufferToBase64(pcm));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
  }
}

export class PcmPlayer {
  private context: AudioContext | null = null;
  private nextTime = 0;
  private sources: AudioBufferSourceNode[] = [];

  private ensureContext() {
    if (!this.context) {
      this.context = new AudioContext({ sampleRate: 24000 });
      this.nextTime = this.context.currentTime;
    }
    return this.context;
  }

  async playBase64Pcm(base64: string, sampleRate = 24000) {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    const pcm = base64ToArrayBuffer(base64);
    const int16 = new Int16Array(pcm);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) float32[i] = int16[i] / 32768;
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
    };
  }

  /** Barge-in: stop all queued playback immediately. */
  interrupt() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    if (this.context) this.nextTime = this.context.currentTime;
  }

  dispose() {
    this.interrupt();
    void this.context?.close();
    this.context = null;
  }
}
