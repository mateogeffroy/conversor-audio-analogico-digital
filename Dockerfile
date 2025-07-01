FROM python:3.13

USER root
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gfortran \
    libatlas-base-dev \
    pkg-config \
    ffmpeg \
    libsndfile1-dev && \
    rm -rf /var/lib/apt/lists/*
USER python

WORKDIR /app

RUN pip install --upgrade pip setuptools wheel
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]