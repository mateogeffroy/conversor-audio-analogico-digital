# Dockerfile

FROM python:3.13

# Instala herramientas esenciales de build, gfortran, ffmpeg,
# y las dependencias de OpenBLAS/LAPACK y pkg-config
# **NUEVAS ADICIONES para audioread/gstreamer**
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

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"] 