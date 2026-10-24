import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = os.getenv("FLATAUDIT_DB_PATH", str(BASE_DIR / "flataudit.db"))

CORS_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"  # Allow extension origin chrome-extension://*
]
