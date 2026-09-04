/** Camera JPEG frames for Gemini Live (max ~1 FPS). */

export class CameraFrameStreamer {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private canvas: HTMLCanvasElement | null = null;

  async start(onFrame: (base64Jpeg: string) => void, fps = 1) {
    if (typeof window === "undefined") throw new Error("Camera only works in the browser.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    this.canvas = document.createElement("canvas");
    const intervalMs = Math.max(1000, Math.round(1000 / Math.min(fps, 1)));
    this.timer = setInterval(() => {
      if (!this.video || !this.canvas || !this.video.videoWidth) return;
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(this.video, 0, 0);
      const dataUrl = this.canvas.toDataURL("image/jpeg", 0.7);
      const base64 = dataUrl.split(",")[1];
      if (base64) onFrame(base64);
    }, intervalMs);
    return this.video;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.canvas = null;
  }
}
