# Multi-stage build for Spring Boot backend
FROM openjdk:17-jdk-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Maven wrapper and pom.xml
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .

# Download dependencies (cached layer)
RUN ./mvnw dependency:go-offline -B

# Copy source code
COPY src src

# Build application
RUN ./mvnw clean package -DskipTests -B

# Extract JAR layers for better caching
RUN java -Djarmode=layertools -jar target/*.jar extract

# Production stage
FROM openjdk:17-jre-slim as production

# Install runtime dependencies and security updates
RUN apt-get update && apt-get install -y \
    curl \
    dumb-init \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r spring && useradd -r -g spring spring

# Set working directory
WORKDIR /app

# Copy application layers from builder stage
COPY --from=builder app/dependencies/ ./
COPY --from=builder app/spring-boot-loader/ ./
COPY --from=builder app/snapshot-dependencies/ ./
COPY --from=builder app/application/ ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R spring:spring /app

# Switch to non-root user
USER spring

# Expose ports
EXPOSE 8080 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8081/actuator/health || exit 1

# Set JVM options
ENV JAVA_OPTS="-Xmx1g -Xms512m -XX:+UseG1GC -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["sh", "-c", "java ${JAVA_OPTS} org.springframework.boot.loader.JarLauncher"]

# Development stage
FROM builder as development

# Install development tools
RUN apt-get update && apt-get install -y \
    vim \
    netcat-traditional \
    && rm -rf /var/lib/apt/lists/*

# Set development environment
ENV SPRING_PROFILES_ACTIVE=development

# Expose debug port
EXPOSE 5005

# Development command with debugging
CMD ["./mvnw", "spring-boot:run", "-Dspring-boot.run.jvmArguments=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005"]