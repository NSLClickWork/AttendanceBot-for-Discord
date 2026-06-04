# 📖 USER GUIDE - IT ATTENDANCE & PAYSLIP DISCORD BOT

Welcome to the **IT Attendance & Payslip Bot** on Discord! This is a self-service system that empowers employees to manage their attendance log, report overtime, register weekly schedules, and generate professional payslip PDFs with a personalized banking QR code integrated.

This guide will walk you through all the features from basic to advanced in the most simple and clear way.

---

## 📌 SECTION 1: ACCOUNT REGISTRATION (ADD EMPLOYEE)
Before using any attendance or payslip features, every new employee must register their profile and get approved by their Manager.

### 🛠️ Steps to Register:
1. Go to any Discord channel where the Bot is active, and type the command `/panel` (or `/home`) to open your personal dashboard.
2. Click the **`Add employee`** button on the dashboard.
3. Fill in your information in the pop-up Form:
   *   **Full name**: Your complete name (e.g., `Nguyen Van A`).
   *   **Email**: Your working email address.
   *   **Team**: The name of your team/department (e.g., `IT`, `Marketing`).
   *   **Manager**: **Crucial!** You must paste the **Discord User ID (numeric sequence)** of your direct manager (e.g., `748166123052073152`). Do not type their username or handle (e.g., do not type `swth3art_`).
4. Click **`Submit`**.

> **IMPORTANT NOTICE:**
> *   After submission, the Bot will automatically send a direct message (DM) to your Manager with an **`Approve`** button.
> *   Once your Manager approves your request, the Bot will send you a DM notification confirming that your account has been successfully activated!

---

## 🕒 SECTION 2: DAILY ATTENDANCE (CHECK IN / CHECK OUT)
The attendance logging feature records your actual working hours.

### 📥 1. Start Working (Check In)
1. Type the `/panel` command in any active channel (or send it as a DM to the Bot).
2. Click the **`Check in`** button.
3. The Bot will reply: *"Checked in at [Time]"* and your personal dashboard status will update to display your current active working session.

### 📤 2. Stop Working (Check Out)
1. Type `/panel` to open your personal dashboard.
2. Click the **`Check out`** button.
3. The Bot will automatically end your shift, calculate your total duration in minutes, and save it securely to the database.

### 🚨 3. Smart Reminders
*   **Long Shift Warning (4 Hours)**: If you work continuously for more than 4 hours without checking out, the Bot will send you a friendly DM reminder.
*   **Quick Responses**: You can choose to click **`Check out`** directly on that reminder message, or click **`Continue working`** to keep working (the Bot will remind you again in 2 hours).

---

## 📈 SECTION 3: OVERTIME REPORTING (REPORT OT)
If your shift has overtime hours outside standard working hours, you can submit an OT report to get paid.

### 🛠️ Steps to Report OT:
1. Click the **`Report OT`** button on your `/panel` dashboard.
2. Fill in the Form:
   *   **Start time**: The start time of your overtime, format: `YYYY-MM-DD HH:MM` (e.g., `2026-06-02 19:00`).
   *   **End time**: The end time of your overtime (e.g., `2026-06-02 21:00`).
   *   **OT Reason**: Detailed reason for the overtime (e.g., *"Fixing database server migration bug"*).
3. Click **`Submit`**.

> **OVERTIME APPROVAL FLOW:**
> 1. Your Direct Manager receives a DM with the request and clicks **`Manager approve`**.
> 2. The Boss receives the final request and clicks **`Boss approve`** $\rightarrow$ only then will your overtime hours be officially logged and calculated into your salary.

---

## 📅 SECTION 4: WEEKLY SCHEDULE SUBMISSION
This feature allows employees to register their available/unavailable times for the upcoming week so the company can coordinate shifts.

### 🛠️ Steps to Submit:
1. Click the **`Submit weekly schedule`** button on your `/panel` dashboard.
2. Fill in the Form:
   *   **Week start**: The starting Monday date of the upcoming week, format: `YYYY-MM-DD` (e.g., `2026-06-08`). The Bot automatically prefills this with next Monday's date for your convenience.
   *   **Available slots**: The time windows you are AVAILABLE to work (one slot per line), for example:
       ```text
       2026-06-08 09:00-13:00
       2026-06-09 14:00-18:00
       ```
   *   **Unavailable slots**: The time windows you are BUSY and cannot work (same format as above).
   *   **Notes**: Add any additional notes if necessary.
3. Click **`Submit`**.

> **PRO TIP:**
> If you want to delete your submitted schedule to submit a new one, open `/panel`, click **`Delete Schedule`**, and select the week you want to delete.

---

## 🗓️ SECTION 5: GOOGLE CALENDAR SYNC
This feature lets you synchronize your **submitted upcoming weekly schedules** to the company's shared Google Calendar so that your manager can easily see who will be working and at what time next week.

*   **How to use**: Open `/panel` $\rightarrow$ Click the **`Sync Calendar`** button.
*   The Bot will instantly create calendar events for all your available slots in the upcoming week.

---

## 💶 SECTION 6: SELF-SERVICE PAYSLIP GENERATION (WITH QR CODE)
At the end of the month, you can generate your own professional PDF payslip and automatically embed your banking QR code so the company can pay you instantly.

### 🛠️ Step-by-Step Online Stream Flow (100% In-Memory & Secure):
1. Prepare your **banking QR Code image** on your computer or phone.
2. In any channel where the Bot is active, type:
   `/payslip`
3. A Discord **`qr`** attachment slot will appear $\rightarrow$ drag-and-drop or select your banking QR Code image to upload it.
   *(Note: You can upload a full screenshot of your banking app. The bot will automatically detect and crop the QR code for you!)*
4. Press **Enter** to submit the command. A modal form will pop up:
   *   **profile**: Enter your profile details separated by a pipe `|` character: `Full Name | Position | Company Name` (e.g., `Nguyen Van A|Developer|NSL Click & Work UG`).
   *   **period**: Enter the period and base salary: `Year|Month|Base Salary (EUR)` (e.g., `2026|5|1500`).
   *   **work**: Configure your working schedule to compute standard hours: `Full-time days|Full-time start|Part-time days|Part-time start` (e.g., `0,1,2,3,4|08:30|5|08:30` meaning Mon-Fri Full-time starting at 08:30, Sat Part-time starting at 08:30).
   *   **ot**: Enter any overtime details if applicable: `OT Day|OT Hours|OT Multiplier` (e.g., `9|4|1.5` meaning OT on the 9th day for 4 hours at a 1.5x multiplier).
   *   **bank**: Enter your receiving banking details: `Beneficiary Name|Bank Name|Account Number` (e.g., `NGUYEN VAN A|MB Bank|779767899999`).
5. Click **`Submit`**.

> **SECURITY & PRIVACY TIPS:**
> *   The Bot processes everything purely in RAM (In-Memory Stream). It automatically loads the QR image, builds the PDF, and sends the final document directly to your channel.
> *   Your payslip PDF will arrive in the channel in just 3 seconds! 
> *   Neither your uploaded QR image nor the generated PDF are saved onto the server's hard disk, ensuring **100% data privacy and security**!

---

Enjoy your seamless working and logging experience with the **IT Attendance Bot**! 🚀
