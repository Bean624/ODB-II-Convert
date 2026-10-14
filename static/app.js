/**
 * VF-DIAG WORKSHOP - VinFast EV OBD-II Live Diagnostic Frontend Engine
 * Professional Workshop Style / Technical Telemetry
 */

// Global State Cache
let diagnosticState = {
  battery: {
    soh: 99.0,
    soc: 80.0,
    real_soc: 80.0,
    pack_voltage: 385.5,
    pack_current: 1.09,
    energy_stored_kwh: 5089,
    energy_supplied_kwh: 4871,
    cell_v_max: 3.3,
    cell_v_min: 3.3,
    cell_delta_mv: 0.0
  },
  power_analysis: {
    is_valid: true,
    operating_state: "DANG_NGHI_BAT_DIEN",
    operating_state_text: "Xe dung bat dien (Tieu thu phu tai / DC-DC)",
    instantaneous_power_w: 420.2,
    instantaneous_power_kw: 0.420,
    pack_voltage_v: 385.5,
    pack_current_a: 1.09,
    drain_rate_w: 420.2,
    drain_per_hour_kwh: 0.420,
    session_elapsed_seconds: 0,
    session_sample_count: 0,
    cumulative_discharge_kwh: 0.0000,
    cumulative_charge_kwh: 0.0000,
    net_energy_kwh: 0.0000,
    distance_km: 0.0,
    consumption_wh_per_km: null,
    soc_initial: 80.0,
    soc_current: 80.0,
    soc_drop_pct: 0.0,
    technical_assessment: "Xe dang dung bat dien, dong dien tieu thu 1.09 A (cong suat 420.2 W). Tieu hao uoc tinh 0.42 kWh/gio."
  },
  hvac: {
    coolant_inlet_temp: 34.0,
    coolant_outlet_temp: 34.0,
    coolant_massflow: 15,
    cell_temp_max: 35.0,
    cell_temp_min: 33.0,
    pack_temp_avg: 34.1
  },
  modules: [
    { module: 1, voltage: 39.7 },
    { module: 2, voltage: 39.7 },
    { module: 3, voltage: 33.0 },
    { module: 4, voltage: 33.0 },
    { module: 5, voltage: 43.0 },
    { module: 6, voltage: 43.0 },
    { module: 7, voltage: 39.7 },
    { module: 8, voltage: 46.3 },
    { module: 9, voltage: 39.6 },
    { module: 10, voltage: 26.4 }
  ],
  vehicle: {
    odometer: 29988,
    aux_battery_12v: 13.1,
    ignition_status: "ACC",
    qr_code: "EEP73110011AP012100066260104DGR087",
    contactors: {
      positive: "closed",
      negative: "closed",
      precharge: "open",
      pos_cycles: 804,
      neg_cycles: 804
    }
  },
  raw_items: []
};

let isConnected = false;
let isScanning = false;
let isDemo = false;

// DOM Elements
const portSelect = document.getElementById("portSelect");
const baudSelect = document.getElementById("baudSelect");
const btnRefreshPorts = document.getElementById("btnRefreshPorts");
const btnConnect = document.getElementById("btnConnect");
const btnToggleScan = document.getElementById("btnToggleScan");
const btnDemoMode = document.getElementById("btnDemoMode");
const btnOpenFile = document.getElementById("btnOpenFile");
const fileInput = document.getElementById("fileInput");
const btnExportCSV = document.getElementById("btnExportCSV");
const btnExportReport = document.getElementById("btnExportReport");
const btnResetSession = document.getElementById("btnResetSession");
const connectionStatusBadge = document.getElementById("connectionStatusBadge");
const clockDisplay = document.getElementById("clockDisplay");

// Search & Filter
const searchInput = document.getElementById("searchInput");
const filterCategory = document.getElementById("filterCategory");
const tableBody = document.getElementById("tableBody");
const paramCountBadge = document.getElementById("paramCountBadge");

// Check if running in pywebview
const isPyWebView = () => window.pywebview && window.pywebview.api;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  fetchPorts();
  renderDashboard(diagnosticState);
  loadInitialTable();
  triggerAutoConnect();

  // Event Listeners
  btnRefreshPorts.addEventListener("click", fetchPorts);
  btnConnect.addEventListener("click", toggleConnection);
  btnToggleScan.addEventListener("click", toggleScanning);
  btnDemoMode.addEventListener("click", toggleDemoMode);
  btnOpenFile.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);
  btnExportCSV.addEventListener("click", exportTableToCSV);
  btnExportReport.addEventListener("click", () => window.print());
  btnResetSession.addEventListener("click", resetSession);

  searchInput.addEventListener("input", filterTable);
  filterCategory.addEventListener("change", filterTable);

  // Poll for updates if connected or demo, and auto-detect plug-in if disconnected
  setInterval(() => {
    if (isConnected || isDemo) {
      fetchLatestState();
    } else {
      triggerAutoConnectBackground();
    }
  }, 1200);
});

