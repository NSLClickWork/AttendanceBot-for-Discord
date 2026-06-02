"""
payslip_core.py
----------------
Lõi tạo bảng lương NSL. Dùng được độc lập hoặc gọi từ Discord bot.

Hàm chính:
    generate_payslip(data: dict) -> bytes   # trả về nội dung file PDF

Cài đặt 1 lần:
    pip install reportlab pillow
Cần có file logo: nsl_logo.png (đặt cạnh file này, hoặc truyền đường dẫn qua data["logo_path"])
"""

import io
from datetime import date
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                 Spacer, Table, TableStyle, Image as RLImage)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT

NSL_RED=colors.HexColor('#C0392B'); NSL_DARK=colors.HexColor('#1a1a1a')
NSL_GRAY=colors.HexColor('#555555'); NSL_LIGHT=colors.HexColor('#f5f5f5')
NSL_MID=colors.HexColor('#e8e8e8'); ROW_OT=colors.HexColor('#fde8e8'); WHITE=colors.white
PAGE_W,PAGE_H=A4; MARGIN=14*mm; CONTENT_W=PAGE_W-2*MARGIN
_styles=getSampleStyleSheet()
def _S(n,**k): return ParagraphStyle(n,parent=_styles['Normal'],**k)


# ---------------------------------------------------------------
#  TIỆN ÍCH TÍNH LƯƠNG  (dùng được riêng, ví dụ từ dữ liệu chấm công)
# ---------------------------------------------------------------
def standard_hours(year, month, full_days=None, part_days=None):
    """Giờ công chuẩn của tháng: Ngày được check Full + 8h, Part + 4h."""
    full_days = [0, 1, 2, 3, 4] if full_days is None else full_days
    part_days = [5] if part_days is None else part_days
    import calendar
    total = 0
    for d in range(1, calendar.monthrange(year, month)[1] + 1):
        wd = date(year, month, d).weekday()
        if wd in full_days:
            total += 8
        elif wd in part_days:
            total += 4
    return total


def hourly_rate(monthly_salary, std_hours):
    if std_hours <= 0:
        raise ValueError("std_hours must be greater than 0")
    return monthly_salary / std_hours


def overtime_pay(ot_hours, rate, multiplier=1.5):
    return ot_hours * rate * multiplier


def fmt_vnd(n):
    return f"{round(n):,} VND"


def build_schedule_may_like(year, month, full_days=None, part_days=None,
                            full_start='08:30', part_start='08:30',
                            ot_days=None):
    """
    Tạo list dòng chấm công cho cả tháng.
    """
    import calendar
    thu = {0:'Monday',1:'Tuesday',2:'Wednesday',3:'Thursday',4:'Friday',5:'Saturday',6:'Sunday'}
    ot_days = ot_days or {}
    full_days = full_days or []
    part_days = part_days or []
    rows = []
    
    def add_hrs(st, hrs):
        try:
            h, m = map(int, st.split(':'))
            h = (h + hrs) % 24
            return f"{h:02d}:{m:02d}"
        except Exception:
            return ""
    
    for d in range(1, calendar.monthrange(year, month)[1] + 1):
        dd = date(year, month, d); wd = dd.weekday()
        if wd == 6:
            continue
        ds = dd.strftime('%d/%m/%Y')
        if wd in full_days:
            rows.append((ds, thu[wd], 'Full Day', full_start, add_hrs(full_start, 8), '8h', '', False))
        elif wd in part_days:
            rows.append((ds, thu[wd], 'Morning', part_start, add_hrs(part_start, 4), '4h', '', False))
            
        if d in ot_days:
            st, en, hrs, note = ot_days[d]
            rows.append((ds, thu[wd], 'OVERTIME', st, en, hrs, note, True))
    return rows


