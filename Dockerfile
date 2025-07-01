FROM python:3.13-slim-bookworm

RUN apt-get update -y && \
    apt-get install -y \
    ffmpeg \
    libsndfile1-dev \
    build-essential \
    gfortran \
    libatlas-base-dev \
    libopenblas-dev \
    pkg-config \
    python3-dev && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip setuptools wheel

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "1", "--timeout", "120"]