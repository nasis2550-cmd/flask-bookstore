from flask import Flask, render_template, request, redirect, url_for
import sqlite3
import os

app = Flask(__name__)

# Database setup
DATABASE = 'bookstore.db'

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the database with sample schema"""
    if not os.path.exists(DATABASE):
        conn = get_db()
        cursor = conn.cursor()
        
        # Create books table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                price REAL NOT NULL,
                description TEXT
            )
        ''')
        
        # Insert sample data
        sample_books = [
            ('The Great Gatsby', 'F. Scott Fitzgerald', 10.99, 'A classic American novel set in the Jazz Age'),
            ('To Kill a Mockingbird', 'Harper Lee', 12.99, 'A gripping tale of racial injustice and childhood innocence'),
            ('1984', 'George Orwell', 13.99, 'A dystopian social science fiction novel'),
            ('Pride and Prejudice', 'Jane Austen', 9.99, 'A romantic novel of manners'),
            ('The Catcher in the Rye', 'J.D. Salinger', 11.99, 'A story about teenage rebellion and angst')
        ]
        
        cursor.executemany(
            'INSERT INTO books (title, author, price, description) VALUES (?, ?, ?, ?)',
            sample_books
        )
        
        conn.commit()
        conn.close()
        print('Database initialized successfully!')

@app.route('/')
def home():
    """Home page showing all books"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM books')
    books = cursor.fetchall()
    conn.close()
    return render_template('home.html', books=books)

@app.route('/book/<int:book_id>')
def book_detail(book_id):
    """Show details for a specific book"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM books WHERE id = ?', (book_id,))
    book = cursor.fetchone()
    conn.close()
    return render_template('home.html', books=[book] if book else [])

if __name__ == '__main__':
    # Initialize database on first run
    init_db()
    
    # Run the Flask application
    app.run(debug=True, host='0.0.0.0', port=5000)
