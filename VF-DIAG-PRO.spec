# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:/Buid-Phase/new/convert/app.py'],
    pathex=[],
    binaries=[],
    datas=[('D:/Buid-Phase/new/convert/static', 'static'), ('D:/Buid-Phase/new/convert/did_database.json', '.'), ('D:/Buid-Phase/new/convert/RLNV5JSE0TH720262_BMS_DataFlow_Report_20261013_161604.xlsx', '.')],
    hiddenimports=['serial', 'serial.tools.list_ports', 'openpyxl', 'webview', 'clr_loader', 'pythonnet', 'battery_analyzer'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='VF-DIAG-PRO',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
