FROM node:20-bullseye-slim

# Install Python and system dependencies (libzbar0 is required for QR reading)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libzbar0 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy all files
COPY . .

# Install dependencies and build TypeScript
RUN npm ci && npm run build

# Set up Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python requirements
RUN pip install --no-cache-dir -r requirements.txt

# Start the bot
CMD ["npm", "start"]
