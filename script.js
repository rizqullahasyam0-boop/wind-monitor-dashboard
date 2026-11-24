const BROKER_WSS = "wss://broker.emqx.io:8084/mqtt";
const TOPIC = "windmonitor/tnu18/telemetry";

const statusBadge = document.getElementById("mqttStatus");
const needle = document.getElementById("needle");
const rotor = document.getElementById("rotor");

let currentSpeedKt = 0;
let rotorAngle = 0;

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

// Animasi rotasi baling-baling kecepatan angin
let lastFrame = performance.now();
function animateRotor(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  const degPerSec = currentSpeedKt * 18;
  rotorAngle = (rotorAngle + degPerSec * dt) % 360;
  if (rotor) {
    rotor.style.transform = `rotate(${rotorAngle}deg)`;
  }
  requestAnimationFrame(animateRotor);
}
requestAnimationFrame(animateRotor);

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

    document.getElementById("degVal").textContent = errArah ? "ERR" : arah.toFixed(1);
    document.getElementById("dirText").textContent = errArah
      ? "Sensor Error"
      : (data.mataAngin ?? getCardinalLabel(arah));
    document.getElementById("ktVal").textContent = errKec ? "ERR" : kec.toFixed(1);

    if (needle) {
      needle.style.transform = `rotate(${arah}deg)`;
    }
    currentSpeedKt = errKec ? 0 : Math.max(0, kec);

    document.getElementById("errArah").textContent = errArah ? "ERR" : "OK";
    document.getElementById("errKec").textContent = errKec ? "ERR" : "OK";

    const alarmEl = document.getElementById("alarmStatus");
    if (alarm) {
      alarmEl.textContent = "AKTIF (>25 kt / ERR)";
      alarmEl.style.color = "#f87171";
    } else {
      alarmEl.textContent = "OFF";
      alarmEl.style.color = "#4ade80";
    }
  } catch (e) {
    console.error("Payload bukan JSON valid:", e);
  }
});