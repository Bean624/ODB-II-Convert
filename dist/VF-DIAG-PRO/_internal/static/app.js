/**
 * VF-DIAG PRO - VinFast EV OBD-II Live Diagnostic Frontend Engine
 */

// Global State
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
let pollTimer = null;

// DOM Elements
const portSelect = document.getElementById("portSelect");
const baudSelect = document.getElementById("baudSelect");
const btnRefreshPorts = document.getElementById("btnRefreshPorts");
const btnConnect = document.getElementById("btnConnect");
const btnToggleScan = document.getElementById("btnToggleScan");
const btnDemoMode = document.getElementById("btnDemoMode");
const btnOpenFile = document.getElementById("btnOpenFile");
const fileInput = document.getElementById("fileInput");
const btnExportReport = document.getElementById("btnExportReport");
const connectionPill = document.getElementById("connectionPill");
const connectionStatusText = document.getElementById("connectionStatusText");
const clockDisplay = document.getElementById("clockDisplay");

// Search & Filter
const searchInput = document.getElementById("searchInput");
const filterCategory = document.getElementById("filterCategory");
const tableBody = document.getElementById("tableBody");
const paramCountBadge = document.getElementById("paramCountBadge");

// Check if running in pywebview or web browser
const isPyWebView = () => window.pywebview && window.pywebview.api;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  fetchPorts();
  renderDashboard(diagnosticState);
  loadInitialTable();

  // Event Listeners
  btnRefreshPorts.addEventListener("click", fetchPorts);
  btnConnect.addEventListener("click", toggleConnection);
  btnToggleScan.addEventListener("click", toggleScanning);
  btnDemoMode.addEventListener("click", toggleDemoMode);
  btnOpenFile.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileSelect);
  btnExportReport.addEventListener("click", exportReport);

  searchInput.addEventListener("input", filterTable);
  filterCategory.addEventListener("change", filterTable);

  // Poll for updates if connected or demo
  setInterval(() => {
    if (isConnected || isDemo) {
      fetchLatestState();
    }
  }, 1000);
});

// Clock
function initClock() {
  const updateClock = () => {
    const now = new Date();
    clockDisplay.textContent = now.toLocaleTimeString("vi-VN") + " - " + now.toLocaleDateString("vi-VN");
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// Fetch available serial ports
async function fetchPorts() {
  portSelect.innerHTML = '<option value="">Đang dò tìm cổng...</option>';
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
      portSelect.innerHTML = '<option value="">Không tìm thấy cổng COM</option>';
      return;
    }

    ports.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.port;
      opt.textContent = `${p.port} - ${p.description || "Serial Device"}`;
      if (p.is_candidate) {
        opt.selected = true;
      }
      portSelect.appendChild(opt);
    });
  } catch (err) {
    console.warn("Could not fetch ports:", err);
    portSelect.innerHTML = '<option value="COM1">COM1 - Mặc định</option><option value="COM3">COM3 - Bluetooth</option>';
  }
}

// Connect / Disconnect OBD
async function toggleConnection() {
  if (isConnected) {
    // Disconnect
    if (isPyWebView()) {
      await window.pywebview.api.disconnect();
    } else {
      await fetch("/api/disconnect", { method: "POST" });
    }
    setConnectionState(false, "Đã ngắt kết nối");
  } else {
    const port = portSelect.value;
    const baud = parseInt(baudSelect.value);
    if (!port) {
      alert("Vui lòng chọn cổng COM!");
      return;
    }

    setConnectionState("connecting", `Đang kết nối ${port}...`);

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
        setConnectionState(true, `Đã kết nối ${port} (${baud} bps)`);
        btnToggleScan.disabled = false;
        btnToggleScan.classList.remove("disabled");
      } else {
        setConnectionState(false, `Lỗi kết nối ${port}`);
        alert(`Không thể kết nối với ${port}. Hãy kiểm tra dây cáp cắm vào xe và máy tính!`);
      }
    } catch (err) {
      setConnectionState(false, "Lỗi kết nối");
      console.error(err);
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
    btnToggleScan.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg> Quét Sống (Live Scan)`;
    btnToggleScan.classList.remove("btn-danger");
    btnToggleScan.classList.add("btn-scan");
    connectionPill.className = "status-pill connected";
    connectionStatusText.textContent = "Đã kết nối (Tạm dừng)";
  } else {
    if (isPyWebView()) {
      await window.pywebview.api.start_scan();
    } else {
      await fetch("/api/start_scan", { method: "POST" });
    }
    isScanning = true;
    btnToggleScan.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg> Dừng Quét`;
    btnToggleScan.classList.remove("btn-scan");
    btnToggleScan.classList.add("btn-danger");
    connectionPill.className = "status-pill scanning";
    connectionStatusText.textContent = "Đang quét dữ liệu UDS Live...";
  }
}

