import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Trip, TowerStat, PathPoint } from "../api/useMapWebSocket";

delete (L.Icon.Default.prototype as any)._getIconUrl;

const RUHR_CENTER: [number, number] = [51.513, 7.465];
const PROXIMITY_KM = 1.8;          // only render towers within this distance of an active tower
const COVERAGE_R   = 500;          // coverage circle radius in metres
const TRAIL_TTL_MS = 180_000;      // keep HO trail for 3 min
const TOAST_TTL_MS = 7_000;        // handover toast lifetime

// ── Types ─────────────────────────────────────────────────────────────────────

const SCENARIO_ICON: Record<string, string> = { hbahn: "🚋", mobile: "📱", static: "🏢" };

type HoToast = {
  id:          number;
  name:        string;
  color:       string;
  fromCell:    number;
  toCell:      number;
  rsrpGain:    number | null;
  aiPredicted: boolean;
  ts:          number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(a: TowerStat, b: TowerStat) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function sigColor(r: number) { return r >= -85 ? "#22c55e" : r >= -100 ? "#f59e0b" : "#ef4444"; }
function sigLabel(r: number) { return r >= -85 ? "Strong" : r >= -100 ? "Fair" : "Weak"; }
function fmtTime(ts: string) {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function toRad(d: number) { return d * Math.PI / 180; }
function geoMove(lat: number, lng: number, brg: number, distM: number): [number, number] {
  const R = 6371000, δ = distM / R, θ = toRad(brg);
  const φ1 = toRad(lat), λ1 = toRad(lng);
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2);
  return [φ2 * 180 / Math.PI, λ2 * 180 / Math.PI];
}

let toastId = 0;

// ── CSS ───────────────────────────────────────────────────────────────────────

const MAP_CSS = `
/* ── Device beacon ── */
.b-wrap { position:relative; width:56px; height:56px; }
.b-ring {
  position:absolute; border-radius:50%; border:1.5px solid;
  top:50%; left:50%;
  transform:translate(-50%,-50%) scale(0.1);
  animation:b-ring 2.4s ease-out infinite;
  pointer-events:none;
}
.b-ring2 { animation-delay:1.2s; }
@keyframes b-ring {
  0%   { transform:translate(-50%,-50%) scale(0.1); opacity:0.9; }
  100% { transform:translate(-50%,-50%) scale(3.0); opacity:0; }
}
.b-dot {
  position:absolute; width:12px; height:12px; border-radius:50%;
  top:50%; left:50%; transform:translate(-50%,-50%);
  animation:b-dot 2.2s ease-in-out infinite;
}
.b-dot-sel {
  position:absolute; width:15px; height:15px; border-radius:50%;
  top:50%; left:50%; transform:translate(-50%,-50%);
  border:2.5px solid rgba(255,255,255,0.9);
  animation:b-dot 1.8s ease-in-out infinite;
}
@keyframes b-dot {
  0%,100% { filter:brightness(1)   drop-shadow(0 0 5px currentColor); transform:translate(-50%,-50%) scale(1); }
  50%      { filter:brightness(1.6) drop-shadow(0 0 12px currentColor); transform:translate(-50%,-50%) scale(1.2); }
}
.b-ai-badge {
  position:absolute; bottom:0px; right:0px;
  font-size:7px; font-weight:900;
  color:#fff; background:#22d3ee; border-radius:3px;
  padding:0px 3px; line-height:13px;
  animation:b-ai-pulse 1.6s ease-in-out infinite;
  pointer-events:none; box-shadow:0 0 5px #22d3ee80;
}
.b-ai-badge-warn { background:#f59e0b; box-shadow:0 0 5px #f59e0b80; }
.b-ai-badge-crit { background:#ef4444; box-shadow:0 0 5px #ef444480; }
@keyframes b-ai-pulse {
  0%,100% { transform:scale(1); opacity:1; }
  50%      { transform:scale(1.2); opacity:0.85; }
}

/* ── Handover flash — 3 expanding rings ── */
.ho-ring {
  position:absolute; border-radius:50%; border:2.5px solid;
  top:50%; left:50%; pointer-events:none;
}
@keyframes ho-r1 { 0% { transform:translate(-50%,-50%) scale(0.2); opacity:1; }  100% { transform:translate(-50%,-50%) scale(3.5); opacity:0; } }
@keyframes ho-r2 { 0% { transform:translate(-50%,-50%) scale(0.2); opacity:0.8; } 100% { transform:translate(-50%,-50%) scale(5.0); opacity:0; } }
@keyframes ho-r3 { 0% { transform:translate(-50%,-50%) scale(0.2); opacity:0.5; } 100% { transform:translate(-50%,-50%) scale(6.5); opacity:0; } }
.ho-r1 { width:32px; height:32px; animation:ho-r1 0.9s ease-out forwards; }
.ho-r2 { width:32px; height:32px; animation:ho-r2 1.3s 0.1s ease-out forwards; }
.ho-r3 { width:32px; height:32px; animation:ho-r3 1.7s 0.2s ease-out forwards; }

/* ── Reconnect pulse ── */
.rx-pulse {
  position:absolute; width:30px; height:30px; border-radius:50%;
  border:1.5px dashed #94a3b8;
  top:50%; left:50%;
  animation:rx-anim 1.2s ease-in-out forwards;
  pointer-events:none;
}
@keyframes rx-anim {
  0%   { transform:translate(-50%,-50%) scale(0.8); opacity:0; }
  30%  { transform:translate(-50%,-50%) scale(1.1); opacity:0.85; }
  100% { transform:translate(-50%,-50%) scale(1.8); opacity:0; }
}

/* ── AI beam label ── */
.ai-beam-label {
  background:rgba(34,211,238,0.2); border:1px solid rgba(34,211,238,0.6);
  border-radius:5px; padding:2px 7px;
  font-size:10px; font-weight:900; color:#22d3ee;
  white-space:nowrap; pointer-events:none;
  text-shadow:0 0 8px #22d3ee; letter-spacing:0.3px;
  animation:beam-label-fade 2.8s ease-out forwards;
}
.ho-beam-label {
  background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.25);
  border-radius:5px; padding:2px 6px;
  font-size:9px; font-weight:800; color:#e2e8f0;
  white-space:nowrap; pointer-events:none;
  animation:beam-label-fade 2.8s ease-out forwards;
}
@keyframes beam-label-fade {
  0%,60% { opacity:1; }
  100%   { opacity:0; }
}

/* ── Leaflet overrides ── */
.leaflet-tooltip { background:transparent!important;border:none!important;box-shadow:none!important;padding:0!important; }
.leaflet-tooltip::before { display:none!important; }
.leaflet-container { font-family:Inter,sans-serif; }
`;

if (typeof document !== "undefined" && !document.getElementById("cp-map-css")) {
  const el = document.createElement("style");
  el.id = "cp-map-css";
  el.textContent = MAP_CSS;
  document.head.appendChild(el);
}

// ── Tower filter — only nearby towers ─────────────────────────────────────────

function filterTowers(towers: TowerStat[]): TowerStat[] {
  return towers; // always render all towers; TowerLayer decides which get circles
}

// ── Beacon icon ───────────────────────────────────────────────────────────────

function makeBeacon(color: string, selected: boolean, aiRisk = 0, aiRecommended = false): L.DivIcon {
  const dotClass = selected ? "b-dot-sel" : "b-dot";
  const ringColor = aiRisk > 0.6 ? "#ef4444" : aiRisk > 0.3 ? "#f59e0b" : color;
  let aiBadge = "";
  if (aiRecommended) {
    const cls = aiRisk > 0.6 ? "b-ai-badge b-ai-badge-crit" : aiRisk > 0.3 ? "b-ai-badge b-ai-badge-warn" : "b-ai-badge";
    aiBadge = `<div class="${cls}">AI⚡</div>`;
  } else if (aiRisk > 0.3) {
    const cls = aiRisk > 0.6 ? "b-ai-badge b-ai-badge-crit" : "b-ai-badge b-ai-badge-warn";
    aiBadge = `<div class="${cls}">⚠</div>`;
  }
  return L.divIcon({
    className: "",
    iconSize:   [56, 56] as [number, number],
    iconAnchor: [28, 28] as [number, number],
    html: `<div class="b-wrap">
      <div class="b-ring"  style="border-color:${ringColor}50"></div>
      <div class="b-ring b-ring2" style="border-color:${ringColor}70"></div>
      <div class="${dotClass}" style="background:${color};color:${color};box-shadow:0 0 ${selected ? 18 : 9}px ${color}${selected ? ",0 0 3px white" : ""}"></div>
      ${aiBadge}
    </div>`,
  });
}

// ── Tower icon — clean minimal design ─────────────────────────────────────────

function makeTowerIcon(color: string, cellId: number, active: boolean): L.DivIcon {
  if (!active) {
    return L.divIcon({
      className: "",
      iconSize:   [8, 8] as [number, number],
      iconAnchor: [4, 4] as [number, number],
      html: `<div style="width:8px;height:8px;border-radius:50%;background:#334155;opacity:0.45;"></div>`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize:   [38, 30] as [number, number],
    iconAnchor: [19, 19] as [number, number],
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="
        width:18px;height:18px;border-radius:50%;
        background:${color}20;border:2px solid ${color};
        box-shadow:0 0 10px ${color}70, inset 0 0 4px ${color}40;
        display:flex;align-items:center;justify-content:center;">
        <div style="width:6px;height:6px;border-radius:50%;background:${color};box-shadow:0 0 4px ${color};"></div>
      </div>
      <div style="
        font-size:8.5px;font-weight:900;color:${color};letter-spacing:-0.2px;
        background:rgba(5,12,25,0.88);border-radius:3px;padding:0px 4px;
        line-height:13px;margin-top:1px;border:1px solid ${color}30;
        text-shadow:0 0 6px ${color}80;">
        #${cellId}
      </div>
    </div>`,
  });
}

// ── Handover effects ──────────────────────────────────────────────────────────

function triggerHandoverRings(map: L.Map, pos: [number, number], color: string) {
  const icon = L.divIcon({
    className: "",
    iconSize:   [80, 80],
    iconAnchor: [40, 40],
    html: `<div class="b-wrap" style="width:80px;height:80px;">
      <div class="ho-ring ho-r1" style="border-color:${color}"></div>
      <div class="ho-ring ho-r2" style="border-color:${color}90"></div>
      <div class="ho-ring ho-r3" style="border-color:${color}50"></div>
    </div>`,
  });
  const m = L.marker(pos, { icon, zIndexOffset: 900, interactive: false }).addTo(map);
  setTimeout(() => m.remove(), 2000);
}

function triggerHandoverBeam(
  map: L.Map, from: [number, number], to: [number, number],
  color: string, fromCell: number, toCell: number, aiPredicted: boolean
) {
  const lineColor = aiPredicted ? "#22d3ee" : color;
  const weight    = aiPredicted ? 4 : 3.5;

  // Draw glowing beam: two lines (glow + core)
  const glow = L.polyline([from, to], {
    color: lineColor, weight: weight + 6, opacity: 0.15, interactive: false,
  }).addTo(map);
  const core = L.polyline([from, to], {
    color: lineColor, weight, opacity: 0.9, interactive: false,
  }).addTo(map);

  // Label at midpoint
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const labelClass = aiPredicted ? "ai-beam-label" : "ho-beam-label";
  const labelText  = aiPredicted
    ? `AI ⚡ #${fromCell}→#${toCell}`
    : `HO #${fromCell}→#${toCell}`;
  const labelW = aiPredicted ? 110 : 90;
  const label = L.marker(mid, {
    icon: L.divIcon({
      className: "",
      iconSize:   [labelW, 18] as [number, number],
      iconAnchor: [labelW / 2, 9] as [number, number],
      html: `<div class="${labelClass}">${labelText}</div>`,
    }),
    interactive: false, zIndexOffset: 800,
  }).addTo(map);

  // Fade after 2.5s
  setTimeout(() => {
    glow.setStyle({ opacity: 0 });
    core.setStyle({ opacity: 0 });
    setTimeout(() => { glow.remove(); core.remove(); label.remove(); }, 400);
  }, 2500);
}

function triggerReconnect(map: L.Map, pos: [number, number]) {
  const icon = L.divIcon({
    className: "",
    iconSize:   [50, 50],
    iconAnchor: [25, 25],
    html: `<div class="b-wrap" style="width:50px;height:50px;">
      <div class="rx-pulse"></div>
    </div>`,
  });
  const m = L.marker(pos, { icon, zIndexOffset: 700, interactive: false }).addTo(map);
  setTimeout(() => m.remove(), 1300);
}

// ── Device state ──────────────────────────────────────────────────────────────

type DevState = {
  marker:         L.Marker;
  prevTimestamp:  string | null;
  prevCell:       number | null;
  selected:       boolean;
  color:          string;
  orbitAngle:     number;
  orbitSpeed:     number;
  orbitPhase:     number;
  orbitRadius:    number;
  virtualPos:     [number, number];
  towerPos:       [number, number] | null;
  renderPos:      [number, number] | null;  // lerped position for smooth tower-to-tower flight
  trailPoints:    Array<{ pos: [number, number]; t: number }>;
  trailLayer:     L.Polyline | null;
  connectionLine: L.Polyline | null;         // dashed line: device → serving tower
  aiRisk:         number;
  aiRecommended:  boolean;
};

// ── AnimatedLayer ─────────────────────────────────────────────────────────────

function AnimatedLayer({ trips, selectedUE, onSelect, onHandover }: {
  trips:       Trip[];
  selectedUE:  string | null;
  onSelect:    (id: string | null) => void;
  onHandover:  (t: Omit<HoToast, "id" | "ts">) => void;
}) {
  const map    = useMap();
  const devs   = useRef<Map<string, DevState>>(new Map());
  const cbRef  = useRef(onSelect);
  const hoRef  = useRef(onHandover);
  useEffect(() => { cbRef.current = onSelect; }, [onSelect]);
  useEffect(() => { hoRef.current = onHandover; }, [onHandover]);

  const rafRef       = useRef<number | null>(null);
  const prevFrameMs  = useRef(performance.now());

  // Orbital animation loop with smooth tower-to-tower lerp
  useEffect(() => {
    function frame(now: number) {
      const dt = Math.min((now - prevFrameMs.current) / 1000, 0.1);
      prevFrameMs.current = now;
      for (const s of devs.current.values()) {
        if (!s.towerPos) continue;

        // Lerp renderPos toward towerPos (smooth handover flight ~0.8s)
        if (!s.renderPos) {
          s.renderPos = [...s.towerPos] as [number, number];
        } else {
          const alpha = Math.min(1, dt * 2.5);
          s.renderPos = [
            s.renderPos[0] + (s.towerPos[0] - s.renderPos[0]) * alpha,
            s.renderPos[1] + (s.towerPos[1] - s.renderPos[1]) * alpha,
          ];
        }

        if (s.orbitSpeed === 0) {
          // Static device — sits exactly at tower, no orbit, no connection line
          s.virtualPos = [...s.renderPos] as [number, number];
          s.marker.setLatLng(s.renderPos);
        } else {
          s.orbitAngle = (s.orbitAngle + s.orbitSpeed * dt) % 360;
          const breathe = s.orbitRadius * (1 + 0.1 * Math.sin(toRad(s.orbitAngle * 1.5 + s.orbitPhase)));
          s.virtualPos = geoMove(s.renderPos[0], s.renderPos[1], s.orbitAngle, breathe);
          s.marker.setLatLng(s.virtualPos);
          if (s.connectionLine) s.connectionLine.setLatLngs([s.renderPos, s.virtualPos]);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [map]);

  // Data ingestion
  useEffect(() => {
    const live = new Set(trips.map(t => t.ue_id));
    for (const [id, s] of devs.current) {
      if (!live.has(id)) {
        if (s.trailLayer) s.trailLayer.remove();
        if (s.connectionLine) s.connectionLine.remove();
        s.marker.remove();
        devs.current.delete(id);
      }
    }

    for (const trip of trips) {
      const last = trip.path[trip.path.length - 1];
      if (!last) continue;
      const sel      = selectedUE === trip.ue_id;
      const towerPos: [number, number] = [last.lat, last.lng];

      if (!devs.current.has(trip.ue_id)) {
        const isStatic  = trip.scenario === "static";
        const orbitRadius = isStatic ? 0 : 45 + Math.random() * 65;
        const orbitSpeed  = isStatic ? 0 : 5 + Math.random() * 6;
        const orbitAngle  = Math.random() * 360;
        const initPos: [number, number] = isStatic
          ? [...towerPos] as [number, number]
          : geoMove(towerPos[0], towerPos[1], orbitAngle, orbitRadius);
        const initRisk    = trip.latestAi?.risk ?? 0;
        const initRec     = trip.latestAi?.recommended ?? false;
        const marker = L.marker(initPos, {
          icon: makeBeacon(trip.color, sel, initRisk, initRec),
          zIndexOffset: sel ? 1000 : 200,
        }).addTo(map);
        const connLine = isStatic ? null : L.polyline([towerPos, initPos], {
          color: trip.color, weight: 1.5, opacity: 0.4,
          dashArray: "4 10", interactive: false,
        }).addTo(map);
        const ueId = trip.ue_id;
        marker.on("click", () => cbRef.current(ueId));
        devs.current.set(ueId, {
          marker, prevTimestamp: last.timestamp, prevCell: last.cell_id,
          selected: sel, color: trip.color,
          orbitAngle, orbitSpeed,
          orbitPhase: Math.random() * 360, orbitRadius,
          virtualPos: initPos, towerPos,
          renderPos: [...towerPos] as [number, number],
          trailPoints: [{ pos: towerPos, t: Date.now() }], trailLayer: null,
          connectionLine: connLine,
          aiRisk: initRisk, aiRecommended: initRec,
        });
        continue;
      }

      const s = devs.current.get(trip.ue_id)!;
      s.color = trip.color;
      const newPoints = s.prevTimestamp === null
        ? trip.path
        : trip.path.filter(p => p.timestamp > s.prevTimestamp!);

      if (newPoints.length > 0) {
        let lastCell     = s.prevCell;
        let curTowerPos: [number, number] | null = s.towerPos;

        for (const p of newPoints) {
          if (p.cell_id !== lastCell) {
            const newTowerPos: [number, number] = [p.lat, p.lng];

            if (p.is_handover) {
              triggerHandoverRings(map, newTowerPos, s.color);
              if (curTowerPos) {
                triggerHandoverBeam(map, curTowerPos, newTowerPos, s.color, lastCell ?? 0, p.cell_id, !!p.ai_predicted);
              }
              hoRef.current({
                name: trip.name, color: s.color,
                fromCell: lastCell ?? 0, toCell: p.cell_id,
                rsrpGain: p.rsrp_gain ?? null, aiPredicted: !!p.ai_predicted,
              });
              // Trail
              s.trailPoints.push({ pos: newTowerPos, t: Date.now() });
              const cutoff = Date.now() - TRAIL_TTL_MS;
              while (s.trailPoints.length > 1 && s.trailPoints[0].t < cutoff) s.trailPoints.shift();
              if (s.trailPoints.length >= 2) {
                const lls = s.trailPoints.map(tp => tp.pos);
                if (s.trailLayer) s.trailLayer.setLatLngs(lls);
                else s.trailLayer = L.polyline(lls, {
                  color: s.color, weight: 1.8, opacity: 0.35,
                  dashArray: "3 9", interactive: false,
                }).addTo(map);
              }
            } else if (p.is_reconnection) {
              triggerReconnect(map, newTowerPos);
              s.trailPoints = [{ pos: newTowerPos, t: Date.now() }];
              if (s.trailLayer) { s.trailLayer.remove(); s.trailLayer = null; }
            }

            curTowerPos = newTowerPos;
            lastCell = p.cell_id;
          }
        }

        s.prevTimestamp = last.timestamp;
        s.prevCell      = last.cell_id;
        s.towerPos      = curTowerPos ?? towerPos;
      }

      const newRisk = trip.latestAi?.risk ?? 0;
      const newRec  = trip.latestAi?.recommended ?? false;
      if (s.selected !== sel || newRisk !== s.aiRisk || newRec !== s.aiRecommended) {
        s.selected = sel; s.aiRisk = newRisk; s.aiRecommended = newRec;
        s.marker.setIcon(makeBeacon(trip.color, sel, newRisk, newRec));
        s.marker.setZIndexOffset(sel ? 1000 : 200);
      }
    }
  }, [trips, selectedUE, map]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    for (const s of devs.current.values()) {
      if (s.trailLayer) s.trailLayer.remove();
      if (s.connectionLine) s.connectionLine.remove();
      s.marker.remove();
    }
    devs.current.clear();
  }, [map]);

  return null;
}

// ── TowerLayer — persistent grey dots + animated circles only on active cells ──

function towerTooltipHtml(t: TowerStat, color: string): string {
  const prbPct    = Math.round(t.prb_utilization * 100);
  const prbColor  = prbPct > 75 ? "#f59e0b" : "#22c55e";
  const sinrColor = t.avg_sinr >= 10 ? "#22c55e" : "#f59e0b";
  const statusLabel = t.status === "congested" ? "⚡ Congested" : "✓ Active";
  return `<div style="background:rgba(5,12,25,0.97);padding:10px 13px;border-radius:10px;border:1px solid ${color}35;min-width:195px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}"></div>
      <span style="font-size:12px;font-weight:800;color:#f1f5f9">Tower #${t.cell_id}</span>
      <span style="font-size:10px;color:${t.status === "congested" ? "#f59e0b" : "#22c55e"};font-weight:700">${statusLabel}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;font-size:10px;color:#64748b">
      <span>RSRP <b style="color:#e2e8f0">${t.avg_rsrp.toFixed(1)} dBm</b></span>
      <span>RSRQ <b style="color:#e2e8f0">${t.avg_rsrq.toFixed(1)} dB</b></span>
      <span>SINR <b style="color:${sinrColor}">${t.avg_sinr.toFixed(1)} dB</b></span>
      <span>CQI  <b style="color:#e2e8f0">${t.avg_cqi.toFixed(1)}</b></span>
      <span>PRB  <b style="color:${prbColor}">${prbPct}%</b></span>
      <span>UEs  <b style="color:#e2e8f0">${t.n_rrc_connections}</b></span>
    </div>
  </div>`;
}

function TowerLayer({ towers }: { towers: TowerStat[] }) {
  const map        = useMap();
  const dotMarkers = useRef<Map<number, L.Marker>>(new Map());
  const circleMap  = useRef<Map<number, L.Circle>>(new Map());
  const prevActive = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (towers.length === 0) return;

    const nowActive = new Set(towers.filter(t => t.is_active).map(t => t.cell_id));

    // ── Dots: create once, update icon only when active state flips ───────────
    for (const t of towers) {
      const wasActive = prevActive.current.has(t.cell_id);
      const isNow     = nowActive.has(t.cell_id);
      const color     = isNow ? (t.device_color ?? "#22c55e") : "#334155";

      if (!dotMarkers.current.has(t.cell_id)) {
        // First render — create dot
        const m = L.marker([t.lat, t.lng] as [number, number], {
          icon: makeTowerIcon(color, t.cell_id, isNow),
          interactive: isNow,
          zIndexOffset: isNow ? 400 : 0,
        }).addTo(map);
        if (isNow) m.bindTooltip(towerTooltipHtml(t, color), { sticky: true });
        dotMarkers.current.set(t.cell_id, m);
      } else if (wasActive !== isNow) {
        // Active state changed — swap icon
        const m = dotMarkers.current.get(t.cell_id)!;
        m.setIcon(makeTowerIcon(color, t.cell_id, isNow));
        (m.options as any).interactive = isNow;
        if (isNow) m.bindTooltip(towerTooltipHtml(t, color), { sticky: true });
        else        m.unbindTooltip();
      }
    }

    // ── Circles: fade out deactivated towers ──────────────────────────────────
    for (const [cellId, circle] of circleMap.current) {
      if (!nowActive.has(cellId)) {
        circleMap.current.delete(cellId);
        const el = (circle as any)._path as SVGElement | undefined;
        if (el) {
          el.style.transition = "opacity 0.7s, fill-opacity 0.7s";
          el.style.opacity = "0";
          const c = circle;
          setTimeout(() => c.remove(), 750);
        } else {
          circle.remove();
        }
      }
    }

    // ── Circles: fade in newly active towers ──────────────────────────────────
    for (const t of towers) {
      if (!t.is_active || circleMap.current.has(t.cell_id)) continue;
      const color       = t.device_color ?? "#22c55e";
      const isCongested = t.status === "congested";
      const circle = L.circle([t.lat, t.lng] as [number, number], {
        radius: COVERAGE_R, color,
        weight: 1.5, opacity: 0,
        fillColor: color, fillOpacity: 0,
        interactive: false,
      }).addTo(map);
      circleMap.current.set(t.cell_id, circle);
      requestAnimationFrame(() => {
        const el = (circle as any)._path as SVGElement | undefined;
        if (el) el.style.transition = "opacity 0.6s, fill-opacity 0.6s";
        circle.setStyle({
          opacity:     isCongested ? 0.8 : 0.65,
          fillOpacity: isCongested ? 0.14 : 0.09,
        });
      });
    }

    prevActive.current = nowActive;
  }, [towers, map]);

  // Full cleanup on unmount
  useEffect(() => () => {
    for (const m of dotMarkers.current.values()) m.remove();
    for (const c of circleMap.current.values()) c.remove();
    dotMarkers.current.clear();
    circleMap.current.clear();
  }, [map]);

  return null;
}

// ── Map centering ──────────────────────────────────────────────────────────────

function FitRegion() {
  const map = useMap();
  useEffect(() => { map.setView(RUHR_CENTER, 14); }, [map]);
  return null;
}

// ── Sidebar cards ──────────────────────────────────────────────────────────────

function TripCard({ trip, onClick }: { trip: Trip; onClick: () => void }) {
  const last = trip.path[trip.path.length - 1];
  const icon = SCENARIO_ICON[trip.scenario] ?? "📡";
  const [hover, setHover] = useState(false);
  const displayKmh = Math.round((last?.velocity ?? 0) * 3.6);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "rgba(8,18,36,0.95)", borderRadius: 12,
        border: `1px solid ${hover ? trip.color + "50" : "rgba(255,255,255,0.06)"}`,
        padding: "12px 14px", cursor: "pointer", transition: "border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${trip.color}15`, border: `1.5px solid ${trip.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.name}</div>
          <div style={{ fontSize: 10, color: "#3d5475", marginTop: 1 }}>
            Tower <span style={{ color: trip.color, fontWeight: 700 }}>#{last?.cell_id ?? "—"}</span>
          </div>
        </div>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: trip.color, boxShadow: `0 0 7px ${trip.color}` }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, marginBottom: 8 }}>
        {[
          { label: "Signal",  value: sigLabel(last?.rsrp ?? -140), color: sigColor(last?.rsrp ?? -140) },
          { label: "RSRP",    value: `${last?.rsrp ?? "—"} dBm`,    color: "#94a3b8" },
          { label: "Speed",   value: `${displayKmh} km/h`,            color: "#e2e8f0" },
        ].map((s, i) => (
          <div key={s.label} style={{
            padding: "6px 4px", textAlign: "center",
            background: "rgba(255,255,255,0.025)", borderRadius: i === 0 ? "6px 0 0 6px" : i === 2 ? "0 6px 6px 0" : "0",
          }}>
            <div style={{ fontSize: 8.5, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 1 }}>{s.label}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1, background: "rgba(255,255,255,0.025)", borderRadius: 7, padding: "4px 8px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9.5, color: "#3d5475" }}>Handovers</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: trip.color }}>{trip.stats.handover_count}</span>
        </div>
        {trip.stats.ai_handovers > 0 && (
          <div style={{ flex: 1, background: "rgba(34,211,238,0.07)", borderRadius: 7, padding: "4px 8px", display: "flex", justifyContent: "space-between", border: "1px solid rgba(34,211,238,0.2)" }}>
            <span style={{ fontSize: 9.5, color: "#22d3ee80" }}>AI-assisted</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: "#22d3ee" }}>{trip.stats.ai_handovers}</span>
          </div>
        )}
      </div>

      {trip.latestAi && (trip.latestAi.risk > 0.3 || trip.latestAi.recommended) && (
        <div style={{
          marginTop: 7, padding: "4px 8px", borderRadius: 6,
          background: trip.latestAi.recommended ? "rgba(34,211,238,0.08)" : trip.latestAi.risk > 0.6 ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
          border: `1px solid ${trip.latestAi.recommended ? "rgba(34,211,238,0.3)" : trip.latestAi.risk > 0.6 ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 9.5, color: trip.latestAi.recommended ? "#22d3ee" : trip.latestAi.risk > 0.6 ? "#ef4444" : "#f59e0b" }}>
            {trip.latestAi.recommended ? "🤖 AI recommends HO" : trip.latestAi.risk > 0.6 ? "⚠ High HO risk" : "⚡ Elevated risk"}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: trip.latestAi.recommended ? "#22d3ee" : trip.latestAi.risk > 0.6 ? "#ef4444" : "#f59e0b" }}>
            {trip.latestAi.recommended ? `P=${(trip.latestAi.probability * 100).toFixed(0)}%` : `${(trip.latestAi.risk * 100).toFixed(0)}%`}
          </span>
        </div>
      )}
    </div>
  );
}

function Timeline({ trip, events, onBack }: { trip: Trip; events: PathPoint[]; onBack: () => void }) {
  const icon = SCENARIO_ICON[trip.scenario] ?? "📡";
  const last = trip.path[trip.path.length - 1];
  const speedKmh = Math.round((last?.velocity ?? 0) * 3.6);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "rgba(8,18,36,0.97)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
      <div style={{ padding: "11px 13px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 9 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#94a3b8", width: 26, height: 26, borderRadius: "50%", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>←</button>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: trip.color, boxShadow: `0 0 6px ${trip.color}`, flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{icon} {trip.name}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {[
          { label: "Handovers", value: trip.stats.handover_count, color: "#f1f5f9" },
          { label: "Signal",    value: sigLabel(last?.rsrp ?? -140), color: sigColor(last?.rsrp ?? -140) },
          { label: "Speed",     value: `${speedKmh} km/h`, color: "#e2e8f0" },
        ].map(s => (
          <div key={s.label} style={{ padding: "8px 0", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.03)" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#2d3f5e", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "11px 13px" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 1, marginBottom: 9 }}>Handover Events</div>
        {events.length === 0 ? (
          <div style={{ textAlign: "center", color: "#1e2d45", fontSize: 12, padding: "20px 0" }}>No events yet</div>
        ) : events.map((ev, i) => {
          const isRecon = ev.is_reconnection === true;
          const accent  = isRecon ? "#94a3b8" : trip.color;
          return (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3, flexShrink: 0 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: accent, border: "2px solid rgba(8,18,36,1)" }} />
                {i < events.length - 1 && <div style={{ width: 1.5, minHeight: 20, background: "rgba(255,255,255,0.04)", marginTop: 3 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: "#1e2d45" }}>{fmtTime(ev.timestamp)}</span>
                  <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: accent, background: `${accent}15`, border: `1px solid ${accent}30`, borderRadius: 3, padding: "1px 4px" }}>
                    {isRecon ? "Reconnect" : "HO"}
                  </span>
                  {ev.ai_predicted && <span style={{ fontSize: 7.5, fontWeight: 800, color: "#22d3ee", background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 3, padding: "1px 4px" }}>AI ⚡</span>}
                </div>
                <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 7, padding: "6px 9px", border: `1px solid ${accent}15` }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: "#e2e8f0" }}>
                    #{ev.from_cell} → #{ev.cell_id}
                  </div>
                  {ev.rsrp_gain != null && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: ev.rsrp_gain > 0 ? "#22c55e" : "#f59e0b", marginTop: 2 }}>
                      {ev.rsrp_gain > 0 ? "+" : ""}{ev.rsrp_gain} dB gain
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── HO Toast feed — floating in the map ───────────────────────────────────────

function HoToastFeed({ toasts }: { toasts: HoToast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "absolute", top: 12, right: 12, zIndex: 1000,
      display: "flex", flexDirection: "column", gap: 5,
      pointerEvents: "none",
    }}>
      {toasts.slice(0, 4).map(t => (
        <div key={t.id} style={{
          background: "rgba(5,12,25,0.92)", backdropFilter: "blur(8px)",
          border: `1px solid ${t.color}40`, borderRadius: 8,
          padding: "6px 11px", minWidth: 200,
          display: "flex", alignItems: "center", gap: 8,
          animation: "slideIn 0.25s ease-out",
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.color, boxShadow: `0 0 6px ${t.color}`, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{t.name}</div>
            <div style={{ fontSize: 9.5, color: "#64748b" }}>
              Tower <span style={{ color: "#94a3b8", fontWeight: 700 }}>#{t.fromCell}</span> → <span style={{ color: t.color, fontWeight: 700 }}>#{t.toCell}</span>
              {t.rsrpGain != null && (
                <span style={{ color: t.rsrpGain > 0 ? "#22c55e" : "#f59e0b", fontWeight: 700, marginLeft: 5 }}>
                  {t.rsrpGain > 0 ? "+" : ""}{t.rsrpGain} dB
                </span>
              )}
            </div>
          </div>
          {t.aiPredicted && (
            <div style={{ fontSize: 8, fontWeight: 900, color: "#22d3ee", background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>AI ⚡</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface TunisiaMapProps { trips: Trip[]; towers: TowerStat[]; connected: boolean; }

export function TunisiaMap({ trips, towers, connected }: TunisiaMapProps) {
  const [selectedUE,  setSelectedUE]  = useState<string | null>(null);
  const [toasts,      setToasts]      = useState<HoToast[]>([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Filter towers to only show active + nearby idle
  const displayTowers = useMemo(() => filterTowers(towers), [towers]);

  useEffect(() => { if (trips.length > 0) setLastUpdated(new Date()); }, [trips]);

  const handleSelect   = useCallback((id: string | null) => setSelectedUE(prev => prev === id ? null : id), []);
  const handleHandover = useCallback((t: Omit<HoToast, "id" | "ts">) => {
    const toast: HoToast = { ...t, id: ++toastId, ts: Date.now() };
    setToasts(prev => [toast, ...prev].slice(0, 6));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== toast.id)), TOAST_TTL_MS);
  }, []);

  const selectedTrip = trips.find(t => t.ue_id === selectedUE) ?? null;
  const eventHistory = selectedTrip
    ? selectedTrip.path.filter(p => p.is_handover || p.is_reconnection).slice().reverse()
    : [];

  const activeTowers = displayTowers.filter(t => t.is_active).length;
  const totalShown   = displayTowers.length;
  const totalTowers  = towers.length;

  return (
    <div style={{ display: "flex", height: "100%", gap: 10 }}>
      {/* MAP */}
      <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", position: "relative" }}>

        {/* Live badge */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, display: "flex", alignItems: "center", gap: 7, background: "rgba(5,12,25,0.88)", backdropFilter: "blur(10px)", borderRadius: 8, padding: "5px 11px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#f59e0b", boxShadow: `0 0 6px ${connected ? "#22c55e" : "#f59e0b"}` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{connected ? "LIVE" : "RECONNECTING"}</span>
          <span style={{ fontSize: 11, color: "#475569" }}>
            {trips.length} device{trips.length !== 1 ? "s" : ""} · {activeTowers} active towers
          </span>
        </div>

        {/* HO toast feed */}
        <HoToastFeed toasts={toasts} />

        {/* Legend */}
        <div style={{ position: "absolute", bottom: 28, left: 12, zIndex: 1000, background: "rgba(5,12,25,0.88)", backdropFilter: "blur(10px)", borderRadius: 10, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Legend</div>
          {[
            { dot: <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 5px #22d3ee" }} />, text: "Device (orbiting serving tower)" },
            { dot: <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #22c55e", background: "#22c55e20", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} /></div>, text: "Active tower" },
            { dot: <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#334155", opacity: 0.5 }} />, text: "Idle tower (nearby)" },
            { dot: <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #f59e0b", background: "#f59e0b20", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: "#f59e0b" }} /></div>, text: "Congested tower" },
            { dot: <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2.5px solid #a855f7" }} />, text: "Handover rings (3 expanding)" },
            { dot: <div style={{ fontSize: 8, background: "#22d3ee", borderRadius: 3, padding: "0 3px", color: "#fff", fontWeight: 900, lineHeight: "13px" }}>AI ⚡</div>, text: "AI-predicted handover" },
          ].map(({ dot, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "#64748b", marginBottom: 4 }}>
              <div style={{ flexShrink: 0, width: 16, display: "flex", justifyContent: "center" }}>{dot}</div>
              <span>{text}</span>
            </div>
          ))}
          {totalTowers > 0 && (
            <div style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 9.5, color: "#2d3f5e" }}>
              Showing {totalShown} / {totalTowers} towers · {activeTowers} active
            </div>
          )}
        </div>

        <MapContainer
          center={RUHR_CENTER} zoom={14}
          style={{ width: "100%", height: "100%", background: "#050d1a" }}
          zoomControl attributionControl={false}
        >
          <FitRegion />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <TowerLayer towers={displayTowers} />
          <AnimatedLayer trips={trips} selectedUE={selectedUE} onSelect={handleSelect} onHandover={handleHandover} />
        </MapContainer>
      </div>

      {/* SIDEBAR */}
      <div style={{ width: 275, display: "flex", flexDirection: "column", gap: 9, minHeight: 0, overflowY: selectedUE ? "hidden" : "auto" }}>
        {selectedUE && selectedTrip ? (
          <Timeline trip={selectedTrip} events={eventHistory} onBack={() => setSelectedUE(null)} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 1 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#2d3f5e", textTransform: "uppercase", letterSpacing: 1.2 }}>Active Devices</div>
              <div style={{ fontSize: 9.5, color: "#1a2840" }}>{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            </div>
            {trips.length === 0 ? (
              <div style={{ textAlign: "center", color: "#1e2d45", fontSize: 13, padding: "48px 0" }}>Waiting for live data…</div>
            ) : (
              trips.map(trip => <TripCard key={trip.ue_id} trip={trip} onClick={() => handleSelect(trip.ue_id)} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
