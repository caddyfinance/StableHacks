# Single-stage build to avoid COPY --from issues
FROM --platform=linux/amd64 node:20-slim

RUN apt-get update && apt-get install -y openssl curl bzip2 && rm -rf /var/lib/apt/lists/*

# Install Solana CLI
RUN sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)" && \
    echo 'export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"' >> /root/.bashrc

ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"
ENV SOLANA_CLI_PATH="/root/.local/share/solana/install/active_release/bin/solana"

RUN solana --version

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npx nest build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/main"]