// Toggle Demo Simulation Mode
async function toggleDemoMode() {
  if (isDemo) {
    isDemo = false;
    btnDemoMode.textContent = "Mô Phỏng Live (Demo)";
    btnDemoMode.classList.remove("active");
    if (isPyWebView()) {
      await window.pywebview.api.disconnect();
    } else {
      await fetch("/api/disconnect", { method: "POST" });
    }
    setConnectionState(false, "Chưa kết nối cáp OBD");
  } else {
    isDemo = true;
    btnDemoMode.textContent = "Dừng Mô Phỏng";
    btnDemoMode.classList.add("active");
    if (isPyWebView()) {
      await window.pywebview.api.connect_simulation();
    } else {
      await fetch("/api/demo", { method: "POST" });
    }
    setConnectionState(true, "Chế độ mô phỏng (Demo Mode)");
    isScanning = true;
    btnToggleScan.disabled = false;
    btnToggleScan.classList.remove("disabled");
    btnToggleScan.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg> Dừng Quét`;
    btnToggleScan.classList.add("btn-danger");
    connectionPill.className = "status-pill scanning";
  }
}

// Update connection state UI
function setConnectionState(state, text) {
  if (state === true) {
    isConnected = true;
    connectionPill.className = "status-pill connected";
    btnConnect.textContent = "Ngắt Kết Nối";
    btnConnect.classList.remove("btn-connect");
    btnConnect.classList.add("btn-secondary");
  } else if (state === "connecting") {
    isConnected = false;
    connectionPill.className = "status-pill scanning";
    btnConnect.textContent = "Đang nối...";
  } else {
    isConnected = false;
    isScanning = false;
    connectionPill.className = "status-pill disconnected";
    btnConnect.textContent = "Kết Nối Cáp";
    btnConnect.classList.remove("btn-secondary");
    btnConnect.classList.add("btn-connect");
    btnToggleScan.disabled = true;
    btnToggleScan.classList.add("disabled");
    btnToggleScan.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg> Quét Sống (Live Scan)`;
    btnToggleScan.classList.remove("btn-danger");
  }
  connectionStatusText.textContent = text;
}

// Fetch latest telemetry
async function fetchLatestState() {
  try {
    let data = null;
    if (isPyWebView()) {
      data = await window.pywebview.api.get_state();
    } else {
      const res = await fetch("/api/state");
      data = await res.json();
    }
    if (data) {
      diagnosticState = data;
      renderDashboard(data);
    }
  } catch (err) {
    console.error("Error fetching state:", err);
  }
}

