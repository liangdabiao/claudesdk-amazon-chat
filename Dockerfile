FROM docker.io/cloudflare/sandbox:0.10.3

RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir requests openpyxl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY server/ ./server/
COPY tsconfig.server.json ./
COPY .claude/ ./.claude/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

COPY .env ./

RUN mkdir -p uploads reports review-analysis-reports

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
