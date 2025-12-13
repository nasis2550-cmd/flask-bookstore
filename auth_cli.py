#!/usr/bin/env python3
"""
Simple command-line demo for register/login and magic-link verify against website.db.
Uses the existing schema from app.py: users (email, password_hash), email_verifications (token).

Commands:
  python auth_cli.py register you@example.com YourPassword
  python auth_cli.py login you@example.com YourPassword
  python auth_cli.py magic-request you@example.com
  python auth_cli.py magic-verify <token>

Note: This does not start the Flask server; it manipulates the same SQLite DB directly.
"""
import os
import sys
import sqlite3
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, 'website.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def ensure_tables(conn):
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS email_verifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    conn.commit()


def register_user(email: str, password: str):
    conn = get_db()
    try:
        ensure_tables(conn)
        cur = conn.cursor()
        # derive a username if not present
        username = email.split('@')[0]
        ph = generate_password_hash(password)
        try:
            # first user becomes admin for convenience
            cur.execute('SELECT COUNT(*) FROM users')
            is_first = cur.fetchone()[0] == 0
            cur.execute(
                'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?,?,?,?)',
                (username, email.lower(), ph, 1 if is_first else 0),
            )
            conn.commit()
            print(f"Registered: {email} (admin={is_first})")
        except sqlite3.IntegrityError:
            print('Email already exists')
    finally:
        conn.close()


def login_user(email: str, password: str):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, username, email, password_hash, is_admin FROM users WHERE email=? COLLATE NOCASE', (email,))
        row = cur.fetchone()
        if not row:
            print('Login failed: user not found')
            return
        if not check_password_hash(row['password_hash'], password):
            print('Login failed: wrong password')
            return
        print(f"Login OK: id={row['id']} username={row['username']} email={row['email']} is_admin={row['is_admin']}")
    finally:
        conn.close()


def magic_request(email: str):
    conn = get_db()
    try:
        ensure_tables(conn)
        cur = conn.cursor()
        cur.execute('SELECT id FROM users WHERE email=? COLLATE NOCASE', (email,))
        u = cur.fetchone()
        if not u:
            # auto-create user for convenience
            username = email.split('@')[0]
            cur.execute('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?,?,?,0)', (username, email.lower(), '',))
            user_id = cur.lastrowid
        else:
            user_id = u['id']
        import secrets
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
        cur.execute('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?,?,?)', (user_id, token, expires))
        conn.commit()
        print('Magic link token generated:')
        print(token)
        print('Simulated URL: http://localhost:5000/api/auth/magic/verify?token=' + token)
    finally:
        conn.close()


def magic_verify(token: str):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute('SELECT id, user_id, expires_at, used_at FROM email_verifications WHERE token=?', (token,))
        row = cur.fetchone()
        if not row:
            print('Invalid token')
            return
        if row['used_at'] is not None:
            print('Token already used')
            return
        try:
            if datetime.utcnow() > datetime.fromisoformat(row['expires_at']):
                print('Token expired')
                return
        except Exception:
            print('Bad expiry format')
            return
        cur.execute('UPDATE email_verifications SET used_at=? WHERE id=?', (datetime.utcnow().isoformat(), row['id']))
        conn.commit()
        cur.execute('SELECT id, username, email FROM users WHERE id=?', (row['user_id'],))
        u = cur.fetchone()
        print(f"Verified and would log in user: id={u['id']} username={u['username']} email={u['email']}")
        print('Note: Real login session is handled by Flask via /api/auth/magic/verify.')
    finally:
        conn.close()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage:')
        print('  python auth_cli.py register <email> <password>')
        print('  python auth_cli.py login <email> <password>')
        print('  python auth_cli.py magic-request <email>')
        print('  python auth_cli.py magic-verify <token>')
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'register' and len(sys.argv) == 4:
        register_user(sys.argv[2], sys.argv[3])
    elif cmd == 'login' and len(sys.argv) == 4:
        login_user(sys.argv[2], sys.argv[3])
    elif cmd == 'magic-request' and len(sys.argv) == 3:
        magic_request(sys.argv[2])
    elif cmd == 'magic-verify' and len(sys.argv) == 3:
        magic_verify(sys.argv[2])
    else:
        print('Invalid arguments')
        sys.exit(2)
