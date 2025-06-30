# Dockerfile

# Usamos una imagen de Miniconda/Mamba que ya incluye Python y las librerías científicas optimizadas
# Esto resuelve los problemas de compilación de numpy, scipy, librosa, y Numba/LLVMLite.
# Recomiendo 'mambaorg/micromamba:latest-debian' o 'continuumio/miniconda3:latest'
FROM mambaorg/micromamba:latest-debian

# Instala SOLO las dependencias de APT que no vienen con Conda (principalmente FFmpeg y GStreamer)
# micromamba ya viene con 'build-essential' virtualmente, y maneja python, gfortran, etc.
# libsndfile1-dev es para soundfile
RUN apt-get update -y && \
    apt-get install -y \
    ffmpeg \
    libsndfile1-dev \
    libgstreamer1.0-0 \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    gstreamer1.0-x && \
    rm -rf /var/lib/apt/lists/*

# Crea un entorno Conda/Mamba y activa el entorno base para instalar Python libs
# Mamba es mucho más rápido que Conda para resolver entornos
RUN micromamba activate base && \
    micromamba install -y python=3.13 && \
    micromamba clean --all --yes

WORKDIR /app

# Copia requirements.txt y usa pip (dentro del entorno micromamba)
COPY backend/requirements.txt ./requirements.txt
RUN micromamba run -n base pip install --no-cache-dir -r requirements.txt

# Copia el resto del código de tu aplicación
COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]