# ---------------------------------------------------------------
#  TẠO PDF
# ---------------------------------------------------------------
def generate_payslip(data: dict) -> bytes:
    """
    Tạo bảng lương PDF, trả về bytes.

    data = {
        "logo_path": "nsl_logo.png",          # optional
        "qr_path": "qr.png" hoặc "qr_bytes": b"...",  # optional
        "title": "PAYSLIP - MAY 2026",
        "period": "Period: 01/05/2026 - 31/05/2026",
        "issue_date": "Issue Date: 30/05/2026",
        "generated": "NSL | Payslip generated 30/05/2026 | Confidential",
        "name": "Le Trung Tin",
        "position": "Candidate Manager",
        "department": "NSL Click & Work UG",
        "salary_line": "Monthly Salary: 18,000,000 VND",
        "rate_line": "Hourly Rate: 95,745 VND/h (18,000,000 / 188h)",
        "schedule_title": "WORK SCHEDULE DETAIL - MAY 2026",
        "rows": [(date, day, type, start, end, hours, note, highlight), ...],
        "total_hours_text": "192h (188h standard + 4h overtime)",
        "summary_rows": [(label, formula, amount), ...],
        "total_label": "TOTAL SALARY — MAY 2026",
        "total_amount": "18,574,468 VND",
        "footnotes": ["...", "..."],
        "payment_rows": [(key, value), ...],
        "payment_note": "Scan the QR code ...",
    }
    """
    cell=_S('c',fontName='Helvetica',fontSize=7,textColor=NSL_DARK,leading=9)
    cell_ot=_S('co',fontName='Helvetica-Bold',fontSize=7,textColor=NSL_RED,leading=9)
    sec_head=_S('s',fontName='Helvetica-Bold',fontSize=9.5,textColor=WHITE,leading=12)
    tbl_head=_S('t',fontName='Helvetica-Bold',fontSize=8,textColor=NSL_DARK,leading=10)
    sum_label=_S('sl',fontName='Helvetica',fontSize=9,textColor=NSL_DARK,leading=12)
    sum_formula=_S('sf',fontName='Helvetica-Oblique',fontSize=8,textColor=NSL_GRAY,leading=11)
    sum_amount=_S('sa',fontName='Helvetica-Bold',fontSize=9,textColor=NSL_RED,leading=12,alignment=TA_RIGHT)
    total_label_s=_S('tl',fontName='Helvetica-Bold',fontSize=12,textColor=WHITE,leading=15)
    total_amt_s=_S('ta',fontName='Helvetica-Bold',fontSize=14,textColor=WHITE,leading=17,alignment=TA_RIGHT)
    foot=_S('f',fontName='Helvetica-Oblique',fontSize=7.5,textColor=NSL_GRAY,leading=10)

    logo_path = data.get("logo_path", "nsl_logo.png")

    def hf(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(NSL_RED); canvas.rect(0,PAGE_H-28*mm,PAGE_W,28*mm,fill=1,stroke=0)
        try:
            canvas.drawImage(logo_path,10*mm,PAGE_H-27*mm,width=72*mm,height=25*mm,
                             preserveAspectRatio=True,mask='auto')
        except Exception:
            pass
        canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold',15)
        canvas.drawString(85*mm,PAGE_H-14*mm,data.get("title",""))
        canvas.setFont('Helvetica',9); canvas.drawString(85*mm,PAGE_H-21*mm,data.get("period",""))
        canvas.setFillColor(NSL_RED); canvas.rect(0,0,PAGE_W,10*mm,fill=1,stroke=0)
        canvas.setFillColor(WHITE); canvas.setFont('Helvetica',7)
        canvas.drawCentredString(PAGE_W/2,3.5*mm,data.get("generated",""))
        canvas.restoreState()

    story=[]
    emp=[[Paragraph(f'<b>{data.get("name","")}</b>',_S('n',fontName='Helvetica-Bold',fontSize=11,textColor=NSL_DARK)),
          Paragraph(data.get("issue_date",""),_S('r',fontSize=9,textColor=NSL_GRAY,alignment=TA_RIGHT))],
         [Paragraph(f'Position: {data.get("position","")}',_S('p',fontSize=9,textColor=NSL_GRAY)),
          Paragraph(data.get("salary_line",""),_S('r2',fontSize=9,textColor=NSL_GRAY,alignment=TA_RIGHT))],
         [Paragraph(f'Department: {data.get("department","")}',_S('d',fontSize=9,textColor=NSL_GRAY)),
          Paragraph(data.get("rate_line",""),_S('r3',fontSize=9,textColor=NSL_GRAY,alignment=TA_RIGHT))]]
    et=Table(emp,colWidths=[CONTENT_W*0.5,CONTENT_W*0.5])
    et.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NSL_LIGHT),('LINEBEFORE',(0,0),(0,-1),2,NSL_RED),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),('LEFTPADDING',(0,0),(-1,-1),8),
        ('RIGHTPADDING',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story.append(et); story.append(Spacer(1,3*mm))

    def secbar(txt):
        t=Table([[Paragraph(txt,sec_head)]],colWidths=[CONTENT_W])
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NSL_RED),('TOPPADDING',(0,0),(-1,-1),3),
            ('BOTTOMPADDING',(0,0),(-1,-1),3),('LEFTPADDING',(0,0),(-1,-1),6)]))
        return t
    story.append(secbar(data.get("schedule_title","WORK SCHEDULE DETAIL")))

    rows_data = data.get("rows", [])
    rows=[[Paragraph(h,tbl_head) for h in ['#','Date','Day','Type','Start','End','Hours','Notes']]]
    meta=[]; idx=1
    for r in rows_data:
        dt,day,typ,st,en,hrs,note,hl = r
        sy=cell_ot if hl else cell
        rows.append([Paragraph(str(idx),sy),Paragraph(str(dt),sy),Paragraph(str(day),sy),Paragraph(str(typ),sy),
                     Paragraph(str(st),sy),Paragraph(str(en),sy),Paragraph(str(hrs),sy),Paragraph(str(note),sy)])
        meta.append(hl); idx+=1
    cw=[9*mm,24*mm,24*mm,22*mm,18*mm,18*mm,16*mm,CONTENT_W-(9+24+24+22+18+18+16)*mm]
    sc=Table(rows,colWidths=cw,repeatRows=1)
    ts=[('BACKGROUND',(0,0),(-1,0),NSL_MID),('TOPPADDING',(0,0),(-1,-1),1.0),('BOTTOMPADDING',(0,0),(-1,-1),1.0),
        ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LINEBELOW',(0,0),(-1,-1),0.3,NSL_MID)]
    for i,hl in enumerate(meta):
        r=i+1
        c=ROW_OT if hl else (NSL_LIGHT if r%2==0 else WHITE)
        ts.append(('BACKGROUND',(0,r),(-1,r),c))
    sc.setStyle(TableStyle(ts)); story.append(sc)

    th=Table([[Paragraph('TOTAL HOURS',_S('thl',fontName='Helvetica-Bold',fontSize=9,textColor=WHITE)),
               Paragraph(data.get("total_hours_text",""),_S('thv',fontName='Helvetica-Bold',fontSize=9,textColor=WHITE,alignment=TA_RIGHT))]],
              colWidths=[CONTENT_W*0.32,CONTENT_W*0.68])
    th.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NSL_DARK),('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story.append(th); story.append(Spacer(1,2*mm))

    story.append(secbar('SALARY SUMMARY'))
    sr=[[Paragraph(lab,sum_label),Paragraph(form,sum_formula),Paragraph(amt,sum_amount)]
        for (lab,form,amt) in data.get("summary_rows",[])]
    st_=Table(sr,colWidths=[CONTENT_W*0.5,CONTENT_W*0.27,CONTENT_W*0.23])
    sst=[('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LINEBELOW',(0,0),(-1,-1),0.3,NSL_MID)]
    for i in range(len(sr)):
        sst.append(('BACKGROUND',(0,i),(-1,i), NSL_LIGHT if i%2==0 else WHITE))
    st_.setStyle(TableStyle(sst)); story.append(st_)

    gt=Table([[Paragraph(data.get("total_label",""),total_label_s),
               Paragraph(data.get("total_amount",""),total_amt_s)]],
             colWidths=[CONTENT_W*0.55,CONTENT_W*0.45])
    gt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),NSL_RED),('TOPPADDING',(0,0),(-1,-1),7),
        ('BOTTOMPADDING',(0,0),(-1,-1),7),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story.append(gt); story.append(Spacer(1,2*mm))
    for fn in data.get("footnotes",[]):
        story.append(Paragraph(fn,foot))
    story.append(Spacer(1,2*mm))

    story.append(secbar('PAYMENT INFORMATION'))
    pay_label=_S('pl',fontName='Helvetica',fontSize=8,textColor=NSL_GRAY,leading=11)
    pay_val=_S('pv',fontName='Helvetica-Bold',fontSize=8.5,textColor=NSL_DARK,leading=11)
    info_rows=[[Paragraph(k,pay_label),Paragraph(v,pay_val)] for (k,v) in data.get("payment_rows",[])]
    info_tbl=Table(info_rows,colWidths=[26*mm,CONTENT_W-26*mm-44*mm])
    info_tbl.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,-2),0.3,NSL_MID),('TOPPADDING',(0,0),(-1,-1),2),
        ('BOTTOMPADDING',(0,0),(-1,-1),2),('LEFTPADDING',(0,0),(-1,-1),0),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))

    qr_img=None
    if data.get("qr_bytes"):
        qr_img=RLImage(io.BytesIO(data["qr_bytes"]),width=34*mm,height=34*mm)
    elif data.get("qr_path"):
        path_or_url = data["qr_path"]
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            try:
                import urllib.request
                # Download QR image directly into memory using urllib with custom user-agent
                req = urllib.request.Request(
                    path_or_url, 
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req) as response:
                    img_data = response.read()
                qr_img = RLImage(io.BytesIO(img_data), width=34*mm, height=34*mm)
            except Exception as e:
                import sys
                print(f"Failed to load QR from URL {path_or_url}: {e}", file=sys.stderr)
                qr_img = None
        else:
            try: qr_img=RLImage(path_or_url,width=34*mm,height=34*mm)
            except Exception: qr_img=None
    right = qr_img if qr_img else Paragraph('',foot)
    pay_block=Table([[info_tbl,right]],colWidths=[CONTENT_W-44*mm,44*mm])
    pay_block.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(0,0),8),('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('ALIGN',(1,0),(1,0),'RIGHT'),('BACKGROUND',(0,0),(-1,-1),NSL_LIGHT)]))
    story.append(pay_block); story.append(Spacer(1,2*mm))
    story.append(Paragraph(data.get("payment_note",""),foot))

    buf=io.BytesIO()
    doc=BaseDocTemplate(buf,pagesize=A4,leftMargin=MARGIN,rightMargin=MARGIN,
        topMargin=32*mm,bottomMargin=14*mm)
    fr=Frame(MARGIN,14*mm,CONTENT_W,PAGE_H-32*mm-14*mm,id='m',
             leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='m',frames=[fr],onPage=hf)])
    doc.build(story)
    return buf.getvalue()


