FROM python:3.13-slim-bookworm

# Ejecutar apt-get y las instalaciones de pip como root
# La imagen oficial python:3.13 ya tiene root como usuario predeterminado para las instrucciones RUN.
RUN apt-get update -y && \
    apt-get install -y \
    ffmpeg \
    libsndfile1-dev \
    build-essential \
    gfortran \
    libatlas-base-dev \
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

# Opcional: Si el CMD falla por permisos, puedes probar con 'USER 1000'
# o simplemente ejecutar como root si no hay problemas de seguridad críticos.
# Pero el error "unable to find user python" no es del CMD, es del RUN de pip.
# Mantenemos este CMD, debería ejecutarse como root por defecto.
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]