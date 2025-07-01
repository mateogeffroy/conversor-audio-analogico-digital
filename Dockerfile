FROM python:3.13

# Ejecutar apt-get y las instalaciones de pip como root
# Las imágenes oficiales de Python ya tienen root como usuario predeterminado
# para las instrucciones RUN. No necesitamos 'USER root' explícitamente.
RUN apt-get update -y && \
    apt-get install -y \
    ffmpeg \
    libsndfile1-dev && \
    rm -rf /var/lib/apt/lists/*

# Actualiza pip y sus herramientas de build como root
RUN pip install --upgrade pip setuptools wheel

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
# Instala las dependencias de tu aplicación como root
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

# Opcional pero recomendado para seguridad: Cambiar a un usuario no-root para la ejecución final.
# UID 1000 es el usuario por defecto en muchas imágenes Debian/Ubuntu para apps.
# Si esto causa problemas, puedes omitirlo.
USER 1000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]