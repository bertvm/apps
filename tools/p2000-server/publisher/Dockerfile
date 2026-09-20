FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends rtl-sdr multimon-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY __init__.py __main__.py publisher.py regions.py services.py ./publisher/

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "publisher"]
