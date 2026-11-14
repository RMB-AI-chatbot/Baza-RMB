"""Development launcher: `python -m app.serve [--port 8000] [--reload]`.

On Windows, uvicorn's default event loop (Proactor) is not supported by async psycopg,
so this forces the Selector loop. In Docker/Linux use uvicorn directly (see Dockerfile).
"""

import argparse
import asyncio
import sys

import uvicorn


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--app-dir", default=".", help="folder containing the app package")
    a = p.parse_args()
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    sys.path.insert(0, a.app_dir)
    config = uvicorn.Config("app.main:app", host=a.host, port=a.port, loop="none", log_level="info")
    asyncio.run(uvicorn.Server(config).serve())


if __name__ == "__main__":
    main()
