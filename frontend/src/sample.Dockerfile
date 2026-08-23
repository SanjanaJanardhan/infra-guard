# Issue: no pinned version, runs as root, hardcoded secret
FROM ubuntu:latest

ENV API_KEY="hardcoded-secret-789"

RUN apt-get update && apt-get install -y curl

ADD https://example.com/app.tar.gz /app/app.tar.gz

WORKDIR /app

EXPOSE 22

CMD ["./start.sh"]
