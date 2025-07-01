FROM python:3.13-slim-bookworm

# Ejecutar apt-get y las instalaciones de pip como root
RUN apt-get update -y && \
    apt-get install -y \
    ffmpeg \
    libsndfile1-dev \
    build-essential \
    gfortran \
    libatlas-base-dev \
    libopenblas-dev \
    pkg-config && \
    rm -rf /var/lib/apt/lists/*

# Actualiza pip y sus herramientas de build
RUN pip install --upgrade pip setuptools wheel

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
# Instala las dependencias de tu aplicación
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]