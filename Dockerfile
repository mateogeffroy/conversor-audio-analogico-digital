# Dockerfile

# Usamos una imagen base de Ubuntu que sí tiene usuario 'root' por defecto para apt-get
FROM ubuntu:22.04

# Instala todas las dependencias de APT como root (Ubuntu por defecto es root para RUN)
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    wget \
    bzip2 \
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

# Instalar Micromamba
ENV MAMBA_ROOT_PREFIX=/opt/conda
ENV PATH=$MAMBA_ROOT_PREFIX/bin:$PATH

# Configurar y crear el entorno Python con micromamba
# Aquí instalamos Python 3.13 y las librerías científicas optimizadas
RUN micromamba shell init -p $MAMBA_ROOT_PREFIX -s bash -a && \
    micromamba install -y -p $MAMBA_ROOT_PREFIX \
    python=3.13 \
    numpy \
    scipy \
    librosa && \
    micromamba clean --all --yes # Esto debe ir en la misma instrucción RUN con &&

# Copiar requirements.txt y instalar el resto de las dependencias con pip
WORKDIR /app
RUN micromamba run -p $MAMBA_ROOT_PREFIX pip install --upgrade pip setuptools wheel
COPY backend/requirements.txt ./requirements.txt
RUN micromamba run -p $MAMBA_ROOT_PREFIX pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY backend/ .

EXPOSE 5000

# El comando CMD debe ejecutar gunicorn DENTRO del entorno micromamba
CMD ["micromamba", "run", "-p", "/opt/conda", "gunicorn", "app:app", "--bind", "0.0.0.0:5000"]