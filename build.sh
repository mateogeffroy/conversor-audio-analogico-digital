#!/usr/bin/env bash

echo "Actualizando apt-get y instalando FFmpeg"
apt-get update -y
apt-get install -y ffmpeg

echo "Instalando dependencias de Python"
pip install --no-cache-dir -r requirements.txt