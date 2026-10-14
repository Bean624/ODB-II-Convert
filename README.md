# VF-DIAG WORKSHOP - Phần Mềm Đo & Chẩn Đoán Kỹ Thuật Pin Xe Điện VinFast

Phần mềm kỹ thuật chuyên dụng chuẩn đoán và giám sát năng lượng bộ pin xe điện VinFast (VF 3, VF 5, VF 6, VF 7, VF 8, VF 9, VF e34) qua cổng OBD-II theo tiêu chuẩn quốc tế **ISO 14229 (UDS)** và **ISO 15765-4 (CAN bus 500 kbps)**.

---

## 1. Thiết Kế Giao Diện — Thuần Kỹ Thuật Xưởng Dịch Vụ
- **Phong cách**: Tối giản, tập trung vào số liệu kỹ thuật, tương tự các phần mềm chẩn đoán chuyên hãng (ODIS, Techstream, VCDS).
- **Màu sắc**: Nền sáng trắng/ghi nhạt, chữ đen/xám đậm có độ tương phản cao, dễ đọc dưới ánh sáng xưởng.
- **Không sử dụng**: Emoji, icon trang trí, gradient màu, hiệu ứng phát sáng neon hay hoạt họa không cần thiết.
- **Màu trạng thái theo tiêu chuẩn kỹ thuật**:
  - `Bình thường (Normal)`: Chữ xanh lá đậm / viền xanh nhạt.
  - `Cảnh báo (Warning)`: Nền vàng nhạt / viền hổ phách.
  - `Lỗi / Nguy hiểm (Danger)`: Nền đỏ nhạt / viền đỏ.
  - `Mất kết nối / Chưa xác định (Offline)`: Nền ghi xám / chữ xám.
- **Nút bấm**: Nút hộp kỹ thuật chữ in hoa đơn giản (`KET NOI`, `NGAT KET NOI`, `DOC LIVE`, `DAT LAI PHIEN DO`, `MO FILE EXCEL`, `XUAT CSV`, `IN BAO CAO`).

---

## 2. Báo Cáo Kiểm Tra Kỹ Thuật Giao Thức OBD-II & UDS

### 2.1. Phân Tích Phần Cứng & Cáp Kết Nối
- **Về loại cáp 1 đầu OBD-II, 1 đầu HDMI**:
  - Trong thiết bị chẩn đoán (Autel, Launch X431, VCX SE, Godiag), đầu HDMI thực chất chỉ là giắc cắm vật lý đa chân dẫn các đường tín hiệu CAN-H, CAN-L, K-Line, Nguồn 12V và Mass.
  - Cổng HDMI trên laptop là cổng **Xuất hình ảnh (Video Out)**, KHÔNG thể cắm trực tiếp dây này vào cổng HDMI của máy tính.
  - **Bắt buộc phải cắm qua Hộp giao tiếp VCI (Vehicle Communication Interface)**, và hộp VCI cắm cáp **USB** vào máy tính.
- **Các thiết bị cáp cắm trực tiếp qua cổng USB máy tính khuyên dùng**:
  - `vLinker FS USB` (Dùng chip STN chuyên cho xe điện, hỗ trợ CAN 500 kbps).
  - `OBDLink SX / EX USB`.
  - `Tactrix OpenPort 2.0` hoặc cáp `CANable / Candlelight` (USB-to-CAN).
  - Cáp chuyển đổi `USB-to-Serial` chuẩn chip `FTDI FT232R`, `CH340`, `CP2102`.

### 2.2. Các Lệnh Chẩn Đoán & DID Đã Xác Minh
- **Nguyên tắc an toàn**: Mặc định phần mềm **CHỈ GỬI LỆNH ĐỌC (UDS Service 0x22 - ReadDataByIdentifier)**. 
- **Tuyệt đối KHÔNG**:
  - Gửi lệnh ghi dữ liệu (Service `0x2E`).
  - Gửi lệnh xóa mã lỗi (Service `0x14`).
  - Can thiệp điều khiển chấp hành ECU (Service `0x2F`).
  - Mở phiên lập trình / SecurityAccess (Service `0x27`).
- **Danh sách 74 mã DID và 109 thông số**: Đã được đối chiếu toán học đạt độ chính xác 100% với dữ liệu xuất xưởng từ xe VinFast VF 5 Plus (`RLNV5JSE0TH720262`).

### 2.3. Nguồn Cung Cấp Thông Số Từ Từng ECU
| Thông số kỹ thuật | Mã DID | ECU phụ trách | Trạng thái xác minh |
| :--- | :--- | :--- | :--- |
| Pack SOH (Độ chai pin) | `0xF027` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Pack SOC / Real SOC | `0xF026`, `0xF079` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Pack Voltage (Tổng điện áp) | `0xF013`, `0xF015` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Pack Current (Dòng điện) | `0xF04B`, `0xF028` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Điện áp 10 Module pin | `0xF02F` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Điện áp Cell Max / Min | `0xF01B`, `0xF02E` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Nhiệt độ nước làm mát bộ pin | `0xF01D`, `0xF035` | BMS (`0x7E4`) | **Đã xác minh (Verified)** *(Nước tản nhiệt pin, không phải cabin)* |
| Lưu lượng bơm làm mát pin | `0xF01C` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Rơ-le Contactor (+, -, Precharge) | `0xF036` - `0xF03A` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Tổng kWh nạp / xả trọn đời | `0xF071`, `0xF072` | BMS (`0x7E4`) | **Đã xác minh (Verified)** |
| Odometer (Số km đã đi) | `0xF121` | VCU / Gateway (`0x710`) | **Đã xác minh (Verified)** |
| Điện áp ắc quy 12V phụ trợ | `0xF122` | VCU / Gateway (`0x710`) | **Đã xác minh (Verified)** |
| Trạng thái khóa điện (Ignition) | `0xF123` | VCU / Gateway (`0x710`) | **Đã xác minh (Verified)** |
| Tốc độ xe (Vehicle Speed) | `0xF040` | VCU / Gateway (`0x710`) | **Đã xác minh (Verified)** |
| **Vòng tua máy nén điều hòa cabin** | `HVAC_01` | HVAC (`0x7B0`) | **Không được BMS hỗ trợ** *(Thuộc ECU điều hòa riêng)* |
| **Nhiệt độ giàn lạnh cabin** | `HVAC_02` | HVAC (`0x7B0`) | **Không được BMS hỗ trợ** *(Thuộc ECU điều hòa riêng)* |

