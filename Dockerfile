# Dockerfile

# Usar la imagen COMPLETA de Python 3.13.
# Esto asegura que 'aifc' esté presente y que audioop-lts encuentre su versión de Python compatible.
FROM python:3.13

# Instala herramientas esenciales de build, gfortran, ffmpeg,
# y las dependencias de OpenBLAS/LAPACK y pkg-config
# La imagen completa ya tiene muchas cosas, pero estas son esenciales para compilar numpy/scipy.
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

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]