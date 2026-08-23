FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY scanner.py server.py ./

EXPOSE 8000

CMD ["uv", "run", "python3", "server.py", "--transport", "streamable-http"]