// Render Dashboard
function renderDashboard(data) {
  if (!data) return;

  const bat = data.battery || {};
  const hvac = data.hvac || {};
  const veh = data.vehicle || {};
  const cont = veh.contactors || {};

  // SOH Gauge
  const soh = parseFloat(bat.soh) || 99;
  const deg = (100 - soh).toFixed(1);
  document.getElementById("sohVal").textContent = Math.round(soh);
  document.getElementById("batteryDegradation").textContent = `${deg}%`;
  document.getElementById("sohGauge").style.setProperty("--val", soh);
  if (soh >= 90) {
    document.getElementById("sohStatusTag").textContent = "Hoàn Hảo";
    document.getElementById("sohStatusTag").className = "tag tag-success";
  } else if (soh >= 70) {
    document.getElementById("sohStatusTag").textContent = "Bình Thường";
    document.getElementById("sohStatusTag").className = "tag tag-cyan";
  } else {
    document.getElementById("sohStatusTag").textContent = "Cảnh Báo Chai";
    document.getElementById("sohStatusTag").className = "tag tag-gold";
  }

  // SOC Gauge
  const soc = parseFloat(bat.soc) || 80;
  document.getElementById("socVal").textContent = Math.round(soc);
  document.getElementById("socGauge").style.setProperty("--val", soc);
  document.getElementById("packVoltageVal").textContent = `${bat.pack_voltage || 385.5} V`;
  document.getElementById("packCurrentVal").textContent = `${bat.pack_current || 1.09} A`;
  document.getElementById("realSocVal").textContent = `${bat.real_soc || 80.0}%`;

  // HVAC
  document.getElementById("coolantInVal").innerHTML = `${hvac.coolant_inlet_temp || 34.0} <small>°C</small>`;
  document.getElementById("coolantOutVal").innerHTML = `${hvac.coolant_outlet_temp || 34.0} <small>°C</small>`;
  document.getElementById("massflowVal").innerHTML = `${hvac.coolant_massflow || 15} <small>L/min</small>`;
  document.getElementById("packTempAvgVal").innerHTML = `${hvac.pack_temp_avg || 34.1} <small>°C</small>`;
  document.getElementById("cellTempMinVal").textContent = `${hvac.cell_temp_min || 33.0} °C`;
  document.getElementById("cellTempMaxVal").textContent = `${hvac.cell_temp_max || 35.0} °C`;
  const tDelta = Math.abs((parseFloat(hvac.cell_temp_max) || 35) - (parseFloat(hvac.cell_temp_min) || 33)).toFixed(1);
  document.getElementById("cellTempDeltaVal").textContent = `${tDelta} °C`;

  // Module Voltages
  renderModuleBars(data.modules || []);

  // Cells Delta
  const deltaMv = parseFloat(bat.cell_delta_mv) || 0.0;
  document.getElementById("cellDeltaVal").textContent = `${deltaMv} mV`;
  if (deltaMv <= 15) {
    document.getElementById("cellDeltaVal").className = "text-green";
  } else if (deltaMv <= 40) {
    document.getElementById("cellDeltaVal").className = "highlight-gold";
  } else {
    document.getElementById("cellDeltaVal").className = "highlight-red";
  }
  document.getElementById("cellVMaxVal").textContent = `${bat.cell_v_max || 3.3} V`;
  document.getElementById("cellVMinVal").textContent = `${bat.cell_v_min || 3.3} V`;

  // Lifetime
  document.getElementById("energyStoredVal").textContent = Number(bat.energy_stored_kwh || 5089).toLocaleString();
  document.getElementById("energySuppliedVal").textContent = Number(bat.energy_supplied_kwh || 4871).toLocaleString();

  // Contactors
  setContactorBadge("posContactorState", cont.positive);
  setContactorBadge("negContactorState", cont.negative);
  setContactorBadge("preContactorState", cont.precharge);
  document.getElementById("posAgingVal").textContent = `${cont.pos_cycles || 804} chu kỳ`;
  document.getElementById("negAgingVal").textContent = `${cont.neg_cycles || 804} chu kỳ`;

  // Vehicle
  document.getElementById("odoVal").textContent = `${Number(veh.odometer || 29988).toLocaleString()} Km`;
  document.getElementById("aux12vVal").textContent = `${veh.aux_battery_12v || 13.1} V`;
  document.getElementById("ignitionVal").textContent = veh.ignition_status || "ACC";
  if (veh.qr_code) {
    document.getElementById("qrDisplay").textContent = veh.qr_code.substring(0, 16) + "...";
    document.getElementById("qrDisplay").title = veh.qr_code;
  }
}

function setContactorBadge(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  const isClosed = String(state).toLowerCase().includes("closed") || state === "1" || state === 1;
  if (isClosed) {
    el.textContent = "ĐÓNG (Closed)";
    el.className = "badge-state closed";
  } else {
    el.textContent = "MỞ (Open)";
    el.className = "badge-state open";
  }
}