// Clock
function initClock() {
  const updateClock = () => {
    const now = new Date();
    clockDisplay.textContent = now.toLocaleDateString("vi-VN") + " " + now.toLocaleTimeString("vi-VN");
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// Fetch available serial ports
async function fetchPorts() {
  portSelect.innerHTML = '<option value="">Dang quet cong...</option>';
  try {
    let ports = [];
    if (isPyWebView()) {
      ports = await window.pywebview.api.get_ports();
    } else {
      const res = await fetch("/api/ports");
      ports = await res.json();
    }

    portSelect.innerHTML = "";
    if (!ports || ports.length === 0) {
      portSelect.innerHTML = '<option value="">Khong tim thay cong COM</option>';
      return;
    }

    ports.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.port;
      opt.textContent = `${p.port}: ${p.description || "Serial Port"}`;
      if (p.is_candidate) {
        opt.selected = true;
      }
      portSelect.appendChild(opt);
    });
  } catch (err) {
    portSelect.innerHTML = '<option value="COM1">COM1</option>';
  }
}

// Connect / Disconnect OBD
async function toggleConnection() {
  if (isConnected) {
    if (isPyWebView()) {
      await window.pywebview.api.disconnect();
    } else {
      await fetch("/api/disconnect", { method: "POST" });
    }
    setConnectionState(false, "MAT KET NOI");
  } else {
    const port = portSelect.value;
    const baud = parseInt(baudSelect.value);
    if (!port) {
      return;
    }

    setConnectionState("connecting", `DANG NOI ${port}...`);

    try {
      let success = false;
      if (isPyWebView()) {
        success = await window.pywebview.api.connect(port, baud);
      } else {
        const res = await fetch("/api/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ port, baud })
        });
        const data = await res.json();
        success = data.success;
      }

      if (success) {
        setConnectionState(true, `DA KET NOI (${port})`);
        btnToggleScan.disabled = false;
      } else {
        setConnectionState(false, `LOI KET NOI (${port})`);
      }
    } catch (err) {
      setConnectionState(false, "LOI KET NOI");
    }
  }
}

// Toggle Live Scan
async function toggleScanning() {
  if (!isConnected && !isDemo) return;

  if (isScanning) {
    if (isPyWebView()) {
      await window.pywebview.api.stop_scan();
    } else {
      await fetch("/api/stop_scan", { method: "POST" });
    }
    isScanning = false;
    btnToggleScan.textContent = "DOC LIVE";
    btnToggleScan.className = "btn";
    connectionStatusBadge.className = "status-badge normal";
    connectionStatusBadge.textContent = "DA KET NOI (TAM DUNG)";
  } else {
    if (isPyWebView()) {
      await window.pywebview.api.start_scan();
    } else {
      await fetch("/api/start_scan", { method: "POST" });
    }
    isScanning = true;
    btnToggleScan.textContent = "DUNG DOC";
    btnToggleScan.className = "btn btn-danger";
    connectionStatusBadge.className = "status-badge normal";
    connectionStatusBadge.textContent = "DANG DOC LIVE (UDS 0x22)";
  }
}

// Toggle Demo Mode
async function toggleDemoMode() {
  if (isDemo) {
    isDemo = false;
    btnDemoMode.textContent = "MO PHONG OFFLINE";
    if (isPyWebView()) {
      await window.pywebview.api.disconnect();
    } else {
      await fetch("/api/disconnect", { method: "POST" });
    }
    setConnectionState(false, "MAT KET NOI");
  } else {
    isDemo = true;
    btnDemoMode.textContent = "DUNG MO PHONG";
    if (isPyWebView()) {
      await window.pywebview.api.connect_simulation();
    } else {
      await fetch("/api/demo", { method: "POST" });
    }
    setConnectionState(true, "CHE DO MO PHONG (DEMO)");
    isScanning = true;
    btnToggleScan.disabled = false;
    btnToggleScan.textContent = "DUNG DOC";
    btnToggleScan.className = "btn btn-danger";
  }
}

// Reset Session
async function resetSession() {
  try {
    await fetch("/api/reset_session", { method: "POST" });
    fetchLatestState();
  } catch (e) {
    console.error(e);
  }
}

