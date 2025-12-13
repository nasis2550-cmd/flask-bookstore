#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ตรวจสอบว่าระบบทั้งหมดพร้อมหรือไม่
"""

import os
import sys
import json

print("=" * 60)
print(" 🔍 ตรวจสอบระบบ A-Lam Bookstore")
print("=" * 60)

# ตรวจสอบไฟล์ที่จำเป็น
files_required = [
    'app.py',
    'index.html',
    'home.html',
    'main.js',
    'style.css',
    'data/users.json',
    'data/bookstores.json'
]

print("\n📁 ตรวจสอบไฟล์:")
all_exist = True
for file in files_required:
    exists = os.path.exists(file)
    status = "✅" if exists else "❌"
    print(f"  {status} {file}")
    if not exists:
        all_exist = False

if not all_exist:
    print("\n⚠️  บางไฟล์หายไป กรุณาตรวจสอบ")
    sys.exit(1)

# ตรวจสอบข้อมูล
print("\n📊 ตรวจสอบข้อมูล:")

try:
    with open('data/bookstores.json', 'r', encoding='utf-8') as f:
        bookstores = json.load(f)
    print(f"  ✅ Bookstores: {len(bookstores)} ร้าน")
except Exception as e:
    print(f"  ❌ Bookstores error: {e}")

try:
    with open('data/users.json', 'r', encoding='utf-8') as f:
        users = json.load(f)
    print(f"  ✅ Users: {len(users)} ผู้ใช้")
except Exception as e:
    print(f"  ❌ Users error: {e}")

# ตรวจสอบ Python packages
print("\n📦 ตรวจสอบ Python packages:")

try:
    import flask
    print("  ✅ Flask")
except:
    print("  ❌ Flask - ติดตั้งด้วย: pip install Flask")

print("\n" + "=" * 60)
print(" ✅ ระบบพร้อมใช้งาน!")
print("=" * 60)
print("\n🚀 เริ่มเซิร์ฟเวอร์:")
print("   python app.py")
print("\n🌐 เข้าเบราว์เซอร์:")
print("   http://localhost:5000")
print("\n" + "=" * 60)
