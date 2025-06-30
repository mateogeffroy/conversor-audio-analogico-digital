# Dockerfile

FROM python:3.12-slim

# Instala herramientas esenciales de build, gfortran, ffmpeg,
# y las dependencias de OpenBLAS/LAPACK y pkg-config
# Nuevas adiciones para audioread/gstreamer
RUN apt-get update -y && \
    apt-get install -y \
    build-essential \
    gfortran \
    ffmpeg \
    libopenblas-dev \
    pkg-config \
    cmake \
    libgstreamer1.0-0 \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    gstreamer1.0-x && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Primero, actualiza pip y asegúrate de que setuptools y wheel estén presentes
# Esto es CRÍTICO para la compilación de paquetes con pyproject.toml
RUN pip install --upgrade pip setuptools wheel

COPY backend/requirements.txt ./requirements.txt
# Luego, instala las dependencias de tu aplicación
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]