// Set Connection State UI
function setConnectionState(state, text) {
  if (state === true) {
    isConnected = true;
    connectionStatusBadge.className = "status-badge normal";
    btnConnect.textContent = "NGAT KET NOI";
    btnConnect.className = "btn";
  } else if (state === "connecting") {
    isConnected = false;
    connectionStatusBadge.className = "status-badge warning";
    btnConnect.textContent = "DANG NOI...";
  } else {
    isConnected = false;
    isScanning = false;
    connectionStatusBadge.className = "status-badge offline";
    btnConnect.textContent = "KET NOI";
    btnConnect.className = "btn btn-primary";
    btnToggleScan.disabled = true;
    btnToggleScan.textContent = "DOC LIVE";
    btnToggleScan.className = "btn";
  }
  connectionStatusBadge.textContent = text;
}

// Auto Connect on launch
async function triggerAutoConnect() {
  setConnectionState("connecting", "DANG DO TIM CAP OBD-II...");
  try {
    const res = await fetch("/api/auto_connect", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setConnectionState(true, `DA KET NOI (${data.port})`);
      isScanning = true;
      btnToggleScan.disabled = false;
      btnToggleScan.textContent = "DUNG DOC";
      btnToggleScan.className = "btn btn-danger";
      fetchPorts();
    } else {
      setConnectionState(false, "CHO CAM CAP OBD...");
    }
  } catch (e) {
    setConnectionState(false, "CHO CAM CAP OBD...");
  }
}

// Background Auto Connect
let isAutoChecking = false;
async function triggerAutoConnectBackground() {
  if (isAutoChecking || isConnected || isDemo) return;
  isAutoChecking = true;
  try {
    const res = await fetch("/api/auto_connect", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setConnectionState(true, `DA KET NOI (${data.port})`);
      isScanning = true;
      btnToggleScan.disabled = false;
      btnToggleScan.textContent = "DUNG DOC";
      btnToggleScan.className = "btn btn-danger";
      fetchPorts();
    }
  } catch (e) {
  } finally {
    isAutoChecking = false;
  }
}

// Fetch latest telemetry
async function fetchLatestState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    if (data) {
      diagnosticState = data;
      renderDashboard(data);
    }
  } catch (err) {
  }
}

