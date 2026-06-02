# Hướng Dẫn Tích Hợp Bot Điểm Danh (IT Attendance Bot) Vào Slack

Chào bạn! Dưới đây là hướng dẫn từ A-Z để cài đặt và thêm Bot điểm danh vào Workspace Slack của bạn.

## 1. Tạo Ứng Dụng (Slack App)

1. Truy cập [Slack API: Applications](https://api.slack.com/apps).
2. Chọn **Create New App** > **From scratch**.
3. Đặt tên là `IT Attendance Bot` và chọn Workspace Slack của công ty bạn.

## 2. Cấp Quyền & Kích Hoạt Tính Năng

Vào trang cấu hình của app vừa tạo, hãy thực hiện các bước sau:

### 2.1 Bật Socket Mode
- Chuyển đến mục **Socket Mode** (menu bên trái) và gạt công tắc bật lên.
- Slack sẽ yêu cầu tạo **App-Level Token**. Hãy tạo một token có tên `socket-token` và cấp scope `connections:write`.
- Lưu lại token bắt đầu bằng `xapp-` (Đây là `SLACK_APP_TOKEN` để cấu hình file `.env`).

### 2.2 Cấp quyền Bot Scopes
- Vào **OAuth & Permissions**.
- Kéo xuống phần **Scopes** > **Bot Token Scopes**, thêm các quyền sau:
  - `app_mentions:read`: Để bot đọc lệnh khi bị tag (@attendencebot).
  - `chat:write`: Gửi tin nhắn.
  - `commands`: Thêm Slash Commands.
  - `files:write`: Upload file báo cáo CSV.
  - `im:history`: Đọc lịch sử tin nhắn trong Chat Assistant.
  - `im:write`: Gửi tin nhắn 1-1 (DM).
  - `users:read`: Đọc thông tin user.

### 2.3 Bật Event Subscriptions
- Vào **Event Subscriptions** > bật **Enable Events**.
- Đăng ký 3 event (Subscribe to bot events):
  - `app_home_opened`: Mở Home Tab.
  - `app_mention`: Kích hoạt khi bị tag.
  - `message.im`: Kích hoạt khi chat trực tiếp với bot.

### 2.4 Bật Interactivity
- Vào **Interactivity & Shortcuts** > bật **Interactivity**.

### 2.5 Tạo Slash Commands
- Vào **Slash Commands** và tạo 2 lệnh mới:
  - `/schedule-draft`: Tạo lịch nháp hàng tuần.
  - `/attendance-export`: Xuất báo cáo điểm danh CSV.

## 3. Cài Đặt App Vào Workspace

1. Vào **Install App** (menu bên trái) > Chọn **Install to Workspace** và **Allow**.
2. Sau khi cài đặt, bạn sẽ nhận được **Bot User OAuth Token** bắt đầu bằng `xoxb-`. Lưu nó lại làm biến `SLACK_BOT_TOKEN`.
3. Trong menu **Basic Information**, lấy **Signing Secret**. Lưu nó lại làm biến `SLACK_SIGNING_SECRET`.

## 4. Cách Thêm Bot Vào Channel

Để bot có thể đọc tin nhắn hoặc gửi lịch nhắc nhở vào channel chung của phòng IT hoặc Manager:

1. Mở Slack, vào channel cần thêm bot (VD: `#it-team`).
2. Gõ câu lệnh: `/invite @attendencebot` (hoặc tên bot bạn đã đặt).
3. Ấn Enter. Bot đã chính thức nằm trong channel và sẵn sàng lắng nghe câu lệnh.

> **Lưu ý:** Bot cần được đưa vào các kênh cấu hình như `IT_CHANNEL_ID` (kênh chung) và `MANAGER_APPROVAL_CHANNEL_ID` (kênh dành cho quản lý duyệt) để gửi đúng thông báo. Để lấy ID của kênh, bạn click chuột phải vào tên kênh ở thanh menu > **View channel details** > kéo xuống dưới cùng lấy **Channel ID** (dạng `C12345678`).

---
🎉 **Thế là xong!** Bạn chỉ cần update các biến đã lưu vào file `.env` và chạy server là bot sẽ hoạt động!
