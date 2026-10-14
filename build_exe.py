"""
Build Script for VinFast OBD-II Diagnostic Tool (.exe)
Compiles Python application into a standalone Windows Executable using PyInstaller.
"""

import os
import subprocess
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def build():
    print("=" * 60)
    print("Building VF-DIAG PRO Standalone Windows Executable...")
    print("=" * 60)

    static_path = os.path.join(BASE_DIR, "static")
    did_db_path = os.path.join(BASE_DIR, "did_database.json")
    sample_path = os.path.join(BASE_DIR, "RLNV5JSE0TH720262_BMS_DataFlow_Report_20261013_161604.xlsx")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=VF-DIAG-PRO",
        "--onefile", # Single standalone .exe file
        "--windowed", # Clean GUI window
        f"--add-data={static_path};static",
        f"--add-data={did_db_path};.",
        f"--add-data={sample_path};.",
        "--hidden-import=serial",
        "--hidden-import=serial.tools.list_ports",
        "--hidden-import=openpyxl",
        "--hidden-import=webview",
        "--hidden-import=clr_loader",
        "--hidden-import=pythonnet",
        "--hidden-import=battery_analyzer",
        "--noconfirm",
        os.path.join(BASE_DIR, "app.py")
    ]

    print("Running command:", " ".join(cmd))
    res = subprocess.run(cmd, cwd=BASE_DIR)
    if res.returncode == 0:
        exe_path = os.path.join(BASE_DIR, 'dist', 'VF-DIAG-PRO.exe')
        print("\n" + "=" * 60)
        print("BUILD SUCCESSFUL!")
        print(f"Single Standalone Executable: {exe_path}")
        print("=" * 60)
    else:
        print(f"\nBuild failed with exit code {res.returncode}")

if __name__ == "__main__":
    build()
