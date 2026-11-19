const BROKER_WSS = "wss://broker.emqx.io:8084/mqtt";
const TOPIC = "windmonitor/tnu18/telemetry";

const statusBadge = document.getElementById("mqttStatus");
const needle = document.getElementById("needle");
const rotor = document.getElementById("rotor");

let currentSpeedKt = 0;
let rotorAngle = 0;

// Animasi rotasi baling-baling kecepatan angin
let lastFrame = performance.now();
function animateRotor(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  const degPerSec = currentSpeedKt * 18;
  rotorAngle = (rotorAngle + degPerSec * dt) % 360;
  rotor.style.transform = `rotate(${rotorAngle}deg)`;
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

client.on("error", () => {
  statusBadge.textContent = "MQTT: Error";
  statusBadge.className = "badge warn";
});

client.on("message", (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    const arah = Number(data.arah ?? 0);
    const kec = Number(data.kec ?? 0);

    document.getElementById("degVal").textContent = arah;
    document.getElementById("dirText").textContent = data.mataAngin ?? "-";
    document.getElementById("ktVal").textContent = kec;

    needle.style.transform = `rotate(${arah}deg)`;
    currentSpeedKt = Math.max(0, kec);

    document.getElementById("errArah").textContent = data.errArah ? "ERR" : "OK";
    document.getElementById("errKec").textContent = data.errKec ? "ERR" : "OK";

    const alarmEl = document.getElementById("alarmStatus");
    if (data.alarm) {
      alarmEl.textContent = "AKTIF (>25 kt)";
      alarmEl.style.color = "#f87171";
    } else {
      alarmEl.textContent = "OFF";
      alarmEl.style.color = "#4ade80";
    }
  } catch (e) {
    console.error("Payload bukan JSON valid:", e);
  }
});