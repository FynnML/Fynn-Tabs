# Fynn Tabs

Extension Chromium (Chrome, Brave, Edge…) giúp quản lý **tab**, **session** và **workspace**. Chạy độc lập, dữ liệu nằm hoàn toàn trên máy bạn.

> Phiên bản hiện tại: **0.1.0** (bản đầu tiên, chưa phát hành trên Chrome Web Store).

## Tính năng

- **Popup nhanh:** tìm tab đang mở, chuyển tab, đóng tab chỉ với một cú bấm.
- **Session:** lưu ảnh chụp (snapshot) các tab của cửa sổ hiện tại, khôi phục vào cửa sổ mới khi cần.
- **Workspace:** bộ URL có tên mà bạn chỉnh sửa và dùng lại nhiều lần (thêm, xoá, sắp xếp thứ tự bằng nút ↑ ↓, đổi tên).
- **Trang quản lý:** xem và chỉnh sửa toàn bộ session/workspace, tìm kiếm theo tên, tiêu đề hoặc URL.
- **Chuyển đổi:** biến một session thành workspace chỉ với một nút.
- **Sao lưu:** xuất toàn bộ dữ liệu ra file JSON và nhập lại (gộp vào dữ liệu hiện có, không ghi đè).

## Cài đặt (chế độ nhà phát triển)

1. Tải hoặc clone repo này về máy.
2. Mở `chrome://extensions` (hoặc `brave://extensions`, `edge://extensions`).
3. Bật **Developer mode**.
4. Bấm **Load unpacked** và chọn thư mục gốc của repo (thư mục chứa `manifest.json`).
5. Ghim Fynn Tabs lên thanh công cụ rồi bấm vào biểu tượng để mở popup.

Sau khi sửa code, bấm nút **Reload** của extension trong trang extensions để áp dụng.

## Cách dùng nhanh

- **Lưu session:** mở popup → (tuỳ chọn) nhập tên → **Lưu** ở mục Session.
- **Tạo workspace từ các tab đang mở:** mở popup → nhập tên → **Lưu** ở mục Workspace.
- **Mở trang quản lý:** bấm **Mở trình quản lý** trong popup.
- **Sao lưu / chuyển máy:** trang quản lý → **Xuất JSON** để tải file, **Nhập JSON** để nạp lại.

## Quyền riêng tư và quyền truy cập

| Quyền | Dùng để làm gì |
|---|---|
| `tabs` | Đọc tiêu đề và URL của các tab để hiển thị, tìm kiếm, lưu session/workspace; chuyển, đóng và mở tab. |
| `storage` | Lưu session và workspace vào `chrome.storage.local` trên máy bạn. |
| `favicon` | Hiển thị biểu tượng trang web (favicon) thông qua cơ chế nội bộ của Chromium (`_favicon`) hoàn toàn cục bộ, yêu cầu Chromium 104+. |

- Extension **không truyền dữ liệu ra ngoài**, không có máy chủ backend, không thu thập thống kê hay nhật ký sử dụng.
- Fynn Tabs không truyền dữ liệu session/workspace hay URL tab đến dịch vụ favicon của bên thứ ba (như Google Favicon API); biểu tượng trang web được truy vấn cục bộ qua endpoint nội bộ của trình duyệt Chromium.
- Chỉ các URL `http://` và `https://` được lưu. Trang nội bộ của trình duyệt (như `chrome://`) bị bỏ qua.
- File JSON xuất ra chứa danh sách URL bạn đã lưu, hãy cất giữ cẩn thận và đừng commit lên repo công khai.

## Cấu trúc dự án

```
├── manifest.json              # Manifest V3 (yêu cầu Chromium 104+)
└── src/
    ├── background/
    │   └── service-worker.js  # Khởi tạo dữ liệu khi cài đặt
    ├── shared/
    │   ├── storage.js         # Lưu trữ, hàng đợi ghi tuần tự + schema có version
    │   ├── sessions.js        # Logic session + khôi phục tab ghim (pinned)
    │   ├── workspaces.js      # Logic workspace
    │   ├── backup.js          # Xuất/nhập JSON (giới hạn 5 MiB)
    │   ├── ui.js              # Tiện ích giao diện & hộp thoại xác nhận dùng chung
    │   └── ui.css             # Giao diện dùng chung
    ├── popup/                 # Cửa sổ popup
    └── manager/               # Trang quản lý đầy đủ
```

Dự án không cần bước build: chỉ gồm HTML, CSS và JavaScript thuần (ES modules).

## Giới hạn đã biết

- Chưa có icon thanh công cụ (toolbar raster icons) cho extension.
- Dữ liệu nằm trong `chrome.storage.local` (giới hạn khoảng 10 MB). Người dùng thông thường khó chạm trần, nhưng lưu rất nhiều session thì có thể.
- Chưa có bộ test tự động tích hợp CI trong repo.
- Chưa có tích hợp với Fynn New Tab (Quick Panel).

## Hướng phát triển

- Tích hợp Quick Panel với Fynn New Tab thông qua giao thức nhắn tin giữa hai extension.
- Icon raster đa độ phân giải, ảnh chụp màn hình và chính sách quyền riêng tư để đưa lên Chrome Web Store.

## Giấy phép

[MIT](LICENSE)