// Render 10 Module Voltage Bars
function renderModuleBars(modules) {
  const container = document.getElementById("moduleBars");
  if (!container) return;

  // Find max and min module voltage for visual scaling
  const minV = 20.0;
  const maxV = 50.0;

  let html = "";
  modules.forEach(m => {
    const v = parseFloat(m.voltage) || 35.0;
    const pct = Math.min(100, Math.max(10, ((v - minV) / (maxV - minV)) * 100));
    html += `
      <div class="module-bar-item">
        <span class="module-bar-label">M${m.module}</span>
        <div class="module-bar-track">
          <div class="module-bar-inner" style="height: ${pct}%;"></div>
        </div>
        <span class="module-bar-val">${v.toFixed(1)}V</span>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Load initial 109 diagnostic parameters table
async function loadInitialTable() {
  try {
    let items = [];
    if (isPyWebView()) {
      items = await window.pywebview.api.get_raw_parameters();
    } else {
      const res = await fetch("/api/parameters");
      items = await res.json();
    }
    diagnosticState.raw_items = items;
    renderTable(items);
  } catch (err) {
    console.warn("Could not fetch table items, using default dump:", err);
  }
}

// Render diagnostic data table
function renderTable(items) {
  if (!tableBody) return;
  paramCountBadge.textContent = `${items.length} thông số`;

  let html = "";
  items.forEach(it => {
    html += `
      <tr data-did="${it.did || ''}" data-name="${it.name || ''}">
        <td><span class="did-tag">${it.did || '--'}</span></td>
        <td><strong>${it.name || '--'}</strong></td>
        <td class="val-cell highlight-cyan">${it.value !== undefined && it.value !== null ? it.value : (it.sample_val || '--')}</td>
        <td>${it.unit || ''}</td>
        <td class="raw-cell">${it.raw || it.raw_sample || '--'}</td>
        <td class="text-muted"><small>${it.method_type || 'TYPE=AX+B'}</small></td>
      </tr>
    `;
  });
  tableBody.innerHTML = html;
}

// Filter table
function filterTable() {
  const query = searchInput.value.toLowerCase().trim();
  const cat = filterCategory.value;

  const rows = tableBody.getElementsByTagName("tr");
  let matchCount = 0;

  for (let r of rows) {
    const did = (r.getAttribute("data-did") || "").toLowerCase();
    const name = (r.getAttribute("data-name") || "").toLowerCase();

    let matchesCategory = true;
    if (cat === "BATTERY") {
      matchesCategory = name.includes("soc") || name.includes("soh") || name.includes("voltage") || name.includes("power") || name.includes("current");
    } else if (cat === "HVAC") {
      matchesCategory = name.includes("temp") || name.includes("coolant") || name.includes("massflow");
    } else if (cat === "MODULE") {
      matchesCategory = name.includes("module") || name.includes("cell") || name.includes("stack");
    } else if (cat === "CONTACTOR") {
      matchesCategory = name.includes("contactor") || name.includes("isolation") || name.includes("error") || name.includes("hvil");
    } else if (cat === "VEHICLE") {
      matchesCategory = name.includes("odometer") || name.includes("speed") || name.includes("ignition") || name.includes("supply voltage") || name.includes("qr");
    }

    const matchesSearch = !query || did.includes(query) || name.includes(query);

    if (matchesCategory && matchesSearch) {
      r.style.display = "";
      matchCount++;
    } else {
      r.style.display = "none";
    }
  }

  paramCountBadge.textContent = `${matchCount} thông số`;
}

// Handle local file upload
async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  setConnectionState("connecting", `Đang giải mã file ${file.name}...`);
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
      setConnectionState(true, `Đã convert xong file: ${file.name}`);
      alert(`Đã giải mã thành công file "${file.name}" với đầy đủ 109 thông số!`);
    } else {
      alert(`Lỗi convert file: ${result.error}`);
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi tải file lên phần mềm");
  }
}

// Print / Export Report
function exportReport() {
  window.print();
}
