/**
 * Core tracking screen — Expo + NativeWind (Tailwind) + react-native-svg.
 *   npx expo install react-native-svg nativewind expo-haptics
 */
import React, { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useTripTracker, type GVector } from "../hooks/useTripTracker";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Unit = "kmh" | "mph";
const conv = (kmh: number, u: Unit) => (u === "mph" ? kmh / 1.609344 : kmh);

function SpeedDial({ kmh, unit }: { kmh: number; unit: Unit }) {
  const size = 280, r = 120, C = 2 * Math.PI * r, arc = C * 0.75;
  const v = conv(kmh, unit);
  const frac = Math.min(1, v / (unit === "mph" ? 200 : 300));
  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "135deg" }] }}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#39ff88" />
            <Stop offset="1" stopColor="#19e6e6" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#1b1e24" strokeWidth={16} fill="none" strokeDasharray={`${arc} ${C}`} strokeLinecap="round" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="url(#g)" strokeWidth={16} fill="none" strokeDasharray={`${Math.max(0.01, arc * frac)} ${C}`} strokeLinecap="round" />
      </Svg>
      <Text className="text-white text-8xl font-extrabold" style={{ fontVariant: ["tabular-nums"] }}>{Math.round(v)}</Text>
      <Text className="text-neon tracking-[6px] text-sm font-semibold">{unit === "mph" ? "MPH" : "KM/H"}</Text>
    </View>
  );
}

function GBubble({ g }: { g: GVector }) {
  const size = 140, R = 60, max = 1.5;
  const clamp = (n: number) => Math.max(-max, Math.min(max, n));
  return (
    <View className="items-center">
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={R + 6} fill="#0a0c0f" stroke="#1f242b" />
        <Circle cx={size / 2} cy={size / 2} r={(1 / max) * R} fill="none" stroke="#19e6e655" />
        <Circle cx={size / 2} cy={size / 2} r={(0.5 / max) * R} fill="none" stroke="#ffffff14" strokeDasharray="3 4" />
        <Circle cx={size / 2 + (clamp(g.x) / max) * R} cy={size / 2 + (clamp(g.y) / max) * R} r={8} fill={g.total > 0.6 ? "#ff9f1a" : "#39ff88"} />
      </Svg>
      <Text className="text-white text-2xl font-bold">{g.total.toFixed(2)}<Text className="text-neon text-sm"> G</Text></Text>
    </View>
  );
}

export default function TrackingScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [unit, setUnit] = useState<Unit>("kmh");
  const [saving, setSaving] = useState(false);
  const { tracking, stats, gforce, error, start, stop } = useTripTracker();

  const onPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!tracking) return start();
    const trip = stop();
    if (!trip) return Alert.alert("Trip too short", "Drive a little longer to save a trip.");
    setSaving(true);
    try {
      const res = await api.post("/api/trips/save", {
        user_id: user.id,
        speed_array: trip.speedArray,
        samples: trip.samples,
        top_speed: trip.topSpeed,
        max_gforce: trip.maxG,
        timestamp: new Date(trip.startedAt).toISOString(),
        duration_sec: trip.durationSec,
      });
      nav.navigate("TripSummary", { tripId: res.trip.id });
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const accel = unit === "mph" ? stats.zeroTo60mph : stats.zeroTo100;

  return (
    <View className="flex-1 bg-ink px-5 pt-16">
      <View className="flex-row items-center justify-between">
        <Text className="text-white text-3xl font-extrabold tracking-tighter">TripRank</Text>
        <Pressable onPress={() => setUnit(unit === "kmh" ? "mph" : "kmh")} className="rounded-full border border-line px-3 py-1.5">
          <Text className="text-neon text-xs font-bold">{unit === "kmh" ? "KM/H" : "MPH"}</Text>
        </Pressable>
      </View>

      <View className="items-center mt-6"><SpeedDial kmh={stats.speedKmh} unit={unit} /></View>

      <View className="flex-row rounded-2xl bg-panel border border-white/5 py-4 mt-2">
        {[
          ["TOP", `${Math.round(conv(stats.maxSpeedKmh, unit))}`],
          ["AVG", `${Math.round(conv(stats.avgSpeedKmh, unit))}`],
          [unit === "mph" ? "0-60" : "0-100", accel ? `${accel.toFixed(2)}s` : "--"],
        ].map(([l, v]) => (
          <View key={l} className="flex-1 items-center">
            <Text className="text-white text-xl font-bold">{v}</Text>
            <Text className="text-muted text-[10px] tracking-widest">{l}</Text>
          </View>
        ))}
      </View>

      <View className="items-center mt-4"><GBubble g={gforce} /></View>
      {error && <Text className="text-danger text-center mt-3">{error}</Text>}

      <Pressable
        onPress={onPress}
        disabled={saving}
        className={`mt-auto mb-12 h-20 rounded-full items-center justify-center ${tracking ? "border-2 border-danger bg-danger/10" : "bg-neon"}`}
        style={!tracking ? { shadowColor: "#19e6e6", shadowOpacity: 0.6, shadowRadius: 24, elevation: 12 } : undefined}
      >
        <Text className={`text-xl font-black tracking-[6px] ${tracking ? "text-danger" : "text-black"}`}>
          {saving ? "SAVING…" : tracking ? "END TRIP" : "START TRIP"}
        </Text>
      </Pressable>
    </View>
  );
}
