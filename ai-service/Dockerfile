FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv
# Exact versions tested in development (regenerate: uv pip freeze > requirements.lock)
COPY requirements.lock ./
RUN pip install -r requirements.lock
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-deps .
# Evaluation set (python -m eval.run_eval), runs from /srv
COPY eval ./eval

RUN useradd --create-home --uid 10001 baza && mkdir -p /models /data && chown -R baza /models /data
USER baza

EXPOSE 8000
# One worker per container keeps the embedding model in memory once (~2.5 GB RAM).
# Scale with more containers rather than more workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]
