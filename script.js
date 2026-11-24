const BROKER_WSS = "wss://broker.emqx.io:8084/mqtt";
const TOPIC = "windmonitor/tnu18/telemetry";

const statusBadge = document.getElementById("mqttStatus");
const alarmBanner = document.getElementById("alarmBanner");
const atcStage = document.getElementById("atcStage");
const windConditionBadge = document.getElementById("windConditionBadge");
const windDirSummary = document.getElementById("windDirSummary");

const needle = document.getElementById("needle");
const hudNeedle = document.getElementById("hudNeedle");
const rotor = document.getElementById("rotor");

const towerBeacon = document.getElementById("towerBeacon");
const towerBeaconHalo = document.getElementById("towerBeaconHalo");
const windsockPivot = document.getElementById("windsockPivot");
const sockSegs = [
  document.getElementById("sockSeg1"),
  document.getElementById("sockSeg2"),
  document.getElementById("sockSeg3"),
  document.getElementById("sockSeg4"),
  document.getElementById("sockSeg5")
];
const windStreaksLayer = document.getElementById("windStreaksLayer");

// Elemen 3 LED Virtual
const ledGreen = document.getElementById("ledGreen");
const ledRed = document.getElementById("ledRed");
const ledYellow = document.getElementById("ledYellow");
const ledGreenBox = document.getElementById("ledGreenBox");
const ledRedBox = document.getElementById("ledRedBox");
const ledYellowBox = document.getElementById("ledYellowBox");
const ledGreenDesc = document.getElementById("ledGreenDesc");
const ledRedDesc = document.getElementById("ledRedDesc");
const ledYellowDesc = document.getElementById("ledYellowDesc");

let targetDirDeg = 0;
let currentDirDeg = 0;
let hasReceivedDir = false;

let targetSpeedKt = 0;
let smoothSpeedKt = 0;
let rotorAngle = 0;
let isAlarmActive = false;

// Buat partikel garis angin di langit Tower ATC
const streaks = [];
for (let i = 0; i < 16; i++) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  const x = Math.random() * 760;
  const y = 32 + Math.random() * 180;
  const len = 24 + Math.random() * 44;
  line.setAttribute("x1", x);
  line.setAttribute("y1", y);
  line.setAttribute("x2", x + len);
  line.setAttribute("y2", y);
  line.setAttribute("stroke", "#7dd3fc");
  line.setAttribute("stroke-width", (1 + Math.random() * 1.4).toFixed(1));
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("opacity", "0");
  windStreaksLayer.appendChild(line);
  streaks.push({ el: line, x, y, len, speedFactor: 0.7 + Math.random() * 0.7 });
}

function getCardinalLabel(deg) {
  const normalized = ((Number(deg) % 360) + 360) % 360;
  const dirs = [
    "N (Utara)",
    "NE (Timur Laut)",
    "E (Timur)",
    "SE (Tenggara)",
    "S (Selatan)",
    "SW (Barat Daya)",
    "W (Barat)",
    "NW (Barat Laut)"
  ];
  const idx = Math.floor(((normalized + 22.5) % 360) / 45);
  return dirs[idx];
}