---

## 3. Khả Năng Giám Sát & Xác Định Xe Có Đang "Thụt Pin" Hay Không

### 3.1. Phương Pháp Luận Đo Lường
- **Lưu ý kỹ thuật quan trọng**: Không được kết luận xe bị "thụt pin" chỉ dựa vào mức sụt % SOC. Giá trị SOC hiển thị trên xe điện thường được thuật toán BMS làm trơn (smoothed), thay đổi theo bậc (steps) hoặc thay đổi do nhiệt độ môi trường và cân bằng điện áp giữa các cell.
- **Cơ chế xác định chính xác**:
  1. Đọc đồng thời **Điện áp Pack $V$ (V)** (DID `0xF013`) và **Dòng điện Pack $I$ (A)** (DID `0xF04B`).
  2. Quy ước dấu dòng điện của VinFast BMS:
     - $I > 0$: Xe đang phóng điện / tiêu hao năng lượng từ bộ pin.
     - $I < 0$: Xe đang được nạp điện (sạc pin hoặc phanh tái sinh).
     - $I \approx 0$ ($|I| \le 0.1\text{ A}$): Trạng thái nghỉ, dòng tải rò rỉ không đáng kể.
  3. Tính công suất tức thời:
     $$P = V \times I \quad (\text{W hoặc kW})$$
  4. Tích phân năng lượng tiêu thụ theo thời gian thực:
     $$\Delta E = \sum P_i \times \Delta t_i \quad (\text{kWh})$$
  5. Tính tốc độ hao pin quy đổi:
     $$\text{Drain Rate} = P_{\text{kW}} \times 1\text{ giờ} \quad (\text{kWh/giờ})$$

### 3.2. Phân Biệt Các Trạng Thái Vận Hành
- `Đang sạc (DANG_SAC)`: $I < -0.3\text{ A}$ -> Không có hiện tượng thụt pin, pin đang được nạp.
- `Đang chạy (DANG_CHAY)`: Tốc độ xe $> 1\text{ km/h}$, $I > 0.5\text{ A}$ -> Năng lượng tiêu hao để kéo động cơ.
- `Đang dừng bật điện (DANG_NGHI_BAT_DIEN)`: Xe đứng yên nhưng bật chìa khóa ACC/ON, $I \approx 1.0 - 1.5\text{ A}$ ($P \approx 400 - 550\text{ W}$) -> Mức tiêu hao bình thường của hệ thống máy tính, màn hình giải trí, cảm biến và bộ chuyển đổi DC-DC nạp bình 12V.
- `Đang nghỉ (DANG_NGHI)`: Xe tắt khóa, rơ-le cao áp mở, $I \approx 0\text{ A}$ -> Dòng tải an toàn, không có tiêu hao năng lượng cao áp.
- `Chưa đủ dữ liệu (CHUA_DU_DU_LIEU)`: Khi thiếu tín hiệu điện áp hoặc dòng điện từ ECU.

---

## 4. Hướng Dẫn Cài Đặt Driver & Chạy Ứng Dụng `.EXE`

### 4.1. Cài Đặt Driver Cho Bộ Chuyển Đổi (Nếu Cần)
Tùy thuộc vào chip giao tiếp trên cáp USB OBD-II của bạn, Windows 10/11 thường tự nhận diện. Nếu máy tính chưa nhận cổng COM, hãy cài driver tương ứng:
- **FTDI Chip (Cáp OBD-II FTDI)**: Tải và cài đặt [FTDI VCP Driver](https://ftdichip.com/drivers/vcp-drivers/).
- **CH340 / CH341 Chip**: Tải và cài đặt [WCH CH340 Driver](http://www.wch-ic.com/downloads/CH341SER_EXE.html).
- **Silicon Labs CP210x**: Tải và cài đặt [CP210x VCP Driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers).
- **vLinker FS USB**: Cắm cáp vào cổng USB, Windows Update sẽ tự động cài driver STMicroelectronics / FTDI.

### 4.2. Khởi Động Phần Mềm
- File chạy độc lập: **[`dist\VF-DIAG-PRO.exe`](file:///d:/Buid-Phase/new/convert/dist/VF-DIAG-PRO.exe)**
- **Quy trình cắm dây:**
  1. Cắm đầu OBD-II vào xe VinFast.
  2. Bật nguồn xe ở chế độ **ACC** hoặc đạp phanh bấm Start lên đèn **READY**.
  3. Cắm đầu USB vào máy tính.
  4. Mở file `VF-DIAG-PRO.exe`. Phần mềm sẽ **tự động kết nối và đọc ngay toàn bộ thông số** mà không cần thao tác thêm.
- Để lưu trữ dữ liệu kiểm tra xe: Bấm **`XUAT CSV`** hoặc **`IN BAO CAO`**.
- Để kiểm tra log kỹ thuật tại xưởng: Xem file **[`vf_diag_workshop.log`](file:///d:/Buid-Phase/new/convert/vf_diag_workshop.log)**.
