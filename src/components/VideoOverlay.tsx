"use client";

import { useEffect, useRef, useState } from "react";
import type { Unit } from "@/lib/metrics";

type Phase = "idle" | "uploading" | "processing" | "done" | "failed";

export default function VideoOverlay({ tripId, unit }: { tripId: string; unit: Unit }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const upload = (file: File) => {
    setErr(null);
    setUrl(null);
    setPhase("uploading");
    setProgress(0);
    const fd = new FormData();
    fd.append("tripId", tripId);
    fd.append("unit", unit);
    fd.append("video", file);
    // XHR for upload progress
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/video/overlay");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { renderId?: string; error?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 300 || !data.renderId) {
        setErr(data.error || "Upload failed");
        setPhase("failed");
        return;
      }
      setPhase("processing");
      const id = data.renderId;
      pollRef.current = window.setInterval(async () => {
        const r = await fetch(`/api/video/${id}`).then((r) => r.json()).catch(() => null);
        if (!r) return;
        if (r.status === "done") {
          clearInterval(pollRef.current!);
          setUrl(r.url);
          setPhase("done");
        } else if (r.status === "failed") {
          clearInterval(pollRef.current!);
          setErr(r.error || "Render failed");
          setPhase("failed");
        }
      }, 1500);
    };
    xhr.onerror = () => {
      setErr("Network error");
      setPhase("failed");
    };
    xhr.send(fd);
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Reels Overlay</h3>
          <p className="mt-1 text-xs text-muted">
            Upload your POV clip. We burn your TripRank stats, live speedo and logo onto a 1080×1920 video with FFmpeg.
          </p>
        </div>
        <span className="rounded-full bg-neon/10 px-2 py-1 text-[10px] font-bold tracking-widest text-neon">9:16</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />

      {phase === "idle" || phase === "failed" ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neon/40 bg-neon/5 py-6 text-sm font-semibold text-neon transition hover:bg-neon/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" /></svg>
          Upload POV video (max 60s used)
        </button>
      ) : null}

      {phase === "uploading" && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted"><span>Uploading…</span><span>{progress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full bg-linear-to-r from-lime to-neon transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {phase === "processing" && (
        <div className="mt-4 flex items-center gap-3 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neon border-t-transparent" />
          Rendering with FFmpeg… this can take a minute.
        </div>
      )}
      {phase === "done" && url && (
        <div className="mt-4 space-y-3">
          <video src={url} controls playsInline className="mx-auto max-h-[70vh] rounded-xl bg-black" />
          <div className="flex gap-2">
            <a href={`${url}?download=1`} className="flex-1 rounded-full bg-linear-to-r from-lime to-neon py-3 text-center text-sm font-bold text-black">
              Download MP4
            </a>
            <button onClick={() => fileRef.current?.click()} className="rounded-full border border-line px-4 text-sm text-muted">
              New clip
            </button>
          </div>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
    </div>
  );
}
