FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app

# Copy gradle wrapper and config first to cache dependencies
COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .

# Grant execute permission and resolve dependencies (optional optimization step)
RUN chmod +x ./gradlew

# Copy source code
COPY src src

# Build the application
RUN ./gradlew bootJar -x test

# Runtime stage
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Add a non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# Copy the built jar from the builder stage
COPY --from=builder /app/build/libs/*.jar app.jar

# Expose port
EXPOSE 8080

# Environment variables could be set here, but usually passed when running container
# ENV DATABASE_URL=...
# ENV DB_USERNAME=...
# ENV DB_PASSWORD=...

# Run the jar
ENTRYPOINT ["java", "-jar", "app.jar"]
