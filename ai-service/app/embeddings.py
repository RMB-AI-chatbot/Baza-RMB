"""Text embeddings, computed locally (no API key, data never leaves the server).

Default model: intfloat/multilingual-e5-large (1024 dims, ONNX on CPU via fastembed).
E5 models expect "query: " / "passage: " prefixes; this module adds them.
"""

from __future__ import annotations

import threading

import anyio
import numpy as np

from app.config import get_settings

_model = None
_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from fastembed import TextEmbedding

                s = get_settings()
                _model = TextEmbedding(s.embedding_model, cache_dir=str(s.model_cache_dir))
    return _model


def _is_e5() -> bool:
    return "e5" in get_settings().embedding_model.lower()


def embed_passages(texts: list[str], batch_size: int = 16) -> list[np.ndarray]:
    prefix = "passage: " if _is_e5() else ""
    model = _get_model()
    return list(model.embed([prefix + t for t in texts], batch_size=batch_size))


def embed_query_sync(text: str) -> np.ndarray:
    prefix = "query: " if _is_e5() else ""
    return next(iter(_get_model().embed([prefix + text])))


async def embed_query(text: str) -> np.ndarray:
    # CPU-bound: keep it off the event loop.
    return await anyio.to_thread.run_sync(embed_query_sync, text)


def warm_up() -> None:
    embed_query_sync("warm up")
