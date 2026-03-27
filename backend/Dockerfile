# ── Build stage ──────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npx prisma generate && npx nest build

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y openssl curl bzip2 && rm -rf /var/lib/apt/lists/*

# Install Solana CLI
RUN sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)" && \
    echo 'export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"' >> /root/.bashrc

ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"
ENV SOLANA_CLI_PATH="/root/.local/share/solana/install/active_release/bin/solana"

# Verify solana CLI is available
RUN solana --version

WORKDIR /app

# Copy production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy Prisma schema (needed for prisma db push at startup)
COPY prisma ./prisma
RUN npx prisma generate

# Copy built app and program binary
COPY --from=builder /app/dist ./dist
COPY program-binary ./program-binary

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/main"]
