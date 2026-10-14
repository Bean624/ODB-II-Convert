"""
Battery Power Consumption & Energy Drain Analysis Engine
Tracks V, I, P = V*I, integrates energy over time, and analyzes
vehicle power draw without relying solely on smoothed SOC percentages.
"""

import time
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("BatteryAnalyzer")

class BatteryAnalyzer:
    def __init__(self):
        self.reset_session()

    def reset_session(self):
        """Reset the live monitoring session."""
        self.start_time: float = time.time()
        self.last_update_time: float = self.start_time
        self.sample_count: int = 0

        self.last_voltage: Optional[float] = None
        self.last_current: Optional[float] = None
        self.last_speed: Optional[float] = None

        self.initial_soc: Optional[float] = None
        self.current_soc: Optional[float] = None
        self.initial_odo: Optional[float] = None
        self.current_odo: Optional[float] = None

        # Cumulative energy integration in Watt-seconds (Joules)
        self.total_discharge_ws: float = 0.0
        self.total_charge_ws: float = 0.0

    def update(self, voltage: Optional[float], current: Optional[float], 
               speed: Optional[float] = None, soc: Optional[float] = None, 
               odo: Optional[float] = None) -> Dict[str, Any]:
        """
        Process a new telemetry sample and update energy integration.
        Sign convention (VinFast BMS):
        - Current > 0: Discharge / Power consumption from battery
        - Current < 0: Charge / Power fed into battery
        """
        now = time.time()
        dt = max(0.0, now - self.last_update_time)
        self.last_update_time = now

        # Record initial markers
        if self.initial_soc is None and soc is not None:
            self.initial_soc = float(soc)
        if soc is not None:
            self.current_soc = float(soc)

        if self.initial_odo is None and odo is not None:
            self.initial_odo = float(odo)
        if odo is not None:
            self.current_odo = float(odo)

        if voltage is not None:
            self.last_voltage = float(voltage)
        if current is not None:
            self.last_current = float(current)
        if speed is not None:
            self.last_speed = float(speed)

        # Check data sufficiency
        has_v = self.last_voltage is not None and self.last_voltage > 10.0
        has_i = self.last_current is not None

        if not has_v or not has_i:
            return self._build_result(state="CHUA_DU_DU_LIEU", power_w=0.0)

        self.sample_count += 1
        # Instantaneous Power: P = V * I (Watts)
        # Positive = Discharging (Power consumed)
        # Negative = Charging (Power supplied)
        power_w = self.last_voltage * self.last_current

        # Energy integration (trapezoidal rule or rectangular)
        # Avoid integration during long pauses (> 10s)
        if 0.0 < dt < 10.0:
            if power_w > 0:
                self.total_discharge_ws += power_w * dt
            else:
                self.total_charge_ws += abs(power_w) * dt

        # Determine Operating State
        spd = self.last_speed if self.last_speed is not None else 0.0
        i_val = self.last_current

        if i_val < -0.3:
            operating_state = "DANG_SAC" # Charging
            state_text = "Dang sac / Tai sinh nang luong"
        elif spd > 1.0 and i_val > 0.5:
            operating_state = "DANG_CHAY" # Driving
            state_text = "Xe dang chay (Phat luc dong co)"
        elif spd <= 1.0 and i_val > 0.1:
            operating_state = "DANG_NGHI_BAT_DIEN" # Idle with ignition ON
            state_text = "Xe dung bat dien (Tieu thu phu tai / DC-DC)"
        elif abs(i_val) <= 0.1:
            operating_state = "DANG_NGHI" # Standby
            state_text = "Xe nghi / Standby (Dong tai xap xi 0)"
        else:
            operating_state = "CHUA_XAC_DINH"
            state_text = "Chua xac dinh trang thai"

        return self._build_result(state=operating_state, state_text=state_text, power_w=power_w)

    def _build_result(self, state: str, state_text: str = "Chua du du lieu do", power_w: float = 0.0) -> Dict[str, Any]:
        elapsed = max(0.0, time.time() - self.start_time)

        discharge_kwh = self.total_discharge_ws / 3600000.0
        charge_kwh = self.total_charge_ws / 3600000.0
        net_energy_kwh = discharge_kwh - charge_kwh

        # Drain rate per hour at current instantaneous power
        drain_rate_w = power_w if power_w > 0 else 0.0
        drain_per_hour_kwh = round((drain_rate_w / 1000.0), 3)

        # Distance driven in session
        dist_km = 0.0
        if self.current_odo is not None and self.initial_odo is not None:
            dist_km = max(0.0, self.current_odo - self.initial_odo)

        wh_per_km = None
        if dist_km > 0.1 and discharge_kwh > 0.001:
            wh_per_km = round((discharge_kwh * 1000.0) / dist_km, 1)

        # SOC drop
        soc_drop = 0.0
        if self.initial_soc is not None and self.current_soc is not None:
            soc_drop = round(self.initial_soc - self.current_soc, 2)

        # Technical assessment of battery drain
        if state == "CHUA_DU_DU_LIEU":
            assessment = "Chua nhan duoc dong thoi dien ap (V) va dong dien (A) tu ECU BMS de xac dinh cong suat tieu thu."
        elif state == "DANG_SAC":
            assessment = f"Khong co hien tuong thut pin. Bo pin dang duoc nap dien o cong suat {abs(round(power_w/1000.0, 2))} kW."
        elif state == "DANG_NGHI":
            assessment = "Bo pin o trang thai on dinh, dong dien tai xap xi 0 A (khong ghi nhan tieu hao dien nang bat thuong)."
        elif state == "DANG_NGHI_BAT_DIEN":
            assessment = f"Xe dang dung bat dien, dong dien tieu thu {self.last_current:.2f} A (cong suat {drain_rate_w:.1f} W). " \
                         f"Tieu hao uoc tinh {drain_per_hour_kwh} kWh/gio do he thong man hinh, ECU va DC-DC 12V."
        elif state == "DANG_CHAY":
            assessment = f"Dong dien tieu thu van hanh: {self.last_current:.2f} A, cong suat dong co tuc thoi: {power_w/1000.0:.2f} kW."
        else:
            assessment = "Trang thai hoat dong chua xac dinh ro rang."

        return {
            "is_valid": self.last_voltage is not None and self.last_current is not None,
            "operating_state": state,
            "operating_state_text": state_text,
            "instantaneous_power_w": round(power_w, 1),
            "instantaneous_power_kw": round(power_w / 1000.0, 3),
            "pack_voltage_v": self.last_voltage,
            "pack_current_a": self.last_current,
            "current_sign_rule": "+: Xa dien (Tieu thu) | -: Nap dien (Sac / Tai sinh)",
            "drain_rate_w": round(drain_rate_w, 1),
            "drain_per_hour_kwh": drain_per_hour_kwh,
            "session_elapsed_seconds": int(elapsed),
            "session_sample_count": self.sample_count,
            "cumulative_discharge_kwh": round(discharge_kwh, 4),
            "cumulative_charge_kwh": round(charge_kwh, 4),
            "net_energy_kwh": round(net_energy_kwh, 4),
            "distance_km": round(dist_km, 2),
            "consumption_wh_per_km": wh_per_km,
            "soc_initial": self.initial_soc,
            "soc_current": self.current_soc,
            "soc_drop_pct": soc_drop,
            "technical_assessment": assessment
        }
