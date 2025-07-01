# Dockerfile

FROM mambaorg/micromamba:latest

# Instala SOLO las dependencias de APT que no vienen con Conda (principalmente FFmpeg y GStreamer)
# **CAMBIO AQUÍ: Añadir USER root y USER mambauser**
USER root # Cambia a usuario root para ejecutar apt-get
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
USER mambauser # Vuelve al usuario no root por defecto de micromamba

# Crea un entorno Conda/Mamba y activa el entorno base para instalar Python libs
RUN micromamba activate base && \
    micromamba install -y python=3.13 && \
    micromamba clean --all --yes

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN micromamba run -n base pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]