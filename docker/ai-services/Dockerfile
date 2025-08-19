# Multi-stage build for Python AI services
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install dependencies
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim as production

# Install runtime dependencies and security updates
RUN apt-get update && apt-get install -y \
    curl \
    dumb-init \
    libgomp1 \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r aiuser && useradd -r -g aiuser aiuser

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Set environment variables
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Set working directory
WORKDIR /app

# Copy application code
COPY --chown=aiuser:aiuser . .

# Create necessary directories
RUN mkdir -p /app/logs /app/models /app/training_data && \
    chown -R aiuser:aiuser /app

# Switch to non-root user
USER aiuser

# Expose ports
EXPOSE 5000 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["python", "app.py"]

# Development stage
FROM python:3.11-slim as development

# Install development dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    vim \
    netcat-traditional \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements files
COPY requirements.txt requirements-dev.txt ./

# Install dependencies
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -r requirements-dev.txt

# Copy source code
COPY . .

# Create directories
RUN mkdir -p logs models training_data

# Expose ports (including debug)
EXPOSE 5000 5001 5678

# Set development environment
ENV PYTHON_ENV=development
ENV FLASK_ENV=development
ENV FLASK_DEBUG=1

# Start with debugging
CMD ["python", "-m", "debugpy", "--listen", "0.0.0.0:5678", "--wait-for-client", "app.py"]