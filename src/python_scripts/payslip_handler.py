"""
payslip_handler.py
------------------------

Cách cắm vào bot có sẵn:
    from bot_payslip_handler import register_payslip

Sau đó trong bot:
    @bot payslip                       -> bot mở form (modal) để điền
    @bot payslip Le Trung Tin 18tr     -> (tùy chọn) parse nhanh, vẫn mở form để xác nhận

Bot sẽ trả file PDF ngay trong kênh/DR nơi được gọi.

Phụ thuộc:
File cần: nsl_logo.png (cùng thư mục), payslip_core.py (cùng thư mục)
"""

import json
import calendar
from datetime import date
from payslip_core import (generate_payslip, standard_hours, hourly_rate,
                          overtime_pay, fmt_vnd, build_schedule_may_like)


# ---------------------------------------------------------------
#  Tính toán từ input gọn của người dùng -> data đầy đủ cho PDF
# ---------------------------------------------------------------
def compute_payslip_data(form: dict) -> dict:
    """
    form (từ modal) chứa các khóa dạng string:
        name, position, department,
        year, month, monthly_salary (số nguyên VND),
        ot_day (ngày tăng ca trong tháng, '' nếu không),
        ot_hours, ot_multiplier,
        ben_name, bank, account, network
    Trả về dict 'data' để đưa vào generate_payslip().
    """
    name = form.get("name","").strip()
    position = form.get("position","").strip()
    department = form.get("department","NSL Click & Work UG").strip()
    year = int(form.get("year", 2026))
    month = int(form.get("month", 5))
    salary = float(form.get("monthly_salary", 0))

    full_days = _parse_weekday_list(form.get("full_days"), [0, 1, 2, 3, 4])
    part_days = _parse_weekday_list(form.get("part_days"), [5])
    full_start = form.get("full_start", "08:30")
    part_start = form.get("part_start", "08:30")

    std = standard_hours(year, month, full_days=full_days, part_days=part_days)
    if std <= 0:
        raise ValueError("Standard hours must be greater than 0. Configure full_days or part_days.")
    rate = hourly_rate(salary, std) if salary else 0

    ot_days = {}
    ot_hrs = 0.0
    ot_pay = 0.0
    ot_day = form.get("ot_day","").strip()
    ot_mult = float(form.get("ot_multiplier", 1.5) or 1.5)
    
    if ot_day:
        d = int(ot_day)
        ot_hrs = float(form.get("ot_hours", 4) or 4)
        ot_st = form.get("ot_start","12:30"); ot_en = form.get("ot_end","16:30")
        ot_days[d] = (ot_st, ot_en, f"{ot_hrs}h", "(*) Overtime")
        ot_pay = overtime_pay(ot_hrs, rate, ot_mult)

    rows = build_schedule_may_like(
        year, month, 
        full_days=full_days, part_days=part_days, 
        full_start=full_start, part_start=part_start, 
        ot_days=ot_days
    )

    month_name = date(year, month, 1).strftime('%B %Y').upper()
    last = calendar.monthrange(year, month)[1]
    
    summary_rows = [
        (f"(1)  Base Salary (monthly, {std}h standard)", "—", f"€{salary:,.2f}"),
        (f"(2)  Hourly rate = €{salary:,.2f} / {std}h", f"€{rate:,.2f}/h", f"€{rate:,.2f}"),
    ]
    total_pay = salary
    
    def fmt_h(h): return f"{int(h)}h" if h == int(h) else f"{h}h"
    
    foots = [f"Standard monthly hours ({fmt_h(std)}) = Configured via selected Full-time / Part-time plan."]
    if ot_day:
        summary_rows.append((f"(3)  Overtime: {ot_hrs}h x €{rate:,.2f} x {ot_mult}", 
                             f"{ot_hrs} x €{rate:,.2f} x {ot_mult}", 
                             f"€{ot_pay:,.2f}"))
        total_pay += ot_pay
        foots.insert(0, f"(*) Overtime on {int(ot_day):02d}/{month:02d}/{year} – rate x{ot_mult}.")

    ben_name = form.get("ben_name", name).upper()
    bank = form.get("bank", "").strip()
    account = form.get("account", "").strip()
    qr_bytes = form.get("qr_bytes")
    qr_path = form.get("qr_path")

    return {
        "logo_path": form.get("logo_path","nsl_logo.png"),
        "qr_path": qr_path,
        "qr_bytes": qr_bytes,
        "title": f"PAYSLIP - {month_name}",
        "period": f"Period: 01/{month:02d}/{year} - {last}/{month:02d}/{year}",
        "issue_date": form.get("issue_date", f"Issue Date: {date.today().strftime('%d/%m/%Y')}"),
        "generated": f"NSL | Payslip generated {date.today().strftime('%d/%m/%Y')} | Confidential",
        "name": name, "position": position, "department": department,
        "salary_line": f"Monthly Salary: €{salary:,.2f}",
        "rate_line": f"Hourly Rate: €{rate:,.2f}/h (€{salary:,.2f} / {fmt_h(std)})",
        "schedule_title": f"WORK SCHEDULE DETAIL - {month_name}",
        "rows": rows,
        "total_hours_text": f"{fmt_h(std + ot_hrs)} ({fmt_h(std)} standard" + (f" + {fmt_h(ot_hrs)} overtime)" if ot_day else ")"),
        "summary_rows": summary_rows,
        "total_label": f"TOTAL SALARY — {month_name}",
        "total_amount": f"€{total_pay:,.2f}",
        "footnotes": foots,
        "payment_rows": [
            ("Beneficiary", ben_name),
            ("Bank", bank),
            ("Account No.", account),
            ("Amount", f"€{total_pay:,.2f}"),
        ],
        "payment_note": "Scan the QR code with your banking app to transfer.",
    }


def _parse_weekday_list(raw, default):
    if raw is None or str(raw).strip() == "":
        return default
    
    res = []
    for x in str(raw).split(","):
        x = x.strip().upper()
        if not x: continue
        if x == 'CN' or x == '8':
            res.append(6)
        else:
            try:
                val = int(x) - 2
                if 0 <= val <= 6:
                    res.append(val)
            except ValueError:
                pass
    return res


