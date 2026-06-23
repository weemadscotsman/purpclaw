import sqlite3

# Create database and connect
conn = sqlite3.connect('users.db')
cursor = conn.cursor()

# Create User table
cursor.execute('''
    CREATE TABLE IF NOT EXISTS User (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )
''')

# Insert sample data
users = [
    ('Alice',),
    ('Bob',),
    ('Charlie',),
    ('Diana',),
]

cursor.executemany('INSERT INTO User (name) VALUES (?)', users)
conn.commit()

# Verify
cursor.execute('SELECT * FROM User')
print("Users in database:")
for row in cursor.fetchall():
    print(f"  ID: {row[0]}, Name: {row[1]}")

conn.close()
print("\nDatabase 'users.db' created successfully!")