# Demo nhanh khi chạy trực tiếp
if __name__ == "__main__":
    rows = build_schedule_may_like(2026, 5, ot_days={9:('12:30','16:30','4h','(*) Overtime')})
    std = standard_hours(2026, 5)            # 188
    rate = hourly_rate(18_000_000, std)      # 95,745
    ot = overtime_pay(4, rate, 1.5)          # 574,468
    data = {
        "title":"PAYSLIP - MAY 2026","period":"Period: 01/05/2026 - 31/05/2026",
        "issue_date":"Issue Date: 30/05/2026",
        "generated":"NSL | Payslip generated 30/05/2026 | Confidential",
        "name":"Le Trung Tin","position":"Candidate Manager","department":"NSL Click & Work UG",
        "salary_line":"Monthly Salary: 18,000,000 VND",
        "rate_line":f"Hourly Rate: {rate:,.0f} VND/h (18,000,000 / {std}h)",
        "schedule_title":"WORK SCHEDULE DETAIL - MAY 2026",
        "rows":rows,
        "total_hours_text":f"{std+4}h ({std}h standard + 4h overtime)",
        "summary_rows":[
            ("(1)  Base Salary (monthly, %dh standard)"%std,"—","18,000,000 VND"),
            ("(2)  Hourly rate = 18,000,000 / %dh"%std, f"{rate:,.0f} VND/h", fmt_vnd(rate)),
            ("(3)  Overtime 09/05: 4h x %s x 1.5"%f"{rate:,.0f}", f"4 x {rate:,.0f} x 1.5", fmt_vnd(ot)),
        ],
        "total_label":"TOTAL SALARY — MAY 2026",
        "total_amount":fmt_vnd(18_000_000+ot),
        "footnotes":["(*) Overtime on 09/05/2026 (Saturday afternoon) – rate x1.5.",
                     "Standard monthly hours (%dh) = Mon-Fri x 8h + Sat x 4h, Sundays excluded."%std],
        "payment_rows":[("Beneficiary","LE TRUNG TIN"),("Bank","MB Bank (MB)"),
                        ("Account No.","779767899999"),("Amount",fmt_vnd(18_000_000+ot)),
                        ("Network","VietQR / Napas 247")],
        "payment_note":"Scan the QR code with any VietQR / Napas 247 banking app to transfer.",
    }
    pdf = generate_payslip(data)
    with open("payslip_demo.pdf","wb") as f:
        f.write(pdf)
    print("Wrote payslip_demo.pdf", len(pdf), "bytes")
