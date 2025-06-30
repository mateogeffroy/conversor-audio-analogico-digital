# Dockerfile

FROM python:3.13

# Instala herramientas esenciales de build, gfortran, ffmpeg,
# y las dependencias de OpenBLAS/LAPACK y pkg-config
# **En este punto, NO se habían añadido las dependencias de GStreamer**
RUN apt-get update -y && \
    apt-get install -y \
    build-essential \
    gfortran \
    ffmpeg \
    libopenblas-dev \
    pkg-config \
    cmake && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Primero, actualiza pip y asegúrate de que setuptools y wheel estén presentes
# Esto es CRÍTICO para la compilación de paquetes con pyproject.toml
# Esta línea se añadió para resolver el error 'setuptools.build_meta'
RUN pip install --upgrade pip setuptools wheel

COPY backend/requirements.txt ./requirements.txt
# Luego, instala las dependencias de tu aplicación
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]