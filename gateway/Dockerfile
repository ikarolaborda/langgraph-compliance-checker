FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre
COPY --from=build /app/target/compliance-gateway-0.1.0.jar /app.jar
USER 1000
ENTRYPOINT ["java", "-jar", "/app.jar"]