// Format seconds into HH:MM:SS
function formatDuration(sec) {
  sec = Math.floor(sec || 0);
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Render Dashboard
function renderDashboard(data) {
  if (!data) return;

  const bat = data.battery || {};
  const pa = data.power_analysis || {};
  const hvac = data.hvac || {};
  const veh = data.vehicle || {};
  const cont = veh.contactors || {};

  // 1. Power & Battery Drain Monitoring
  const pKw = parseFloat(pa.instantaneous_power_kw) || 0.0;
  const pW = parseFloat(pa.instantaneous_power_w) || 0.0;
  const pSign = pKw >= 0 ? "+" : "";
  document.getElementById("instantPowerVal").innerHTML = `${pSign}${pKw.toFixed(3)} <span class="metric-data-sub">kW</span>`;
  document.getElementById("instantPowerW").textContent = `${pSign}${pW.toFixed(1)} W (${bat.pack_voltage || 385.5}V x ${bat.pack_current || 1.09}A)`;

  const curVal = parseFloat(bat.pack_current) || 0.0;
  const curSign = curVal >= 0 ? "+" : "";
  document.getElementById("packCurrentVal").innerHTML = `${curSign}${curVal.toFixed(2)} <span class="metric-data-sub">A</span>`;
  document.getElementById("packVoltageVal").innerHTML = `${bat.pack_voltage || 385.5} <span class="metric-data-sub">V</span>`;

  document.getElementById("drainPerHourVal").innerHTML = `${(pa.drain_per_hour_kwh || 0.0).toFixed(3)} <span class="metric-data-sub">kWh/h</span>`;
  document.getElementById("cumulativeDischargeVal").innerHTML = `${(pa.cumulative_discharge_kwh || 0.0).toFixed(4)} <span class="metric-data-sub">kWh</span>`;
  document.getElementById("cumulativeChargeVal").innerHTML = `${(pa.cumulative_charge_kwh || 0.0).toFixed(4)} <span class="metric-data-sub">kWh</span>`;
  document.getElementById("sessionTimeVal").textContent = formatDuration(pa.session_elapsed_seconds);
  document.getElementById("sessionSampleVal").textContent = `Mau do: ${pa.session_sample_count || 0} mau`;

  const socDrop = parseFloat(pa.soc_drop_pct) || 0.0;
  document.getElementById("socDropVal").innerHTML = `${socDrop.toFixed(1)} <span class="metric-data-sub">%</span>`;
  document.getElementById("socInitialVal").textContent = `SOC dau: ${pa.soc_initial || bat.soc || 80}% | Hien tai: ${bat.soc || 80}%`;

  // Operating State Badge
  const opBadge = document.getElementById("operatingStateBadge");
  opBadge.textContent = (pa.operating_state_text || "CHUA XAC DINH").toUpperCase();
  if (pa.operating_state === "DANG_SAC") {
    opBadge.className = "status-badge normal";
  } else if (pa.operating_state === "DANG_CHAY") {
    opBadge.className = "status-badge normal";
  } else if (pa.operating_state === "DANG_NGHI_BAT_DIEN") {
    opBadge.className = "status-badge warning";
  } else {
    opBadge.className = "status-badge offline";
  }

  // Technical Assessment text
  if (pa.technical_assessment) {
    document.getElementById("technicalAssessmentText").textContent = pa.technical_assessment;
  }

  // 2. BMS Core Vitals
  const soh = parseFloat(bat.soh) || 99;
  document.getElementById("sohVal").innerHTML = `${Math.round(soh)} <span class="metric-data-sub">%</span>`;
  document.getElementById("degradationDesc").textContent = `Do chai pin thuc te: ${(100 - soh).toFixed(1)}%`;

  const soc = parseFloat(bat.soc) || 80;
  document.getElementById("socVal").innerHTML = `${Math.round(soc)} <span class="metric-data-sub">%</span>`;
  document.getElementById("realSocDesc").textContent = `Real SOC tu BMS: ${bat.real_soc || 80.0}%`;

  const deltaMv = parseFloat(bat.cell_delta_mv) || 0.0;
  document.getElementById("cellDeltaVal").innerHTML = `${deltaMv.toFixed(1)} <span class="metric-data-sub">mV</span>`;
  document.getElementById("cellVMinMaxDesc").textContent = `Vmin: ${bat.cell_v_min || 3.3} V | Vmax: ${bat.cell_v_max || 3.3} V`;

  document.getElementById("aux12vVal").innerHTML = `${veh.aux_battery_12v || 13.1} <span class="metric-data-sub">V</span>`;
  document.getElementById("energyStoredVal").innerHTML = `${Number(bat.energy_stored_kwh || 5089).toLocaleString()} <span class="metric-data-sub">kWh</span>`;
  document.getElementById("energySuppliedVal").innerHTML = `${Number(bat.energy_supplied_kwh || 4871).toLocaleString()} <span class="metric-data-sub">kWh</span>`;

  // Contactors
  const posC = String(cont.positive || "closed").toUpperCase().includes("CLOSED") ? "DONG" : "MO";
  const negC = String(cont.negative || "closed").toUpperCase().includes("CLOSED") ? "DONG" : "MO";
  const preC = String(cont.precharge || "open").toUpperCase().includes("CLOSED") ? "DONG" : "MO";
  document.getElementById("contactorSummary").textContent = `${posC} / ${negC} / ${preC}`;
  document.getElementById("contactorAgingDesc").textContent = `Chu ky dong ngat (+/-): ${cont.pos_cycles || 804} lan`;
  document.getElementById("isolationVal").innerHTML = `${Number(bat.isolation_kwh || 4988).toLocaleString()} <span class="metric-data-sub">kΩ</span>`;

  // 3. Thermal & Cooling
  document.getElementById("coolantInVal").innerHTML = `${hvac.coolant_inlet_temp || 34.0} <span class="metric-data-sub">°C</span>`;
  document.getElementById("coolantOutVal").innerHTML = `${hvac.coolant_outlet_temp || 34.0} <span class="metric-data-sub">°C</span>`;
  document.getElementById("massflowVal").innerHTML = `${hvac.coolant_massflow || 15} <span class="metric-data-sub">L/min</span>`;
  document.getElementById("cellTempRangeVal").innerHTML = `${hvac.cell_temp_min || 33.0} / ${hvac.cell_temp_max || 35.0} <span class="metric-data-sub">°C</span>`;
  document.getElementById("packTempAvgVal").textContent = `Nhiet do trung binh pack: ${hvac.pack_temp_avg || 34.1} °C`;

  // 4. Module Voltages
  renderModuleGrid(data.modules || []);

  // Header meta
  document.getElementById("odoDisplay").textContent = `ODO: ${Number(veh.odometer || 29988).toLocaleString()} KM`;
}

// Render 10 Module Voltages Grid
function renderModuleGrid(modules) {
  const container = document.getElementById("moduleGrid");
  if (!container) return;

  let html = "";
  modules.forEach(m => {
    const v = parseFloat(m.voltage) || 35.0;
    html += `
      <div class="module-box">
        <div class="module-box-name">MOD ${m.module < 10 ? '0' + m.module : m.module}</div>
        <div class="module-box-voltage">${v.toFixed(1)} V</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Load initial UDS verification table
async function loadInitialTable() {
  try {
    const res = await fetch("/api/parameters");
    const items = await res.json();
    diagnosticState.raw_items = items;
    renderTable(items);
  } catch (err) {
  }
}

// Render Data Table with Verification Status
function renderTable(items) {
  if (!tableBody) return;
  paramCountBadge.textContent = `${items.length} thong so`;

  let html = "";
  items.forEach(it => {
    const val = it.value !== undefined && it.value !== null ? it.value : (it.sample_val || '--');
    const status = it.verification_status || "DA XAC MINH";
    let statusClass = "status-badge normal";
    if (status.includes("KHONG")) {
      statusClass = "status-badge danger";
    } else if (status.includes("CHUA")) {
      statusClass = "status-badge warning";
    }

    html += `
      <tr data-did="${it.did || ''}" data-name="${it.name || ''}" data-status="${status}">
        <td class="col-did">${it.did || '--'}</td>
        <td><strong>${it.name || '--'}</strong></td>
        <td class="col-val">${val}</td>
        <td class="col-unit">${it.unit || ''}</td>
        <td class="col-raw">${it.raw || it.raw_sample || '--'}</td>
        <td class="col-ecu">${it.ecu || 'BMS (0x7E4)'}</td>
        <td class="col-status"><span class="${statusClass}">${status}</span></td>
        <td style="font-size: 11px; color: #475569;">${it.note || 'ISO 14229 / ReadDataByIdentifier'}</td>
      </tr>
    `;
  });
  tableBody.innerHTML = html;
}

// Filter Table
function filterTable() {
  const query = searchInput.value.toLowerCase().trim();
  const cat = filterCategory.value;

  const rows = tableBody.getElementsByTagName("tr");
  let matchCount = 0;

  for (let r of rows) {
    const did = (r.getAttribute("data-did") || "").toLowerCase();
    const name = (r.getAttribute("data-name") || "").toLowerCase();
    const status = (r.getAttribute("data-status") || "").toUpperCase();

    let matchesCategory = true;
    if (cat === "VERIFIED") {
      matchesCategory = status.includes("DA XAC MINH");
    } else if (cat === "UNSUPPORTED") {
      matchesCategory = status.includes("KHONG");
    } else if (cat === "POWER") {
      matchesCategory = name.includes("current") || name.includes("voltage") || name.includes("power") || name.includes("energy");
    } else if (cat === "BATTERY") {
      matchesCategory = name.includes("soc") || name.includes("soh") || name.includes("battery");
    } else if (cat === "COOLING") {
      matchesCategory = name.includes("coolant") || name.includes("temp") || name.includes("massflow");
    } else if (cat === "MODULE") {
      matchesCategory = name.includes("module") || name.includes("cell") || name.includes("stack");
    } else if (cat === "VEHICLE") {
      matchesCategory = name.includes("odometer") || name.includes("speed") || name.includes("ignition") || name.includes("aux") || name.includes("qr");
    }

    const matchesSearch = !query || did.includes(query) || name.includes(query);

    if (matchesCategory && matchesSearch) {
      r.style.display = "";
      matchCount++;
    } else {
      r.style.display = "none";
    }
  }

  paramCountBadge.textContent = `${matchCount} thong so`;
}

// Export Table to CSV
function exportTableToCSV() {
  const rows = document.querySelectorAll(".data-table tr");
  let csv = [];
  rows.forEach(r => {
    if (r.style.display !== "none") {
      const cols = r.querySelectorAll("th, td");
      const rowData = [];
      cols.forEach(c => {
        let text = c.innerText.replace(/"/g, '""');
        rowData.push(`"${text}"`);
      });
      csv.push(rowData.join(","));
    }
  });

  const csvBlob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(csvBlob);
  link.download = `VF_BMS_Diagnostic_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

// Handle Excel Upload
async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  setConnectionState("connecting", `DANG GIAI MA FILE ${file.name}...`);
  try {
    const res = await fetch("/api/upload_file", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      diagnosticState = result.data;
      renderDashboard(diagnosticState);
      if (diagnosticState.raw_items && diagnosticState.raw_items.length > 0) {
        renderTable(diagnosticState.raw_items);
      }
      setConnectionState(true, `DA CONVERT FILE: ${file.name}`);
    } else {
      setConnectionState(false, `LOI CONVERT FILE: ${result.error}`);
    }
  } catch (err) {
    setConnectionState(false, "LOI TAI FILE LEN PHAN MEM");
  }
}
