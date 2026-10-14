"""
OBD-II & UDS Live Communication Engine for VinFast Vehicles
Handles Serial COM port auto-discovery, AT command handshake, 
ISO 15765-4 CAN frames, and UDS (Service 0x22) polling loop.
Includes realistic Simulation Mode for offline testing.
"""

import time
import threading
import logging
import os
from typing import Dict, Any, List, Optional, Callable
import serial
import serial.tools.list_ports

from decoder import VinFastDecoder
from battery_analyzer import BatteryAnalyzer

# Configure technical workshop logger
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vf_diag_workshop.log")
logger = logging.getLogger("VinFastOBD")
logger.setLevel(logging.INFO)

# Avoid adding multiple handlers if reloaded
if not logger.handlers:
    c_handler = logging.StreamHandler()
    c_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(c_handler)
    try:
        f_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
        f_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logger.addHandler(f_handler)
    except Exception:
        pass

class VinFastOBDReader:
    # Priority DIDs to poll periodically
    POLL_DIDS = [
        "F027",  # SOH (%)
        "F026",  # SOC (%)
        "F079",  # Real SOC (%)
        "F013",  # Pack Voltage (V)
        "F04B",  # Pack Current (A)
        "F01B",  # Max Cell Voltage (V)
        "F02E",  # Min Cell Voltage (V)
        "F01D",  # Coolant Intake Temp (°C)
        "F035",  # Coolant Outlet Temp (°C)
        "F01C",  # Cooling Massflow (L/min)
        "F01E",  # Max Cell Temp (°C)
        "F01F",  # Min Cell Temp (°C)
        "F03D",  # Avg Pack Temp (°C)
        "F02F",  # 10 Module Voltages
        "F071",  # Lifetime Energy Stored (kWh)
        "F072",  # Lifetime Energy Supplied (kWh)
        "F121",  # ODO (Km)
        "F122",  # 12V Battery (V)
        "F123",  # Ignition Status
        "F036",  # Positive contactor
        "F037",  # Negative contactor
        "F038",  # Precharge contactor
        "F039",  # Contactor + aging
        "F03A",  # Contactor - aging
        "F012",  # HV Battery State
        "F070"   # Pack QR Code
    ]

    def __init__(self, decoder: Optional[VinFastDecoder] = None):
        self.decoder = decoder or VinFastDecoder()
        self.serial_port: Optional[serial.Serial] = None
        self.is_connected = False
        self.is_scanning = False
        self.is_simulation = False
        self.selected_port = ""
        self.selected_baud = 115200

        self.polling_thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.data_callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self.status_callback: Optional[Callable[[str, str], None]] = None

        self.analyzer = BatteryAnalyzer()

        # Current live state cache
        self.current_state: Dict[str, Any] = {
            "battery": {
                "soh": 99.0,
                "soc": 80.0,
                "real_soc": 80.0,
                "pack_voltage": 385.5,
                "pack_current": 1.09,
                "energy_stored_kwh": 5089,
                "energy_supplied_kwh": 4871,
                "cell_v_max": 3.3,
                "cell_v_min": 3.3,
                "cell_delta_mv": 0.0
            },
            "power_analysis": self.analyzer.update(385.5, 1.09, 0.0, 80.0, 29988),
            "hvac": {
                "coolant_inlet_temp": 34.0,
                "coolant_outlet_temp": 34.0,
                "coolant_massflow": 15,
                "cell_temp_max": 35.0,
                "cell_temp_min": 33.0,
                "pack_temp_avg": 34.1
            },
            "modules": [
                {"module": 1, "voltage": 39.7},
                {"module": 2, "voltage": 39.7},
                {"module": 3, "voltage": 33.0},
                {"module": 4, "voltage": 33.0},
                {"module": 5, "voltage": 43.0},
                {"module": 6, "voltage": 43.0},
                {"module": 7, "voltage": 39.7},
                {"module": 8, "voltage": 46.3},
                {"module": 9, "voltage": 39.6},
                {"module": 10, "voltage": 26.4}
            ],
            "vehicle": {
                "odometer": 29988,
                "aux_battery_12v": 13.1,
                "ignition_status": "ACC",
                "qr_code": "EEP73110011AP012100066260104DGR087",
                "contactors": {
                    "positive": "closed",
                    "negative": "closed",
                    "precharge": "open",
                    "pos_cycles": 804,
                    "neg_cycles": 804
                }
            },
            "raw_items": []
        }
        self.start_auto_detect_watcher()

    @staticmethod
    def get_available_ports() -> List[Dict[str, str]]:
        """List all available serial COM ports on the system."""
        ports = []
        for p in serial.tools.list_ports.comports():
            desc = p.description or ""
            is_obd_candidate = any(k in desc.lower() for k in [
                "ch340", "ftdi", "cp210", "prolific", "vlinker", "obd", 
                "elm327", "usb serial", "serial port", "stmicroelectronics"
            ])
            ports.append({
                "port": p.device,
                "name": p.device,
                "description": desc,
                "hwid": p.hwid or "",
                "is_candidate": is_obd_candidate
            })
        return ports

    def connect(self, port_name: str, baud_rate: int = 115200) -> bool:
        """Connect to the selected COM port and initialize ELM327 / STN adapter."""
        self.disconnect()
        self.selected_port = port_name
        self.selected_baud = baud_rate

        try:
            logger.info(f"Opening port {port_name} at {baud_rate} baud...")
            self.serial_port = serial.Serial(
                port=port_name,
                baudrate=baud_rate,
                timeout=1.5,
                write_timeout=1.5
            )
            time.sleep(0.5)

            # Send init commands to ELM327/STN
            if not self._init_adapter():
                logger.warning("Adapter initialization had warnings, but port is open.")

            self.is_connected = True
            self.is_simulation = False
            self._notify_status("connected", f"Đã kết nối {port_name} ({baud_rate} bps)")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to {port_name}: {e}")
            self._notify_status("error", f"Lỗi kết nối {port_name}: {e}")
            self.disconnect()
            return False

    def auto_connect_and_scan(self) -> Dict[str, Any]:
        """
        Auto-discovers the connected OBD cable port, tries standard baud rates,
        initializes the UDS communication, and immediately starts live telemetry scanning.
        """
        if self.is_connected and self.is_scanning:
            return {"success": True, "port": self.selected_port, "baud": self.selected_baud, "already_connected": True}

        ports = self.get_available_ports()
        if not ports:
            return {"success": False, "message": "Không tìm thấy cổng COM nào. Vui lòng cắm cáp OBD vào máy tính."}

        # Prioritize candidate devices (FTDI, CH340, CP210x, vLinker, OBD, USB Serial)
        candidates = [p for p in ports if p.get("is_candidate")]
        others = [p for p in ports if not p.get("is_candidate") and "bluetooth" not in p.get("description", "").lower()]
        bt_ports = [p for p in ports if "bluetooth" in p.get("description", "").lower()]

        trial_order = candidates + others + bt_ports
        baud_rates = [115200, 38400, 500000, 2000000, 9600]

        logger.info(f"Auto-connect attempting across {len(trial_order)} ports...")
        for p_info in trial_order:
            port = p_info["port"]
            for baud in baud_rates:
                logger.info(f"Trying auto-connect on {port} @ {baud} bps...")
                try:
                    ser = serial.Serial(port=port, baudrate=baud, timeout=0.8, write_timeout=0.8)
                    time.sleep(0.3)
                    ser.reset_input_buffer()
                    # Test ping
                    ser.write(b"ATZ\r")
                    ser.flush()
                    time.sleep(0.4)
                    resp = ser.read(ser.in_waiting or 0).decode("ascii", errors="ignore")
                    ser.close()

                    if any(kw in resp.upper() for kw in ["ELM", "STN", "OBD", "OK", "?", ">"]):
                        logger.info(f"Found responsive OBD adapter on {port} at {baud} baud! Response: {resp.strip()}")
                        # Successfully identified adapter! Connect full
                        if self.connect(port, baud):
                            self.start_live_scan()
                            return {"success": True, "port": port, "baud": baud, "message": f"Tự động kết nối thành công {port} ({baud} bps) và đang đọc dữ liệu!"}
                except Exception as ex:
                    logger.debug(f"Test port {port} @ {baud} failed: {ex}")
                    continue

        return {"success": False, "message": "Đã thấy cổng COM nhưng chưa nhận phản hồi từ bộ chuyển đổi OBD. Hãy đảm bảo xe đã bật điện (ACC/ON)."}

    def start_auto_detect_watcher(self):
        """
        Background watcher thread that continuously monitors for newly plugged OBD cables.
        As soon as a cable is plugged in, it auto-connects and starts reading without user clicking.
        """
        def _watcher():
            while True:
                if not self.is_connected and not self.is_simulation:
                    ports = self.get_available_ports()
                    candidates = [p for p in ports if p.get("is_candidate")]
                    if candidates:
                        logger.info(f"Plug-and-play watcher detected OBD cable: {candidates[0]['port']}! Auto connecting...")
                        self.auto_connect_and_scan()
                time.sleep(2.5)

        t = threading.Thread(target=_watcher, daemon=True)
        t.start()

    def connect_simulation(self):
        """Enable simulation mode for live testing without car."""
        self.disconnect()
        self.is_connected = True
        self.is_simulation = True
        self.selected_port = "DEMO_SIMULATION"
        self._notify_status("connected", "Đã bật chế độ mô phỏng (Demo Mode)")
        self.start_live_scan()
        return True

    def disconnect(self):
        """Disconnect and stop live scanner."""
        self.stop_live_scan()
        if self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.close()
            except Exception:
                pass
        self.serial_port = None
        self.is_connected = False
        self.is_simulation = False
        self._notify_status("disconnected", "Đã ngắt kết nối")

    def _send_command(self, cmd: str, timeout: float = 1.0) -> str:
        """Send AT or UDS command and read response."""
        if not self.serial_port or not self.serial_port.is_open:
            return ""

        try:
            self.serial_port.reset_input_buffer()
            raw_cmd = (cmd.strip() + "\r").encode("ascii")
            self.serial_port.write(raw_cmd)
            self.serial_port.flush()

            response = ""
            start_time = time.time()
            while (time.time() - start_time) < timeout:
                if self.serial_port.in_waiting:
                    chunk = self.serial_port.read(self.serial_port.in_waiting).decode("ascii", errors="ignore")
                    response += chunk
                    if ">" in response:
                        break
                else:
                    time.sleep(0.02)

            # Strip prompt, echo, and whitespace
            cleaned = response.replace(">", "").replace("\r", " ").replace("\n", " ").strip()
            return cleaned
        except Exception as e:
            logger.error(f"Serial command error ({cmd}): {e}")
            return ""

    def _init_adapter(self) -> bool:
        """Run AT initialization sequence for ISO 15765-4 CAN 11bit 500k."""
        init_commands = [
            ("ATZ", 1.5),     # Reset
            ("ATE0", 0.5),    # Echo off
            ("ATL0", 0.5),    # Linefeeds off
            ("ATS0", 0.5),    # Spaces off
            ("ATH1", 0.5),    # Headers on
            ("ATSP6", 0.5),   # Protocol 6: ISO 15765-4 CAN (11 bit ID, 500 kbaud)
            ("ATCAF1", 0.5),  # CAN Auto Formatting on (handles ISO-TP multi-frame)
            ("ATSH 7E4", 0.5) # Set CAN Header to BMS (0x7E4)
        ]

        for cmd, delay in init_commands:
            resp = self._send_command(cmd, timeout=delay)
            logger.info(f"Init [{cmd}] -> {resp}")
            time.sleep(0.05)
        return True

    def query_did(self, did: str) -> List[Dict[str, Any]]:
        """Query a single DID via UDS Service 0x22."""
        if not self.is_connected or not self.serial_port:
            return []

        # Send UDS Service 0x22 ReadDataByIdentifier
        cmd = f"22 {did}"
        resp = self._send_command(cmd, timeout=1.0)
        logger.debug(f"Query {cmd} -> {resp}")

        # Decode response
        return self.decoder.decode_raw_payload(did, resp)

    def start_live_scan(self):
        """Start background polling thread."""
        if self.is_scanning:
            return

        self.is_scanning = True
        self.stop_event.clear()

        if self.is_simulation:
            self.polling_thread = threading.Thread(target=self._simulation_loop, daemon=True)
        else:
            self.polling_thread = threading.Thread(target=self._live_polling_loop, daemon=True)

        self.polling_thread.start()
        self._notify_status("scanning", "Đang quét dữ liệu thời gian thực...")

    def stop_live_scan(self):
        """Stop background polling thread."""
        self.is_scanning = False
        self.stop_event.set()
        if self.polling_thread and self.polling_thread.is_alive():
            self.polling_thread.join(timeout=1.0)
        self.polling_thread = None

    def _live_polling_loop(self):
        """Continuous live polling loop over OBD serial port."""
        while not self.stop_event.is_set():
            for did in self.POLL_DIDS:
                if self.stop_event.is_set():
                    break
                try:
                    decoded = self.query_did(did)
                    if decoded:
                        self._update_state_from_decoded(did, decoded)
                    time.sleep(0.08)  # Polling throttle
                except Exception as e:
                    logger.error(f"Polling error on DID {did}: {e}")
                    time.sleep(0.2)

            # Trigger UI update callback
            if self.data_callback:
                self.data_callback(self.current_state)

    def _simulation_loop(self):
        """Realistic simulated data stream for offline demonstration."""
        import random
        step = 0
        while not self.stop_event.is_set():
            step += 1
            # Simulate realistic fluctuations
            # Voltage fluctuates slightly around 385.5V
            v_fluct = round(385.5 + random.uniform(-0.4, 0.4), 1)
            # Current fluctuates (e.g. charging or standby)
            c_fluct = round(1.09 + random.uniform(-0.15, 0.25), 2)
            # Coolant temp ~ 34.0°C
            t_in = round(34.0 + random.uniform(-0.3, 0.5), 1)
            t_out = round(34.0 + random.uniform(-0.2, 0.6), 1)
            flow = random.choice([14, 15, 16])
            cell_t_max = round(35.0 + random.uniform(-0.2, 0.3), 1)
            cell_t_min = round(33.0 + random.uniform(-0.2, 0.2), 1)

            # 12V Aux battery
            aux_v = round(13.1 + random.uniform(-0.05, 0.05), 1)

            self.current_state["battery"]["pack_voltage"] = v_fluct
            self.current_state["battery"]["pack_current"] = c_fluct
            self.current_state["battery"]["cell_delta_mv"] = round(random.choice([0.0, 5.0, 10.0]), 1)
            self.current_state["hvac"]["coolant_inlet_temp"] = t_in
            self.current_state["hvac"]["coolant_outlet_temp"] = t_out
            self.current_state["hvac"]["coolant_massflow"] = flow
            self.current_state["hvac"]["cell_temp_max"] = cell_t_max
            self.current_state["hvac"]["cell_temp_min"] = cell_t_min
            self.current_state["vehicle"]["aux_battery_12v"] = aux_v

            # Module voltages slight jitter
            for m in self.current_state["modules"]:
                base = m.get("base_v", m["voltage"])
                m["base_v"] = base
                m["voltage"] = round(base + random.uniform(-0.08, 0.08), 1)

            self.current_state["power_analysis"] = self.analyzer.update(
                voltage=v_fluct, current=c_fluct, speed=0.0, soc=80.0, odo=29988
            )

            if self.data_callback:
                self.data_callback(self.current_state)

            time.sleep(1.0)

    def _update_state_from_decoded(self, did: str, items: List[Dict[str, Any]]):
        """Update cached state with decoded items."""
        for it in items:
            name = it.get("name", "")
            val = it.get("value")
            if val is None:
                continue

            if did == "F027":
                self.current_state["battery"]["soh"] = float(val) if str(val).isdigit() else val
            elif did == "F026":
                self.current_state["battery"]["soc"] = float(val) if str(val).isdigit() else val
            elif did == "F079":
                self.current_state["battery"]["real_soc"] = float(val) if str(val).isdigit() else val
            elif did == "F013":
                self.current_state["battery"]["pack_voltage"] = float(val)
            elif did == "F04B":
                self.current_state["battery"]["pack_current"] = float(val)
            elif did == "F01B":
                self.current_state["battery"]["cell_v_max"] = float(val)
            elif did == "F02E":
                self.current_state["battery"]["cell_v_min"] = float(val)
            elif did == "F01D":
                self.current_state["hvac"]["coolant_inlet_temp"] = float(val)
            elif did == "F035":
                self.current_state["hvac"]["coolant_outlet_temp"] = float(val)
            elif did == "F01C":
                self.current_state["hvac"]["coolant_massflow"] = int(val)
            elif did == "F01E":
                self.current_state["hvac"]["cell_temp_max"] = float(val)
            elif did == "F01F":
                self.current_state["hvac"]["cell_temp_min"] = float(val)
            elif did == "F03D":
                self.current_state["hvac"]["pack_temp_avg"] = float(val)
            elif did == "F121":
                self.current_state["vehicle"]["odometer"] = int(val)
            elif did == "F122":
                self.current_state["vehicle"]["aux_battery_12v"] = float(val)
            elif did == "F123":
                self.current_state["vehicle"]["ignition_status"] = str(val)
            elif did == "F071":
                self.current_state["battery"]["energy_stored_kwh"] = int(val)
            elif did == "F072":
                self.current_state["battery"]["energy_supplied_kwh"] = int(val)
            elif did == "F070":
                self.current_state["vehicle"]["qr_code"] = str(val)

            # Update cell delta
            c_max = self.current_state["battery"]["cell_v_max"]
            c_min = self.current_state["battery"]["cell_v_min"]
            if isinstance(c_max, (int, float)) and isinstance(c_min, (int, float)):
                self.current_state["battery"]["cell_delta_mv"] = round((c_max - c_min) * 1000, 1)

        # Update real-time power and energy drain analysis
        v_val = self.current_state["battery"].get("pack_voltage")
        i_val = self.current_state["battery"].get("pack_current")
        soc_val = self.current_state["battery"].get("soc")
        odo_val = self.current_state["vehicle"].get("odometer")
        self.current_state["power_analysis"] = self.analyzer.update(
            voltage=v_val, current=i_val, speed=None, soc=soc_val, odo=odo_val
        )

    def close(self):
        """Clean shutdown of background threads and serial ports."""
        logger.info("Executing safe shutdown of VinFastOBDReader...")
        self.stop_live_scan()
        if self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.close()
                logger.info("Serial COM port closed cleanly.")
            except Exception as e:
                logger.warning(f"Error closing port: {e}")
        self.serial_port = None
        self.is_connected = False

    def _notify_status(self, status: str, message: str):
        if self.status_callback:
            self.status_callback(status, message)