function shortestAngleDelta(fromDeg, toDeg) {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

// Loop animasi 60fps: Kompas, Rotor, Windsock mengembang & berkibar, Garis Angin, Beacon Tower
let lastFrame = performance.now();
function animateScene(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  const t = now / 1000;

  // 1. Haluskan transisi kecepatan & arah angin
  const smoothFactor = 1 - Math.exp(-12 * dt);
  smoothSpeedKt += (targetSpeedKt - smoothSpeedKt) * smoothFactor;

  if (hasReceivedDir) {
    const delta = shortestAngleDelta(currentDirDeg, targetDirDeg);
    currentDirDeg += delta * smoothFactor;
    const rotStr = `rotate(${currentDirDeg.toFixed(2)}deg)`;
    if (needle) needle.style.transform = rotStr;
    if (hudNeedle) hudNeedle.style.transform = rotStr;
  }

  // 2. Rotasi baling-baling kecepatan angin
  if (rotor) {
    const degPerSec = smoothSpeedKt * 22;
    rotorAngle = (rotorAngle + degPerSec * dt) % 360;
    rotor.style.transform = `rotate(${rotorAngle.toFixed(2)}deg)`;
  }

  // 3. Animasi Kantung Angin (Windsock):
  // - 0 kt: terkulai ke bawah (+72 deg)
  // - >= 25 kt: mengembang mendatar (-2 deg) + kibaran lebih kencang
  const speedRatio = Math.min(smoothSpeedKt / 25, 1.2);
  const clampedRatio = Math.min(speedRatio, 1);
  const droopAngle = 72 * (1 - clampedRatio) - 2 * clampedRatio;
  const flutterFreq = 2.5 + smoothSpeedKt * 0.45;
  const flutterAmp = 1.5 + clampedRatio * 6.5;
  const flutter = Math.sin(t * flutterFreq) * flutterAmp;

  if (windsockPivot) {
    windsockPivot.setAttribute(
      "transform",
      `translate(18, 16) rotate(${(droopAngle + flutter).toFixed(2)})`
    );
  }

  // Gelombang kibaran tiap segmen windsock
  sockSegs.forEach((seg, idx) => {
    if (!seg) return;
    const wave = Math.sin(t * (flutterFreq + 1.5) - idx * 0.85) * (0.8 + clampedRatio * 3.8);
    seg.setAttribute("transform", `translate(0, ${wave.toFixed(2)})`);
  });

  // 4. Animasi garis hembusan angin melintas di layar
  const windPxPerSec = smoothSpeedKt * 26;
  const activeCount = Math.round((Math.min(smoothSpeedKt, 30) / 30) * streaks.length);
  streaks.forEach((s, idx) => {
    if (idx >= activeCount || smoothSpeedKt < 0.4) {
      s.el.setAttribute("opacity", "0");
      return;
    }
    s.x += windPxPerSec * s.speedFactor * dt;
    if (s.x > 780) {
      s.x = -s.len - 20;
      s.y = 32 + Math.random() * 180;
    }
    const alpha = Math.min(0.18 + (smoothSpeedKt / 30) * 0.55, 0.75);
    s.el.setAttribute("x1", s.x.toFixed(1));
    s.el.setAttribute("y1", s.y.toFixed(1));
    s.el.setAttribute("x2", (s.x + s.len).toFixed(1));
    s.el.setAttribute("y2", s.y.toFixed(1));
    s.el.setAttribute("opacity", alpha.toFixed(2));
  });

  // 5. Kedipan Beacon Merah di Puncak Tower ATC saat Alarm Aktif
  if (isAlarmActive) {
    const blink = (Math.sin(t * 10) + 1) / 2;
    towerBeacon.setAttribute("fill", "#ef4444");
    towerBeaconHalo.setAttribute("opacity", (0.25 + blink * 0.75).toFixed(2));
  } else {
    towerBeacon.setAttribute("fill", "#38bdf8");
    towerBeaconHalo.setAttribute("opacity", "0");
  }

  requestAnimationFrame(animateScene);
}
requestAnimationFrame(animateScene);

// Koneksi ke MQTT Broker via WebSocket Secure (WSS)
const client = mqtt.connect(BROKER_WSS, {
  clientId: "dash_" + Math.random().toString(16).substr(2, 8),
  clean: true,
  connectTimeout: 4000
});

client.on("connect", () => {
  statusBadge.textContent = "MQTT: Connected";
  statusBadge.className = "badge ok";
  client.subscribe(TOPIC);
});

client.on("reconnect", () => {
  statusBadge.textContent = "MQTT: Reconnecting...";
  statusBadge.className = "badge";
});

client.on("error", (err) => {
  console.error("MQTT Error:", err);
  statusBadge.textContent = "MQTT: Error";
  statusBadge.className = "badge warn";
});

client.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());

    const rawDir = data.dir ?? data.arah ?? 0;
    const rawSpd = data.speed ?? data.kec ?? 0;
    const errArah = Boolean(data.dir_err ?? data.errArah ?? false);
    const errKec = Boolean(data.spd_err ?? data.errKec ?? false);
    const alarm = Boolean(data.alarm ?? false);

    const arah = Number(rawDir) || 0;
    const kec = Number(rawSpd) || 0;
    const anyErr = errArah || errKec;
    const highWind = !errKec && kec > 25.0;

    isAlarmActive = alarm || anyErr || highWind;

    // Update target animasi
    if (!errArah) {
      targetDirDeg = arah;
      if (!hasReceivedDir) {
        currentDirDeg = arah;
        hasReceivedDir = true;
      }
    }
    targetSpeedKt = errKec ? 0 : Math.max(0, kec);

    // Update Kartu Angka & Monitor Keterangan
    const dirLabel = errArah ? "ERR" : `${arah.toFixed(1)}° (${getCardinalLabel(arah).split(" ")[0]})`;
    const spdLabel = errKec ? "ERR" : `${kec.toFixed(1)} kt`;

    document.getElementById("degVal").textContent = errArah ? "ERR" : arah.toFixed(1);
    document.getElementById("dirText").textContent = errArah ? "Sensor Error / Mentok" : getCardinalLabel(arah);
    document.getElementById("ktVal").textContent = errKec ? "ERR" : kec.toFixed(1);

    document.getElementById("monDirText").textContent = dirLabel;
    document.getElementById("monSpdText").textContent = spdLabel;
    document.getElementById("errArah").textContent = errArah ? "ERR (MENTOK)" : "OK";
    document.getElementById("errKec").textContent = errKec ? "ERR (MENTOK)" : "OK";
    windDirSummary.textContent = `DIR: ${dirLabel} | SPD: ${spdLabel}`;

    // Klasifikasi Kondisi Angin di Banner Scene
    if (anyErr) {
      windConditionBadge.textContent = "SENSOR FAULT DETECTED";
      windConditionBadge.style.color = "#fde047";
    } else if (kec > 25) {
      windConditionBadge.textContent = "GALE / HIGH WIND WARNING (>25 kt)";
      windConditionBadge.style.color = "#fca5a5";
    } else if (kec >= 15) {
      windConditionBadge.textContent = "MODERATE - FRESH BREEZE";
      windConditionBadge.style.color = "#38bdf8";
    } else {
      windConditionBadge.textContent = "CALM / SAFE WIND";
      windConditionBadge.style.color = "#86efac";
    }

    // Update 3 LED Virtual (Hijau, Merah, Kuning)
    const normalOn = !isAlarmActive;
    ledGreen.classList.toggle("active", normalOn);
    ledGreenBox.classList.toggle("on-green", normalOn);
    ledGreenDesc.textContent = normalOn ? "NYALA - Operasional Aman" : "MATI - Ada Peringatan";

    ledRed.classList.toggle("active", highWind);
    ledRedBox.classList.toggle("on-red", highWind);
    ledRedDesc.textContent = highWind ? "NYALA - Angin > 25 kt!" : "MATI - Kecepatan <= 25 kt";

    ledYellow.classList.toggle("active", anyErr);
    ledYellowBox.classList.toggle("on-yellow", anyErr);
    ledYellowDesc.textContent = anyErr ? "NYALA - Potensio Mentok / ERR!" : "MATI - Sensor Normal";

    // Update Status Alarm & Border Stage
    const alarmEl = document.getElementById("alarmStatus");
    const sysStateEl = document.getElementById("sysStateText");
    const monAlertDetail = document.getElementById("monAlertDetail");

    atcStage.classList.remove("alarm-mode", "fault-mode");

    if (anyErr && highWind) {
      alarmBanner.textContent = "ALARM: HIGH WIND & SENSOR ERR";
      alarmBanner.className = "alarm-banner active";
      alarmEl.textContent = "AKTIF (ERR + >25 kt)";
      alarmEl.style.color = "#f87171";
      sysStateEl.textContent = "CRITICAL";
      sysStateEl.style.color = "#f87171";
      atcStage.classList.add("alarm-mode");
      monAlertDetail.textContent = "PERINGATAN: Sensor mentok/error dan kecepatan melebihi 25 kt!";
      monAlertDetail.style.borderLeftColor = "#ef4444";
    } else if (highWind) {
      alarmBanner.textContent = "ALARM: HIGH WIND (>25 KT)";
      alarmBanner.className = "alarm-banner active";
      alarmEl.textContent = "AKTIF (>25 kt)";
      alarmEl.style.color = "#f87171";
      sysStateEl.textContent = "WARNING";
      sysStateEl.style.color = "#f87171";
      atcStage.classList.add("alarm-mode");
      monAlertDetail.textContent = "PERINGATAN: Kecepatan angin melebihi batas aman 25 knot!";
      monAlertDetail.style.borderLeftColor = "#ef4444";
    } else if (anyErr) {
      alarmBanner.textContent = "ALARM: SENSOR FAULT / MENTOK";
      alarmBanner.className = "alarm-banner active";
      alarmEl.textContent = "AKTIF (SENSOR ERR)";
      alarmEl.style.color = "#facc15";
      sysStateEl.textContent = "SENSOR ERR";
      sysStateEl.style.color = "#facc15";
      atcStage.classList.add("fault-mode");
      monAlertDetail.textContent = "PERINGATAN: Potensiometer mentok / nilai ADC di luar batas normal!";
      monAlertDetail.style.borderLeftColor = "#eab308";
    } else {
      alarmBanner.textContent = "SYSTEM NORMAL";
      alarmBanner.className = "alarm-banner off";
      alarmEl.textContent = "OFF";
      alarmEl.style.color = "#4ade80";
      sysStateEl.textContent = "NORMAL";
      sysStateEl.style.color = "#4ade80";
      monAlertDetail.textContent = "Semua parameter dalam batas aman operasional.";
      monAlertDetail.style.borderLeftColor = "#22c55e";
    }
  } catch (e) {
    console.error("Payload bukan JSON valid:", e);
  }
});