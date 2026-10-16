/**
 * pose-relay phone side: camera + MediaPipe PoseLandmarker -> flat keypoint arrays. No pixels ever leave this module.
 */
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export const POSE_MODEL_LITE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type PoseCamera = {
  video: HTMLVideoElement;
  /** Latest pose as [x, y, visibility] * 33; undefined if there is no new video frame yet, null if no person is visible.
   * y is normalized to image height; x is in the same units centred at 0.5 and mirrored (so a screen avatar behaves like a mirror). */
  read(nowMs: number): number[] | null | undefined;
  aspect(): number;
};

export async function createPoseCamera(video: HTMLVideoElement, opts: { facingMode?: "user" | "environment"; wasmBase: string; modelUrl?: string }): Promise<PoseCamera> {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("getUserMedia unsupported", "NotSupportedError");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: opts.facingMode ?? "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  const fileset = await FilesetResolver.forVisionTasks(opts.wasmBase);
  const make = (delegate: "GPU" | "CPU") => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: opts.modelUrl ?? POSE_MODEL_LITE, delegate }, runningMode: "VIDEO", numPoses: 1,
  });
  const landmarker = await make("GPU").catch(() => make("CPU"));
  let lastTime = -1;
  const aspect = () => video.videoWidth / video.videoHeight || 1;
  return {
    video, aspect,
    read(now) {
      if (video.readyState < 2 || video.currentTime === lastTime) return undefined;
      lastTime = video.currentTime;
      const p = landmarker.detectForVideo(video, now).landmarks[0];
      if (!p) return null;
      // Mirror and convert x to image-height units so joint angles are true regardless of camera aspect.
      const ar = aspect();
      return p.flatMap((l) => [+(0.5 + (0.5 - l.x) * ar).toFixed(3), +l.y.toFixed(3), +(l.visibility ?? 0).toFixed(3)]);
    },
  };
}
