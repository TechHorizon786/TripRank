import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

export const STORAGE_DIR = process.env.VIDEO_STORAGE_DIR || path.join(os.tmpdir(), "triprank-videos");

export async function ensureStorage() {
  await mkdir(path.join(STORAGE_DIR, "uploads"), { recursive: true });
  await mkdir(path.join(STORAGE_DIR, "renders"), { recursive: true });
}

function ffmpegBinary(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStatic as unknown as string | null,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ].filter(Boolean) as string[];
  return candidates.find((c) => existsSync(c)) ?? "ffmpeg";
}

function fontsDir(): string {
  const local = path.join(process.cwd(), "assets", "fonts");
  return existsSync(local) ? local : "/usr/share/fonts/truetype/dejavu";
}

export type OverlayMetrics = {
  topSpeed: string; // e.g. "370 km/h"
  avgSpeed: string;
  maxG: string; // e.g. "1.12 G"
  distance: string;
  rankLine: string; // e.g. "1st fastest in Germany"
  username: string;
  unitLabel: string; // "km/h" | "mph"
  speedSeries: number[]; // per-second speed already in display unit
};

function run(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    p.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

export async function probeDuration(input: string): Promise<number> {
  const { stderr } = await run(ffmpegBinary(), ["-hide_banner", "-i", input]);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const W = 1080;
const H = 1920;
const MAX_SECONDS = 60;

// ASS colours are &HAABBGGRR
const C = {
  white: "&H00FFFFFF",
  cyan: "&H00E6E619",
  cyanGlow: "&H60E6E619",
  gold: "&H001AC2FF",
  gray: "&H00ADA4A0",
  black: "&H00000000",
  shadow: "&H80000000",
};

const assText = (s: string) => s.replace(/[{}\\\n\r]/g, "");

function ts(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

/**
 * Builds the ASS subtitle script that carries all overlay typography:
 * the TripRank wordmark, the @handle, a live speedometer that steps through
 * the trip's speed series in sync with the clip, the 2x2 stats grid and the rank line.
 */
export function buildAss(m: OverlayMetrics, durationSec: number): string {
  const d = Math.max(1, Math.min(durationSec || m.speedSeries.length || 1, MAX_SECONDS));
  const end = ts(d + 0.5);
  const style = (name: string, size: number, color: string, bold: number, outline: number, outlineColor = C.black, shadow = 0) =>
    `Style: ${name},DejaVu Sans,${size},${color},${color},${outlineColor},${C.shadow},${bold},0,0,0,100,100,0,0,1,${outline},${shadow},5,0,0,0,1`;

  const lines: string[] = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("Logo", 104, C.white, 1, 4, C.cyanGlow, 0),
    style("Handle", 34, C.white, 0, 0),
    style("Speed", 170, C.white, 1, 5, C.cyanGlow),
    style("Unit", 42, C.cyan, 1, 0),
    style("Value", 60, C.white, 1, 0),
    style("Label", 30, C.gray, 0, 0),
    style("Rank", 44, C.gold, 1, 2),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev = (style: string, x: number, y: number, text: string, start = "0:00:00.00", stop = end) =>
    lines.push(`Dialogue: 0,${start},${stop},${style},,0,0,0,,{\\pos(${Math.round(x)},${Math.round(y)})}${assText(text)}`);

  ev("Logo", W / 2, 170, "TripRank");
  ev("Handle", W / 2, 285, `@${m.username}`);

  // live speedometer synced to the clip
  const series = m.speedSeries.length ? m.speedSeries : [0];
  const steps = Math.min(240, Math.max(1, Math.ceil(d * 4)));
  const stepLen = d / steps;
  for (let i = 0; i < steps; i++) {
    const idx = Math.min(series.length - 1, Math.floor((i / steps) * series.length));
    ev("Speed", W / 2, H - 540, String(Math.round(series[idx])), ts(i * stepLen), ts((i + 1) * stepLen));
  }
  ev("Unit", W / 2, H - 430, m.unitLabel.toUpperCase());

  // stats card grid (card box drawn by drawbox in the filtergraph)
  const cx = 60, cy = H - 380, cw = W - 120;
  const cols = [cx + cw * 0.25, cx + cw * 0.75];
  const rows = [cy + 80, cy + 205];
  const cells: [string, string, number, number][] = [
    [m.topSpeed, "Max Speed", cols[0], rows[0]],
    [m.avgSpeed, "Avg Speed", cols[1], rows[0]],
    [m.maxG, "Max G-Force", cols[0], rows[1]],
    [m.distance, "Distance", cols[1], rows[1]],
  ];
  for (const [val, label, x, y] of cells) {
    ev("Value", x, y, val);
    ev("Label", x, y + 52, label);
  }
  ev("Rank", W / 2, H - 45, m.rankLine);
  return lines.join("\n") + "\n";
}

/** Scale/crop to 9:16 + translucent panels via drawbox, then burn the ASS typography. */
export function buildFilter(assPath: string): string {
  const cx = 60, cy = H - 380, cw = W - 120, ch = 300;
  return [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
    "setsar=1",
    `drawbox=x=0:y=0:w=${W}:h=330:color=black@0.45:t=fill`,
    `drawbox=x=0:y=${H - 660}:w=${W}:h=660:color=black@0.35:t=fill`,
    `drawbox=x=${W / 2 - 70}:y=245:w=140:h=6:color=0x19e6e6@0.95:t=fill`,
    `drawbox=x=${cx}:y=${cy}:w=${cw}:h=${ch}:color=0x16181d@0.72:t=fill`,
    `drawbox=x=${cx}:y=${cy}:w=${cw}:h=${ch}:color=0x19e6e6@0.4:t=2`,
    `ass=filename=${assPath}:fontsdir=${fontsDir()}`,
  ].join(",");
}

export async function renderOverlay(input: string, output: string, m: OverlayMetrics) {
  const duration = await probeDuration(input);
  const assPath = `${output}.ass`;
  await writeFile(assPath, buildAss(m, duration), "utf8");
  const args = [
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-t",
    String(MAX_SECONDS),
    "-vf",
    buildFilter(assPath),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ];
  try {
    const { code, stderr } = await run(ffmpegBinary(), args);
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}: ${stderr.split("\n").slice(-8).join("\n")}`);
  } finally {
    unlink(assPath).catch(() => {});
  }
}
