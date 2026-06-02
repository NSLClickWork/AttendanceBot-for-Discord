import sys
import json
import os
from payslip_handler import compute_payslip_data
from payslip_core import generate_payslip

def main():
    input_file = sys.argv[1] if len(sys.argv) > 1 else '-'
    output_file = sys.argv[2] if len(sys.argv) > 2 else '-'

    # Đọc cấu hình từ JSON (stdin hoặc file)
    if input_file == '-':
        form_data = json.load(sys.stdin)
    else:
        with open(input_file, 'r', encoding='utf-8') as f:
            form_data = json.load(f)

    # Tính toán thông tin hiển thị
    pdf_data = compute_payslip_data(form_data)
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pdf_data["logo_path"] = os.path.join(script_dir, "nsl_logo.png")

    # Tạo PDF bytes
    pdf_bytes = generate_payslip(pdf_data)

    # Ghi ra file hoặc stdout
    if output_file == '-':
        sys.stdout.buffer.write(pdf_bytes)
    else:
        with open(output_file, 'wb') as f:
            f.write(pdf_bytes)
        print(f"Successfully generated payslip: {output_file}", file=sys.stderr)

if __name__ == "__main__":
    main()
